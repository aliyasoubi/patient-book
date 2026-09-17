#!/bin/bash
#
# Encrypted nightly backup of the patient-book database.
#
# Writes a plain-SQL dump, gzips it, encrypts it with AES-256, and keeps
# 7 daily + 4 weekly copies. Plain SQL rather than pg_dump's custom format
# on purpose: in a real recovery someone may be working from a different
# machine under time pressure, and `openssl | gunzip | psql` needs no
# matching pg_restore and no expertise beyond following the README.
#
# Exit codes: 0 success, non-zero failure (and a desktop notification).

set -euo pipefail

# launchd hands jobs a minimal PATH that does not include Homebrew, which is
# where pg_dump lives. Without this the nightly job fails and the manual run
# succeeds — the most confusing possible failure mode.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Config precedence: real environment > ops/backup/backup.env > repo .env.
# The repo .env already holds the credentials the API uses, so a default
# install needs no extra configuration.
set -a
[[ -f "$REPO_ROOT/.env" ]] && . "$REPO_ROOT/.env"
[[ -f "$REPO_ROOT/ops/backup/backup.env" ]] && . "$REPO_ROOT/ops/backup/backup.env"
set +a

readonly DB_HOST="${DB_HOST:-localhost}"
readonly DB_PORT="${DB_PORT:-5432}"
readonly DB_USER="${DB_USER:-dental}"
readonly DB_NAME="${DB_NAME:-patient_book}"

# The destination is `PB_BACKUP_DIR` (ops/backup/backup.env) and nowhere
# else; the application has no say in where dumps go.
readonly BACKUP_DIR="${PB_BACKUP_DIR:-$HOME/PatientBookBackups}"
readonly KEY_FILE="${PB_BACKUP_KEY:-$HOME/.patient-book/backup.key}"
readonly KEEP_DAILY="${PB_KEEP_DAILY:-7}"
readonly KEEP_WEEKLY="${PB_KEEP_WEEKLY:-4}"

# A second, independent copy — a plain directory, typically the local folder
# a cloud client (Dropbox, Google Drive, ...) already syncs. The script never
# knows or cares which provider: by the time a file reaches this directory it
# is already gzipped and AES-256 encrypted, so the provider never sees
# readable records. Kept separate from BACKUP_DIR so a sync hiccup can never
# take the primary, locally-restorable copy down with it. Unset by default:
# no offsite copy is attempted until this is configured.
readonly OFFSITE_DIR="${PB_OFFSITE_DIR:-}"

readonly DAILY_DIR="$BACKUP_DIR/daily"
readonly WEEKLY_DIR="$BACKUP_DIR/weekly"
readonly LOG_FILE="$BACKUP_DIR/backup.log"
readonly STAMP="$(date +%Y%m%d-%H%M%S)"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG_FILE"; }

# Surfaces failures where someone will actually see them. A backup that has
# been silently failing for a month is worse than no backup, because you
# believed you had one.
fail() {
  log "FAILED: $*"
  date '+%Y-%m-%d %H:%M:%S' >"$BACKUP_DIR/last-failure" 2>/dev/null || true
  osascript -e 'display notification "پشتیبان‌گیری پایگاه داده انجام نشد" with title "Patient Book" sound name "Basso"' 2>/dev/null || true
  echo "backup failed: $*" >&2
  exit 1
}

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"
trap 'fail "unexpected error on line $LINENO"' ERR

# -- encryption key ---------------------------------------------------------
# Generated once, never rotated automatically: rotating would silently orphan
# every existing backup, which is the opposite of what this script is for.
if [[ ! -f "$KEY_FILE" ]]; then
  mkdir -p "$(dirname "$KEY_FILE")"
  ( umask 077; openssl rand -base64 48 >"$KEY_FILE" )
  chmod 600 "$KEY_FILE"
  log "generated a new encryption key at $KEY_FILE"
  cat <<BANNER

  ⚠  A new backup encryption key was generated:

       $KEY_FILE

     Copy it somewhere safe and OFF this machine (password manager, printed
     in the practice safe). Without this key every backup is unreadable —
     and keeping the only copy beside the backups defeats encrypting them.

