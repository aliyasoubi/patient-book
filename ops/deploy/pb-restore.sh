#!/bin/bash
#
# Put a backup back in place of the live database: README "Real recovery" as
# three commands, each of which changes one thing and says what it did.
#
#   sudo ./ops/deploy/pb-restore.sh <backup file>   restore into <db>_restore and check it
#   ./ops/deploy/pb-restore.sh --switch             put it in place of the live database
#   ./ops/deploy/pb-restore.sh --undo               put the previous live database back
#
# The first never touches the live database, and the app stays up through it.
# --switch keeps the database it replaces as <db>_before_restore, which is
# what --undo puts back. The restore steps are shared with the nightly drill
# (restore-lib.sh), so a passing drill has run them. sudo for the first
# because the backup key is root-only.

set -euo pipefail

die() {
  echo "✗  $*" >&2
  exit 1
}
. "$(dirname "${BASH_SOURCE[0]}")/restore-lib.sh"

readonly RESTORE_DB="${DB_NAME}_restore"
readonly BEFORE_DB="${DB_NAME}_before_restore"
readonly SELF="./ops/deploy/pb-restore.sh"
readonly DROP_HINT="docker compose -f compose.prod.yml exec -T db psql -U $DB_USER -d postgres -c 'DROP DATABASE"

usage() {
  echo "usage: sudo $SELF <backup file> | --switch | --undo" >&2
  exit 2
}

confirm() {
  echo "$1"
  # A terminal gets asked; a script that passed --switch has already decided.
  [[ -t 0 ]] || return 0
  local answer
  read -r -p "Type restore to go ahead: " answer
  [[ "$answer" == restore ]] || die "stopped; nothing has changed"
}

# Both renames in one transaction: they happen together or not at all, so
# there is never a moment with no database under the live name. Sessions
# still open on either one would block the renames, so they are closed first.
swap() {
  local incoming="$1" outgoing="$2"
  db_psql postgres -q >/dev/null <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname IN ('$DB_NAME', '$incoming') AND pid <> pg_backend_pid();
BEGIN;
ALTER DATABASE "$DB_NAME" RENAME TO "$outgoing";
ALTER DATABASE "$incoming" RENAME TO "$DB_NAME";
COMMIT;
SQL
}

# `up` rather than `start`: it runs `migrate` again against the database now
# under the live name, and recreates a container whose image was rebuilt —
# which is what rolling back to an older release relies on (README). It never
# builds; the images are whatever the checkout last built.
start_stack() {
  echo "→ starting the app"
  compose up -d >/dev/null
  local status=""
  for _ in $(seq 1 60); do
    status="$(compose ps --format '{{.Health}}' api 2>/dev/null | head -n1)"
    [[ "$status" == healthy ]] && return 0
    sleep 5
  done
  return 1
}

restore() {
  local file="$1"
  [[ -r "$file" ]] || die "cannot read $file (the backups are root-only: run this with sudo)"
  if db_exists "$RESTORE_DB"; then
    die "$RESTORE_DB is already here, from an earlier run. Switch to it ($SELF --switch), or drop it and run this again:
     $DROP_HINT $RESTORE_DB;'"
  fi

  echo "→ reading $(basename "$file") through once"
  verify_backup "$file"
  echo "→ restoring it into $RESTORE_DB (the live $DB_NAME is not touched)"
  restore_into "$RESTORE_DB" "$file"
  echo "→ granting the API's role on it"
  grant_runtime_role "$RESTORE_DB"

  local restored live=""
  restored="$(count_as_app_role "$RESTORE_DB")" ||
    die "$DB_APP_USER cannot read every table of $RESTORE_DB"
  if db_exists "$DB_NAME"; then
    live="$(db_psql "$DB_NAME" -tAc "SELECT format('SELECT %L, count(*) FROM public.%I;', tablename, tablename)
                                       FROM pg_tables WHERE schemaname = 'public'" |
      db_psql "$DB_NAME" -tA -F ' ')"
  fi

  echo
  awk 'NR == FNR { live[$1] = $2; next }
       { name[FNR] = $1; rows[FNR] = $2; if (length($1) > w) w = length($1) }
       END {
         printf "   %-" w "s %10s %10s\n", "table", "backup", "live now"
         for (i = 1; i <= FNR; i++)
           printf "   %-" w "s %10s %10s\n", name[i], rows[i], (name[i] in live ? live[name[i]] : "-")
       }' \
    <(printf '%s\n' "$live") <(printf '%s\n' "$restored")
  echo
  cat <<NEXT
✓  $RESTORE_DB holds $(basename "$file"), readable by the API's role.
   Nothing live has changed. To look around in it:
     docker compose -f compose.prod.yml exec db psql -U $DB_USER -d $RESTORE_DB
   To put it in place of the live database (the API stops for a moment):
     $SELF --switch
   Or, to give up, drop it:
     $DROP_HINT $RESTORE_DB;'
NEXT
}

switch_over() {
  db_exists "$RESTORE_DB" ||
    die "there is no $RESTORE_DB to switch to; restore a backup into it first: sudo $SELF <backup file>"
  if db_exists "$BEFORE_DB"; then
    die "$BEFORE_DB is still here from an earlier restore: the database that one replaced. Drop it once nobody needs it, then run this again:
     $DROP_HINT $BEFORE_DB;'"
  fi
  confirm "This stops the API, moves the live $DB_NAME aside as $BEFORE_DB, and puts $RESTORE_DB in its place."

  echo "→ stopping the API"
  compose stop api
  echo "→ putting $RESTORE_DB in place of $DB_NAME"
  if ! swap "$RESTORE_DB" "$BEFORE_DB"; then
    compose start api
    die "the swap did not go through, so nothing changed; the API is back on the live database"
  fi
  start_stack || die "the API did not come back healthy on the restored database. To put the previous one back: $SELF --undo"

  cat <<DONE
✓  restored: the app is running on the backup.
   The database it replaced is kept as $BEFORE_DB. Anything staff entered
   since the backup is there, if it needs copying over. Once nobody needs it:
     $DROP_HINT $BEFORE_DB;'
DONE
}

undo() {
  db_exists "$BEFORE_DB" || die "there is no $BEFORE_DB to go back to"
  if db_exists "$RESTORE_DB"; then
    die "$RESTORE_DB is here, so the restored database has nowhere to go. Drop it first:
     $DROP_HINT $RESTORE_DB;'"
  fi
  confirm "This stops the API, moves the restored $DB_NAME aside as $RESTORE_DB, and puts $BEFORE_DB back. Anything entered since the switch stays in $RESTORE_DB."

  echo "→ stopping the API"
  compose stop api
  echo "→ putting $BEFORE_DB back as $DB_NAME"
  if ! swap "$BEFORE_DB" "$RESTORE_DB"; then
    compose start api
    die "the swap did not go through, so nothing changed"
  fi
  start_stack || die "the API did not come back healthy: docker compose -f compose.prod.yml logs api"
  echo "✓  back on the database from before the restore; the restored one is kept as $RESTORE_DB."
}

case "${1:-}" in
  --switch) switch_over ;;
  --undo) undo ;;
  "" | -*) usage ;;
  *) restore "$1" ;;
esac
