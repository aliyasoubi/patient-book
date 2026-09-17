#!/bin/bash
#
# Export the whole register to an Excel workbook, on the VPS.
#
#   ./ops/deploy/export.sh [output.xlsx]
#
# Runs the data-exchange export inside the API image — the only place the
# compiled code and the database credentials both exist — and copies the
# result out. Defaults to ./patient-book-<date>.xlsx. The workbook is a bulk
# extract of patient data: it is written readable by you only, and the export
# is recorded in the audit log.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"
readonly IN_CONTAINER=/tmp/export/patient-book.xlsx

usage() { echo "usage: $0 [output.xlsx]" >&2; exit 2; }

out=""
for arg in "$@"; do
  case "$arg" in
    --*) usage ;;
    *) [[ -z "$out" ]] && out="$arg" || usage ;;
  esac
done
[[ -n "$out" ]] || out="$PWD/patient-book-$(date +%Y%m%d-%H%M).xlsx"
out="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"

cd "$REPO_ROOT"
[[ -f .env ]] || { echo "✗  no .env — see .env.production.example" >&2; exit 1; }

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# The container runs as uid 1000 with every capability dropped; a short-lived
# world-writable staging directory is how it can hand the file back without
# the host having to guess at its uid. It holds patient data, so it is removed
# again whatever happens.
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
chmod 777 "$staging"

echo "→ exporting the register"
compose run --rm \
  -v "$staging:/tmp/export" \
  api node apps/api/dist/modules/data-exchange/run-export.js "$IN_CONTAINER"

mv "$staging/patient-book.xlsx" "$out"
chmod 600 "$out"
echo "✓  $out"
