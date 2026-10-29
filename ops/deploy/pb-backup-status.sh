#!/bin/bash
#
# The backups at a glance: the last good run, whether it passed its restore
# test, the off-server copy, the key, and anything left lying around. Exits
# non-zero when something needs attention, so a monitor can run it as well.
#
#   sudo ./ops/deploy/pb-backup-status.sh

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"

set -a
[[ -f "$REPO_ROOT/.env" ]] && . "$REPO_ROOT/.env"
set +a

readonly DB_USER="${DB_USER:-dental}"
readonly DB_NAME="${DB_NAME:-patient_book}"
readonly PB_HOME_DIR="${PB_HOME_DIR:-/srv/patient-book/home}"
readonly BACKUP_DIR="${PB_BACKUP_DIR:-$PB_HOME_DIR/PatientBookBackups}"
readonly KEY_FILE="${PB_BACKUP_KEY:-/etc/patient-book/backup.key}"
readonly OFFSITE="${PB_OFFSITE_REMOTE:-${PB_OFFSITE_DIR:-}}"

# The nightly run fires at 21:00 plus up to 15 minutes; a day and two hours
# allows for that without letting a missed night pass.
readonly MAX_AGE_MIN=$((26 * 60))

problems=0
ok() { printf '  ✓ %-16s %s\n' "$1" "$2"; }
note() { printf '  ! %-16s %s\n' "$1" "$2"; }
bad() {
  printf '  ✗ %-16s %s\n' "$1" "$2"
  problems=$((problems + 1))
}

# Recent, stale or missing, from a marker file the scripts write.
marker() {
  local label="$1" file="$BACKUP_DIR/$2"
  if [[ ! -f "$file" ]]; then
    bad "$label" "never"
  elif [[ -n "$(find "$file" -mmin "+$MAX_AGE_MIN")" ]]; then
    bad "$label" "$(cat "$file"), over a day ago"
  else
    ok "$label" "$(cat "$file")"
  fi
}
count() { ls -1 "$BACKUP_DIR/$1"/*.enc 2>/dev/null | wc -l | tr -d ' '; }

echo "Backups in $BACKUP_DIR"
marker "last backup" last-success
marker "restore test" last-drill
if [[ -f "$BACKUP_DIR/last-failure" ]]; then
  bad "failing" "since $(cat "$BACKUP_DIR/last-failure"): journalctl -u patient-book-backup -n 50"
fi
if [[ -z "$OFFSITE" ]]; then
  bad "off-server copy" "not set up, so every copy is on this server (README: Off-server copies)"
else
  marker "off-server copy" last-offsite-success
fi

NEWEST="$(ls -1t "$BACKUP_DIR"/daily/*.enc 2>/dev/null | head -n 1 || true)"
note "kept" "daily $(count daily), weekly $(count weekly), pre-deploy $(count predeploy)${NEWEST:+; newest $(du -h "$NEWEST" | cut -f1 | tr -d ' ')}"

# The fingerprint is how to check the copy kept off this server is the same
# key: `openssl dgst -sha256 -r backup.key | cut -c1-16` on that copy.
if [[ ! -x "$(dirname "$KEY_FILE")" ]]; then
  bad "key" "cannot look in $(dirname "$KEY_FILE"): run this with sudo"
elif [[ -s "$KEY_FILE" ]]; then
  ok "key" "$KEY_FILE, fingerprint $(openssl dgst -sha256 -r "$KEY_FILE" | cut -c1-16)"
else
  bad "key" "missing at $KEY_FILE, and every backup is unreadable without it"
fi

if command -v systemctl >/dev/null; then
  if ! systemctl is-enabled --quiet patient-book-backup.timer 2>/dev/null; then
    bad "schedule" "the nightly timer is not enabled: sudo ./ops/deploy/install.sh"
  elif [[ ! -f /etc/systemd/system/patient-book-drill.service ]]; then
    bad "schedule" "backups run but are not restore-tested: sudo ./ops/deploy/install.sh"
  else
    ok "schedule" "next run $(systemctl show patient-book-backup.timer -p NextElapseUSecRealtime --value)"
  fi
fi

if spares="$(docker compose -f "$COMPOSE_FILE" exec -T db psql --username="$DB_USER" --dbname=postgres -tAc \
  "SELECT datname FROM pg_database
    WHERE datname IN ('${DB_NAME}_before_restore', '${DB_NAME}_restore')
       OR datname LIKE '${DB_NAME//_/\\_}\_drill\_%'" 2>/dev/null)"; then
  if [[ -n "$spares" ]]; then
    note "spare copies" "${spares//$'\n'/ }: each holds every record; drop once unneeded (README)"
  fi
else
  bad "database" "not reachable: docker compose -f compose.prod.yml ps"
fi

echo
if [[ $problems -eq 0 ]]; then
  echo "All good."
else
  echo "$problems thing(s) need attention."
  exit 1
fi
