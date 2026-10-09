#!/bin/bash
#
# Load the practice's stock workbook into the inventory of a deployed server.
#
#   ./ops/deploy/import-inventory.sh /path/to/stock.xlsx            # preview
#   ./ops/deploy/import-inventory.sh /path/to/stock.xlsx --apply    # write
#
# The inventory importer (apps/api/src/modules/inventory/import) run inside
# the API image, like import.sh. Without --apply it only prints the report —
# every standardized name, every row it could not read — and writes nothing.
# With --apply it refuses an inventory that already has items, so it can only
# ever load the shelf once. Run it after deploy.sh, which runs the migrations.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"
readonly IN_CONTAINER=/tmp/import/stock.xlsx

usage() { echo "usage: $0 <stock.xlsx> [--apply]" >&2; exit 2; }

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

# The container runs as uid 1000 with no capabilities: it reads a short-lived,
# world-readable copy, removed again whatever happens.
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
cp "$workbook" "$staging/stock.xlsx"
chmod 755 "$staging"
chmod 644 "$staging/stock.xlsx"

echo "→ ${apply[*]:+importing}${apply[*]:-previewing} $(basename "$workbook")"
compose run --rm \
  -v "$staging:/tmp/import:ro" \
  api node apps/api/dist/modules/inventory/import/run-inventory-import.js \
  "$IN_CONTAINER" "${apply[@]}"