BANNER
fi

[[ -s "$KEY_FILE" ]] || fail "encryption key $KEY_FILE is empty"

# -- dump -------------------------------------------------------------------
readonly TARGET="$DAILY_DIR/patient-book-$STAMP.sql.gz.enc"
readonly TMP="$(mktemp "${TMPDIR:-/tmp}/pb-backup.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

log "starting dump of $DB_NAME"

# PGPASSWORD is exported only for the pg_dump call and never logged.
# pipefail is what makes a pg_dump failure here fatal rather than producing a
# perfectly valid encryption of a truncated dump.
if ! PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
      --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
      --dbname="$DB_NAME" --no-owner --no-privileges --clean --if-exists \
      2>>"$LOG_FILE" \
    | gzip -9 \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$KEY_FILE" \
    >"$TMP"; then
  fail "pg_dump pipeline returned non-zero"
fi

[[ -s "$TMP" ]] || fail "dump produced an empty file"

mv "$TMP" "$TARGET"
chmod 600 "$TARGET"
readonly SIZE="$(du -h "$TARGET" | cut -f1)"
log "wrote $(basename "$TARGET") ($SIZE)"

# -- weekly promotion -------------------------------------------------------
# Promote whenever the newest weekly is more than 6 days old, rather than on a
# fixed weekday: the office Mac is not guaranteed to be awake on any given
# day, and a fixed-weekday rule silently skips that week when it is asleep.
promote_weekly() {
  local newest
  newest="$(find "$WEEKLY_DIR" -name '*.enc' -mtime -6 -print -quit 2>/dev/null || true)"
  if [[ -z "$newest" ]]; then
    cp "$TARGET" "$WEEKLY_DIR/$(basename "$TARGET")"
    log "promoted $(basename "$TARGET") to weekly"
  fi
}
promote_weekly

# -- retention --------------------------------------------------------------
prune() {
  local dir="$1" keep="$2" removed=0
  # Timestamped names contain no spaces, so this stays safe.
  for old in $(ls -1t "$dir"/*.enc 2>/dev/null | tail -n +$((keep + 1))); do
    rm -f "$old" && removed=$((removed + 1))
  done
  [[ $removed -gt 0 ]] && log "pruned $removed old backup(s) from $(basename "$dir")"
  return 0
}
prune "$DAILY_DIR" "$KEEP_DAILY"
prune "$WEEKLY_DIR" "$KEEP_WEEKLY"

# -- offsite mirror -----------------------------------------------------
if [[ -n "$OFFSITE_DIR" ]]; then
  mkdir -p "$OFFSITE_DIR/daily" "$OFFSITE_DIR/weekly" \
    || fail "cannot create $OFFSITE_DIR"
  cp "$TARGET" "$OFFSITE_DIR/daily/$(basename "$TARGET")" \
    || fail "offsite copy to $OFFSITE_DIR failed"
  if [[ -f "$WEEKLY_DIR/$(basename "$TARGET")" ]]; then
    cp "$TARGET" "$OFFSITE_DIR/weekly/$(basename "$TARGET")" \
      || fail "offsite weekly copy to $OFFSITE_DIR failed"
  fi
  prune "$OFFSITE_DIR/daily" "$KEEP_DAILY"
  prune "$OFFSITE_DIR/weekly" "$KEEP_WEEKLY"
  date '+%Y-%m-%d %H:%M:%S' >"$BACKUP_DIR/last-offsite-success"
  log "mirrored $(basename "$TARGET") to $OFFSITE_DIR"
fi

rm -f "$BACKUP_DIR/last-failure"
date '+%Y-%m-%d %H:%M:%S' >"$BACKUP_DIR/last-success"
log "OK  daily=$(ls -1 "$DAILY_DIR"/*.enc 2>/dev/null | wc -l | tr -d ' ')" \
    "weekly=$(ls -1 "$WEEKLY_DIR"/*.enc 2>/dev/null | wc -l | tr -d ' ')"

trap - ERR
echo "backup ok: $TARGET ($SIZE)"
