#!/bin/bash
#
# Correct existing records from an updated workbook, on the VPS.
#
#   ./ops/deploy/reconcile.sh /path/to/workbook.xlsx            # preview only
#   ./ops/deploy/reconcile.sh /path/to/workbook.xlsx --apply    # write changes
#
# Runs the data-exchange reconcile inside the API image. Rows are matched to
# records by file number or register number; unmatched rows are counted, never
# created (that is import.sh's job). Without --apply nothing is written — read
# the printed changes first, then re-run with --apply. Each applied change is
# checked against the record's current value and version, so anything edited
# in the app since the workbook was exported is refused, not overwritten.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"
readonly IN_CONTAINER=/tmp/reconcile/workbook.xlsx

usage() { echo "usage: $0 <workbook.xlsx> [--apply]" >&2; exit 2; }

workbook=""
apply=()
for arg in "$@"; do
  case "$arg" in
    --apply) apply=(--apply) ;;
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
# file, and a copy with known permissions leaves the original's mode alone.
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
cp "$workbook" "$staging/workbook.xlsx"
chmod 755 "$staging"
chmod 644 "$staging/workbook.xlsx"

compose run --rm \
  -v "$staging:/tmp/reconcile:ro" \
  api node apps/api/dist/modules/data-exchange/run-reconcile.js "$IN_CONTAINER" "${apply[@]}"
