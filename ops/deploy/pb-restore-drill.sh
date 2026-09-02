#!/bin/bash
#
# Prove the newest backup still restores. A backup that has never been restored
# is not a recovery plan.
#
# Restores into a throwaway database inside the Postgres container, checks that
# the patient table came back with rows, and drops it again. The live database
# is never touched.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"

set -a
[[ -f "$REPO_ROOT/.env" ]] && . "$REPO_ROOT/.env"
set +a

readonly DB_USER="${DB_USER:-dental}"
readonly PB_HOME_DIR="${PB_HOME_DIR:-/srv/patient-book/home}"

readonly CONFIGURED_DIR_FILE="$PB_HOME_DIR/.patient-book/backup-dir"
if [[ -z "${PB_BACKUP_DIR:-}" && -s "$CONFIGURED_DIR_FILE" ]]; then
  PB_BACKUP_DIR="$(head -n 1 "$CONFIGURED_DIR_FILE")"
fi
readonly BACKUP_DIR="${PB_BACKUP_DIR:-$PB_HOME_DIR/PatientBookBackups}"
readonly KEY_FILE="${PB_BACKUP_KEY:-/etc/patient-book/backup.key}"
readonly DRILL_DB="patient_book_drill_$$"

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }
die() { echo "drill failed: $*" >&2; exit 1; }

[[ -s "$KEY_FILE" ]] || die "no encryption key at $KEY_FILE"

NEWEST="$(ls -1t "$BACKUP_DIR"/daily/*.enc 2>/dev/null | head -n 1 || true)"
[[ -n "$NEWEST" ]] || die "no backups found in $BACKUP_DIR/daily"
echo "restoring $(basename "$NEWEST") into $DRILL_DB"

cleanup() {
  compose exec -T db psql --username="$DB_USER" --dbname=postgres \
    -c "DROP DATABASE IF EXISTS \"$DRILL_DB\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT

compose exec -T db psql --username="$DB_USER" --dbname=postgres \
  -c "CREATE DATABASE \"$DRILL_DB\"" >/dev/null || die "could not create the drill database"

# `-v ON_ERROR_STOP=1` is what turns a broken dump into a failed drill rather
# than a long list of ignored errors and a cheerful exit code.
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$NEWEST" \
   | gunzip \
   | compose exec -T db psql --username="$DB_USER" --dbname="$DRILL_DB" \
       -v ON_ERROR_STOP=1 --quiet >/dev/null; then
  die "restore reported errors"
fi

PATIENTS="$(compose exec -T db psql --username="$DB_USER" --dbname="$DRILL_DB" \
  -tAc 'SELECT count(*) FROM patients' | tr -d '[:space:]')"
[[ "$PATIENTS" =~ ^[0-9]+$ ]] || die "could not count patients after restore"
[[ "$PATIENTS" -gt 0 ]] || die "restored database has no patient rows"

date '+%Y-%m-%d %H:%M:%S' >"$BACKUP_DIR/last-drill"
chmod 644 "$BACKUP_DIR/last-drill"
echo "drill ok: $PATIENTS patient rows restored from $(basename "$NEWEST")"
