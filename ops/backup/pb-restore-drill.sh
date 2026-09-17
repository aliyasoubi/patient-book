#!/bin/bash
#
# Prove that the newest backup actually restores.
#
# An untested backup is a belief, not a recovery plan. This restores the most
# recent dump into a throwaway database, compares its row counts against the
# live one, and drops it again. It never writes to the live database — see the
# guard below, which is the single most important line in this file.
#
# Usage:  ./pb-restore-drill.sh [path/to/backup.sql.gz.enc]
# Exit codes: 0 pass, non-zero fail.

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

set -a
[[ -f "$REPO_ROOT/.env" ]] && . "$REPO_ROOT/.env"
[[ -f "$REPO_ROOT/ops/backup/backup.env" ]] && . "$REPO_ROOT/ops/backup/backup.env"
set +a

readonly DB_HOST="${DB_HOST:-localhost}"
readonly DB_PORT="${DB_PORT:-5432}"
readonly DB_USER="${DB_USER:-dental}"
readonly DB_NAME="${DB_NAME:-patient_book}"

# Same `PB_BACKUP_DIR` as pb-backup.sh, so the drill always tests the
# directory the backups are actually being written to.
readonly BACKUP_DIR="${PB_BACKUP_DIR:-$HOME/PatientBookBackups}"
readonly KEY_FILE="${PB_BACKUP_KEY:-$HOME/.patient-book/backup.key}"
readonly SCRATCH_DB="${PB_SCRATCH_DB:-patient_book_restore_check}"

# ── The guard ──────────────────────────────────────────────────────────────
# The dump is taken with --clean, so restoring it into the live database would
# DROP every table before recreating them. If a typo or a stray backup.env
# ever pointed the scratch name at the real database, that would destroy the
# practice's records. Refuse, loudly, before touching anything.
if [[ "$SCRATCH_DB" == "$DB_NAME" ]]; then
  echo "REFUSING: scratch database name is the live database ($DB_NAME)." >&2
  echo "The drill only ever restores into a throwaway copy." >&2
  exit 2
fi

export PGPASSWORD="${DB_PASSWORD:-}"
psql_live() { psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "$1"; }
psql_scratch() { psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$SCRATCH_DB" -tAc "$1"; }

cleanup() {
  dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$SCRATCH_DB" 2>/dev/null || true
}
trap cleanup EXIT

# -- pick the backup --------------------------------------------------------
if [[ $# -ge 1 ]]; then
  BACKUP="$1"
else
  BACKUP="$(ls -1t "$BACKUP_DIR"/daily/*.enc 2>/dev/null | head -1 || true)"
fi

[[ -n "${BACKUP:-}" && -f "$BACKUP" ]] || { echo "no backup found to test" >&2; exit 1; }
[[ -s "$KEY_FILE" ]] || { echo "missing encryption key $KEY_FILE" >&2; exit 1; }

echo "Testing restore of: $(basename "$BACKUP")"
echo

# -- restore into a throwaway database --------------------------------------
cleanup
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$SCRATCH_DB"

# ON_ERROR_STOP makes a broken dump fail here rather than producing a
# half-populated database that then "passes" a row-count check.
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$BACKUP" \
   | gunzip \
   | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$SCRATCH_DB" \
          -v ON_ERROR_STOP=1 --quiet >/dev/null 2>/tmp/pb-drill-errors.txt; then
  echo "RESTORE FAILED — psql reported:" >&2
  tail -20 /tmp/pb-drill-errors.txt >&2
  exit 1
fi

# -- compare against the live database --------------------------------------
readonly TABLES="patients implant_cases ortho_cases surgery_queue patient_treatments treatment_types referral_sources users audit_logs"
failures=0
printf '  %-22s %10s %10s   %s\n' TABLE LIVE RESTORED RESULT
for table in $TABLES; do
  live="$(psql_live "SELECT count(*) FROM $table;" 2>/dev/null || echo ERR)"
  restored="$(psql_scratch "SELECT count(*) FROM $table;" 2>/dev/null || echo ERR)"
  if [[ "$live" == "$restored" && "$live" != "ERR" ]]; then
    printf '  %-22s %10s %10s   ok\n' "$table" "$live" "$restored"
  else
    printf '  %-22s %10s %10s   MISMATCH\n' "$table" "$live" "$restored"
    failures=$((failures + 1))
  fi
done

echo
if [[ $failures -gt 0 ]]; then
  echo "DRILL FAILED — $failures table(s) did not match." >&2
  exit 1
fi

date '+%Y-%m-%d %H:%M:%S' >"$BACKUP_DIR/last-drill"
echo "DRILL PASSED — $(basename "$BACKUP") restores cleanly and matches the live database."
