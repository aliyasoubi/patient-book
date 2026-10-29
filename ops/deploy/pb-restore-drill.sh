#!/bin/bash
#
# Prove the newest backup still restores. A backup that has never been restored
# is not a recovery plan. systemd runs this after every nightly backup
# (patient-book-drill.service); it is safe to run by hand at any time.
#
# Takes the same steps as a real recovery (restore-lib.sh, shared with
# pb-restore.sh) into a throwaway database inside the Postgres container:
# restore, provision the API's runtime role, read every table back *as that
# role*, and drop it again. The live database is never touched.

set -euo pipefail

die() {
  echo "drill failed: $*" >&2
  exit 1
}
. "$(dirname "${BASH_SOURCE[0]}")/restore-lib.sh"

readonly DRILL_DB="${DB_NAME}_drill_$$"

NEWEST="$(ls -1t "$BACKUP_DIR"/daily/*.enc 2>/dev/null | head -n 1 || true)"
[[ -n "$NEWEST" ]] || die "no backups found in $BACKUP_DIR/daily"
echo "restoring $(basename "$NEWEST") into $DRILL_DB"

cleanup() {
  db_psql postgres -qc "DROP DATABASE IF EXISTS \"$DRILL_DB\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT

verify_backup "$NEWEST"
restore_into "$DRILL_DB" "$NEWEST"
grant_runtime_role "$DRILL_DB"

COUNTS="$(count_as_app_role "$DRILL_DB")" ||
  die "$DB_APP_USER cannot read every table of the restored database"
PATIENTS="$(awk '$1 == "patients" { print $2 }' <<<"$COUNTS")"
[[ "$PATIENTS" =~ ^[0-9]+$ ]] || die "the restored database has no patients table"
[[ "$PATIENTS" -gt 0 ]] || die "restored database has no patient rows"

date '+%Y-%m-%d %H:%M:%S' >"$BACKUP_DIR/last-drill"
chmod 644 "$BACKUP_DIR/last-drill"
echo "drill ok: $(basename "$NEWEST") restores; $(wc -l <<<"$COUNTS" | tr -d ' ') tables" \
  "and $PATIENTS patient rows, all readable as $DB_APP_USER"
