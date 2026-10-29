#!/bin/bash
#
# Encrypted nightly backup of the patient-book database, for the Ubuntu VPS.
#
# The macOS counterpart in ops/backup/ drives a local pg_dump under launchd.
# Here Postgres is a container with no published port, so the dump runs inside
# it — which also guarantees pg_dump matches the server version exactly.
#
# Output format is identical to the macOS script (gzip, then AES-256), so one
# set of restore instructions covers both.
#
#   pb-backup.sh             the nightly run, from the systemd timer
#   pb-backup.sh predeploy   the dump deploy.sh takes before migrations
#
# Exit codes: 0 success, non-zero failure (systemd records it; see
# `systemctl status patient-book-backup`).

set -euo pipefail

readonly MODE="${1:-nightly}"
[[ "$MODE" == nightly || "$MODE" == predeploy ]] || {
  echo "usage: $0 [predeploy]" >&2
  exit 2
}

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"

# Operator-authored configuration, sourced like the compose file reads it.
# The backup destination is `PB_BACKUP_DIR` here and nowhere else — set it on
# the server, in this file; the application has no say in where dumps go.
set -a
[[ -f "$REPO_ROOT/.env" ]] && . "$REPO_ROOT/.env"
set +a

readonly DB_USER="${DB_USER:-dental}"
readonly DB_NAME="${DB_NAME:-patient_book}"
readonly PB_HOME_DIR="${PB_HOME_DIR:-/srv/patient-book/home}"

readonly BACKUP_DIR="${PB_BACKUP_DIR:-$PB_HOME_DIR/PatientBookBackups}"

# Deliberately apart from the backups themselves and from anything the API
# image can reach: a compromise of the web application should not hand over
# the key that decrypts every backup of the records it holds.
readonly KEY_FILE="${PB_BACKUP_KEY:-/etc/patient-book/backup.key}"

readonly KEEP_DAILY="${PB_KEEP_DAILY:-7}"
readonly KEEP_WEEKLY="${PB_KEEP_WEEKLY:-4}"
# Pre-deploy dumps are the state a bad release rolls back to. They keep a
# directory and a count of their own, so a day of several deploys cannot push
# the nightly history out of daily/.
readonly KEEP_PREDEPLOY="${PB_KEEP_PREDEPLOY:-3}"

# A second, independent copy, off this VPS. Two ways to configure one, and
# either (or both) can be set:
#
#   PB_OFFSITE_REMOTE  an rclone remote:path, e.g. dropbox:PatientBookBackups
#                       or gdrive:PatientBookBackups. `rclone copyto` pushes
#                       straight to the provider — no mount to keep alive,
#                       just a one-time `rclone config` to authorize it.
#   PB_OFFSITE_DIR      a plain local directory — for an already-mounted
#                       network share or an rclone mount, if you'd rather
#                       have a real path than shell out to rclone per file.
#
# Either way the script only ever moves a file that is already gzipped and
# AES-256 encrypted, so the provider never sees readable records. Kept
# separate from BACKUP_DIR so a problem with either can never take the
# primary, locally-restorable copy down with it. Unset by default: no offsite
# copy is attempted until one of these is configured.
readonly OFFSITE_REMOTE="${PB_OFFSITE_REMOTE:-}"
readonly OFFSITE_DIR="${PB_OFFSITE_DIR:-}"

readonly DAILY_DIR="$BACKUP_DIR/daily"
readonly WEEKLY_DIR="$BACKUP_DIR/weekly"
readonly PREDEPLOY_DIR="$BACKUP_DIR/predeploy"
readonly LOG_FILE="$BACKUP_DIR/backup.log"
readonly STAMP="$(date +%Y%m%d-%H%M%S)"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG_FILE"; }

# A backup that has been failing silently for a month is worse than no backup,
# because you believed you had one. The message goes to the journal as well as
# the log file, so `systemctl status` shows the reason without opening a file.
fail() {
  log "FAILED: $*"
  date '+%Y-%m-%d %H:%M:%S' >"$BACKUP_DIR/last-failure" 2>/dev/null || true
  echo "backup failed: $*" >&2
  exit 1
}

