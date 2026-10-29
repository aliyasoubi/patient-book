# Restore steps shared by pb-restore.sh (a real recovery) and
# pb-restore-drill.sh (the test after every nightly backup). One copy of them,
# so a drill that passes has run the exact path a recovery takes.
#
# Sourced, not run. The sourcing script defines `die` first.

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"

set -a
[[ -f "$REPO_ROOT/.env" ]] && . "$REPO_ROOT/.env"
set +a

readonly DB_USER="${DB_USER:-dental}"
readonly DB_NAME="${DB_NAME:-patient_book}"
readonly DB_APP_USER="${DB_APP_USER:?DB_APP_USER must be set in .env}"
readonly DB_APP_PASSWORD="${DB_APP_PASSWORD:?DB_APP_PASSWORD must be set in .env}"
readonly PB_HOME_DIR="${PB_HOME_DIR:-/srv/patient-book/home}"
readonly BACKUP_DIR="${PB_BACKUP_DIR:-$PB_HOME_DIR/PatientBookBackups}"
readonly KEY_FILE="${PB_BACKUP_KEY:-/etc/patient-book/backup.key}"

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# psql as the superuser, inside the container, stopping at the first error.
db_psql() {
  local db="$1"
  shift
  compose exec -T db psql --username="$DB_USER" --dbname="$db" -v ON_ERROR_STOP=1 "$@"
}

db_exists() {
  [[ "$(db_psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$1'")" == 1 ]]
}

decrypt() {
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$1" | gunzip
}

# Reads the whole file once before anything is created. A wrong key, a copy
# cut short or a dump that never finished all stop here. Left to the restore,
# a file cut at a line boundary would load "successfully" with every table
# after the cut missing.
verify_backup() {
  [[ -s "$KEY_FILE" && -r "$KEY_FILE" ]] ||
    die "cannot read the backup key at $KEY_FILE (it is root-only: run with sudo)"
  [[ -f "$1" ]] || die "no such backup: $1"
  local ending
  ending="$(decrypt "$1" | tail -n 20)" ||
    die "$(basename "$1") does not decrypt: the wrong key, or a damaged or incomplete file"
  [[ "$ending" == *"PostgreSQL database dump complete"* ]] ||
    die "$(basename "$1") is cut short: it does not end the way a finished dump does"
}

# Into a database that does not exist yet, so a restore never lands on top of
# anything. pipefail and ON_ERROR_STOP make any error in the stream fatal.
restore_into() {
  local db="$1" file="$2"
  db_psql postgres -qc "CREATE DATABASE \"$db\"" || die "could not create $db"
  decrypt "$file" | db_psql "$db" --quiet >/dev/null ||
    die "restoring $(basename "$file") into $db failed"
}

# The dump carries no grants (--no-privileges), so restored tables belong to
# the superuser alone. `migrate` against the database is what the API's role
# needs: it applies any migration newer than the backup, then grants
# DB_APP_USER on every table (ensure-app-role.ts). Names any migration it
# applied: none when the backup is from the release that is running.
grant_runtime_role() {
  local db="$1" before after name
  before="$(db_psql "$db" -tAc 'SELECT name FROM migrations ORDER BY id')" ||
    die "$db has no migrations table: not a patient-book backup"
  compose run --rm -e "DB_NAME=$db" migrate >/dev/null ||
    die "could not run migrate against $db"
  after="$(db_psql "$db" -tAc 'SELECT name FROM migrations ORDER BY id')"
  for name in $(comm -13 <(sort <<<"$before") <(sort <<<"$after")); do
    echo "   newer than the backup, now applied: $name"
  done
}

# Reads every table as DB_APP_USER, the role the API connects with, printing
# "<table> <rows>" per line. Counting as the superuser would prove nothing
# about the API: without the grants above, `dental` counts fine and the API
# still gets "permission denied" on its first query.
count_as_app_role() {
  db_psql "$1" -tAc "SELECT format('SELECT %L, count(*) FROM public.%I;', tablename, tablename)
                       FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename" |
    compose exec -T -e "PGPASSWORD=$DB_APP_PASSWORD" db \
      psql --username="$DB_APP_USER" --dbname="$1" -v ON_ERROR_STOP=1 -tA -F ' '
}
