#!/bin/bash
#
# Load the practice's Excel workbook into a freshly deployed register.
#
#   ./ops/deploy/import.sh /path/to/workbook.xlsx [--force]
#
# This is the one-shot migration importer (apps/api/src/modules/import) run
# inside the API image, which is the only place the compiled code and the
# database credentials both exist. It creates patients, registry cases and
# treatments from the sheet. It is *not* the "reconcile" upload on the
# settings page: that one only corrects records that already exist, and
# reports every row of a workbook uploaded into an empty register as
# unmatched.
#
# Run the seed first (treatment types must exist), then this, once. A second
# run against a populated database is refused unless --force is passed.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"
# Where the workbook appears inside the container; the API's own paths are
# untouched, and the bind mount below is read-only.
readonly IN_CONTAINER=/tmp/import/workbook.xlsx

usage() { echo "usage: $0 <workbook.xlsx> [--force]" >&2; exit 2; }

workbook=""
force=()
for arg in "$@"; do
  case "$arg" in
    --force) force=(--force) ;;
    --*) usage ;;
    *) [[ -z "$workbook" ]] && workbook="$arg" || usage ;;
  esac
done
[[ -n "$workbook" ]] || usage
[[ -f "$workbook" ]] || { echo "✗  no such file: $workbook" >&2; exit 1; }

cd "$REPO_ROOT"
[[ -f .env ]] || { echo "✗  no .env — see .env.production.example" >&2; exit 1; }

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# The container runs as uid 1000 and drops every capability, so it can only
# read the file if the file is world-readable. A short-lived copy with known
# permissions avoids touching the original's mode; it holds patient data, so
# it is removed again whatever happens.
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
cp "$workbook" "$staging/workbook.xlsx"
chmod 755 "$staging"
chmod 644 "$staging/workbook.xlsx"

echo "→ importing $(basename "$workbook")"
compose run --rm \
  -v "$staging:/tmp/import:ro" \
  api node apps/api/dist/modules/import/run-import.js "$IN_CONTAINER" "${force[@]}"