prune() {
  local dir="$1" keep="$2" removed=0
  # Timestamped names contain no spaces, so this stays safe.
  for old in $(ls -1t "$dir"/*.enc 2>/dev/null | tail -n +$((keep + 1))); do
    rm -f "$old" && removed=$((removed + 1))
  done
  [[ $removed -gt 0 ]] && log "pruned $removed old backup(s) from $(basename "$dir")"
  return 0
}

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"
if [[ "$MODE" == predeploy ]]; then mkdir -p "$PREDEPLOY_DIR"; fi
trap 'fail "unexpected error on line $LINENO"' ERR

command -v docker >/dev/null || fail "docker is not installed"
[[ -f "$COMPOSE_FILE" ]] || fail "compose file not found at $COMPOSE_FILE"

# -- encryption key ---------------------------------------------------------
# Generated once, never rotated automatically: rotating would silently orphan
# every existing backup, which is the opposite of what this script is for.
if [[ ! -f "$KEY_FILE" ]]; then
  mkdir -p "$(dirname "$KEY_FILE")"
  chmod 700 "$(dirname "$KEY_FILE")"
  ( umask 077; openssl rand -base64 48 >"$KEY_FILE" )
  chmod 600 "$KEY_FILE"
  log "generated a new encryption key at $KEY_FILE"
  cat <<BANNER

  ⚠  A new backup encryption key was generated:

       $KEY_FILE

     Copy it somewhere safe and OFF this server (password manager, printed in
     the practice safe). Without this key every backup is unreadable — and
     keeping the only copy on the machine being backed up defeats the point.

BANNER
fi

[[ -s "$KEY_FILE" ]] || fail "encryption key $KEY_FILE is empty"

# -- dump -------------------------------------------------------------------
if [[ "$MODE" == predeploy ]]; then
  readonly TARGET="$PREDEPLOY_DIR/patient-book-$STAMP.sql.gz.enc"
else
  readonly TARGET="$DAILY_DIR/patient-book-$STAMP.sql.gz.enc"
fi
readonly TMP="$(mktemp "${TMPDIR:-/tmp}/pb-backup.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

log "starting $MODE dump of $DB_NAME"

# `exec -T` because there is no TTY under systemd. pipefail is what makes a
# pg_dump failure fatal here rather than producing a perfectly valid
# encryption of a truncated dump.
if ! docker compose -f "$COMPOSE_FILE" exec -T db \
      pg_dump --username="$DB_USER" --dbname="$DB_NAME" \
              --no-owner --no-privileges --clean --if-exists \
      2>>"$LOG_FILE" \
    | gzip -9 \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$KEY_FILE" \
    >"$TMP"; then
  fail "pg_dump pipeline returned non-zero (is the stack running?)"
fi

[[ -s "$TMP" ]] || fail "dump produced an empty file"

# Read it back with the key on disk before calling it a backup, so a key that
# changed under us or a dump that did not finish shows up tonight rather than
# on the day it is needed. Captured, not piped into grep: grep exiting early
# would SIGPIPE the decrypt and fail a check that passed.
ending="$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$TMP" |
  gunzip | tail -n 20)" || fail "the new dump does not decrypt with $KEY_FILE"
[[ "$ending" == *"PostgreSQL database dump complete"* ]] ||
  fail "the new dump is cut short: it does not end the way a finished dump does"

mv "$TMP" "$TARGET"
chmod 600 "$TARGET"
readonly SIZE="$(du -h "$TARGET" | cut -f1)"
log "wrote $(basename "$TARGET") ($SIZE)"

# -- housekeeping -----------------------------------------------------------
# The dumps are pruned below; the two other things that would otherwise only
# ever grow are this log and spare copies of the database itself.
#
# The log needs recent history only: its last 2000 lines are about a year.
if [[ "$(wc -l <"$LOG_FILE")" -gt 2000 ]]; then
  tail -n 2000 "$LOG_FILE" >"$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
# A recovery (pb-restore.sh) keeps the database it replaced as a fallback and
# may leave the one it restored into, and a drill killed mid-way leaves its
# throwaway copy. Each is a full set of patient records that nothing else will
# drop, so every run names them until someone does (README: "What the server
# keeps"). Named, never dropped here: the fallback is kept on purpose, for as
# long as someone is unsure.
leftovers="$(docker compose -f "$COMPOSE_FILE" exec -T db \
  psql --username="$DB_USER" --dbname=postgres -tAc \
  "SELECT datname FROM pg_database
    WHERE datname IN ('${DB_NAME}_before_restore', '${DB_NAME}_restore')
       OR datname LIKE '${DB_NAME//_/\\_}\_drill\_%'" 2>>"$LOG_FILE" | tr '\n' ' ' || true)"
if [[ -n "${leftovers// /}" ]]; then
  log "WARNING: spare copies of the database still on this server: $leftovers"
  echo "warning: spare copies of the database still on this server: $leftovers" >&2
fi

# A pre-deploy dump stops here. Weekly promotion, the offsite mirror and the
# success marker belong to the nightly schedule, which already covers them.
if [[ "$MODE" == predeploy ]]; then
  prune "$PREDEPLOY_DIR" "$KEEP_PREDEPLOY"
  trap - ERR
  echo "backup ok: $TARGET ($SIZE)"
  exit 0
fi

# -- weekly promotion -------------------------------------------------------
# Promote whenever the newest weekly is more than 6 days old rather than on a
# fixed weekday: a VPS that was rebooted on the chosen day would otherwise skip
# that week entirely and nobody would notice.
if [[ -z "$(find "$WEEKLY_DIR" -name '*.enc' -mtime -6 -print -quit 2>/dev/null || true)" ]]; then
  cp "$TARGET" "$WEEKLY_DIR/$(basename "$TARGET")"
  log "promoted $(basename "$TARGET") to weekly"
fi

# -- retention --------------------------------------------------------------
prune "$DAILY_DIR" "$KEEP_DAILY"
prune "$WEEKLY_DIR" "$KEEP_WEEKLY"

# -- offsite mirror: rclone remote ------------------------------------------
if [[ -n "$OFFSITE_REMOTE" ]]; then
  command -v rclone >/dev/null || fail "PB_OFFSITE_REMOTE is set but rclone is not installed"
  rclone copyto "$TARGET" "$OFFSITE_REMOTE/daily/$(basename "$TARGET")" \
    || fail "rclone copy to $OFFSITE_REMOTE failed"
  if [[ -f "$WEEKLY_DIR/$(basename "$TARGET")" ]]; then
    rclone copyto "$TARGET" "$OFFSITE_REMOTE/weekly/$(basename "$TARGET")" \
      || fail "rclone weekly copy to $OFFSITE_REMOTE failed"
  fi
  # Same "keep N newest" rule as the local prune(), just via `rclone lsf`
  # instead of `ls`. A missing remote directory (first run) lists as empty
  # rather than failing.
  rclone_prune() {
    local dir="$1" keep="$2"
    { rclone lsf "$dir" --files-only 2>/dev/null || true; } | sort -r \
      | tail -n +$((keep + 1)) \
      | while IFS= read -r old; do rclone deletefile "$dir/$old" || true; done
  }
  rclone_prune "$OFFSITE_REMOTE/daily" "$KEEP_DAILY"
  rclone_prune "$OFFSITE_REMOTE/weekly" "$KEEP_WEEKLY"
  date '+%Y-%m-%d %H:%M:%S' >"$BACKUP_DIR/last-offsite-success"
  chmod 644 "$BACKUP_DIR/last-offsite-success"
  log "mirrored $(basename "$TARGET") to $OFFSITE_REMOTE"
fi

# -- offsite mirror: local/mounted directory ---------------------------------
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
  chmod 644 "$BACKUP_DIR/last-offsite-success"
  log "mirrored $(basename "$TARGET") to $OFFSITE_DIR"
fi

# `cat $BACKUP_DIR/last-success` is how an operator checks the last good run.
date '+%Y-%m-%d %H:%M:%S' >"$BACKUP_DIR/last-success"
chmod 644 "$BACKUP_DIR/last-success"
rm -f "$BACKUP_DIR/last-failure"

log "OK  daily=$(ls -1 "$DAILY_DIR"/*.enc 2>/dev/null | wc -l | tr -d ' ')" \
    "weekly=$(ls -1 "$WEEKLY_DIR"/*.enc 2>/dev/null | wc -l | tr -d ' ')"

trap - ERR
echo "backup ok: $TARGET ($SIZE)"
