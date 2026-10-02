#!/bin/bash
#
# Load the practice's lab book (لابراتوار.xlsx) into the lab board, once.
#
#   ./ops/deploy/import-labs.sh /path/to/workbook.xlsx            # preview only
#   ./ops/deploy/import-labs.sh /path/to/workbook.xlsx --apply    # write
#
# Runs apps/api/src/modules/labs/run-lab-import inside the API image, like
# import.sh. Without --apply nothing is written: read the printed plan first —
# every row with what it will become, every skipped row with why. A board that
# already holds cases is refused unless --force is passed as well.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"
readonly IN_CONTAINER=/tmp/import-labs/workbook.xlsx

usage() { echo "usage: $0 <workbook.xlsx> [--apply] [--force]" >&2; exit 2; }

workbook=""
flags=()
for arg in "$@"; do
  case "$arg" in
    --apply | --force) flags+=("$arg") ;;
    --*) usage ;;
    *) [[ -z "$workbook" ]] && workbook="$arg" || usage ;;
  esac
done
[[ -n "$workbook" ]] || usage
[[ -f "$workbook" ]] || { echo "✗  no such file: $workbook" >&2; exit 1; }

cd "$REPO_ROOT"
[[ -f .env ]] || { echo "✗  no .env — see .env.production.example" >&2; exit 1; }

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# Same staging as import.sh: the container can only read a world-readable
# file, and the copy holds patient data, so it is removed whatever happens.
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
cp "$workbook" "$staging/workbook.xlsx"
chmod 755 "$staging"
chmod 644 "$staging/workbook.xlsx"

compose run --rm \
  -v "$staging:/tmp/import-labs:ro" \
  api node apps/api/dist/modules/labs/run-lab-import.js "$IN_CONTAINER" "${flags[@]}"
