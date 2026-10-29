#!/bin/bash
#
# Bring implant records from before the current rules in line with them, on
# the VPS.
#
#   ./ops/deploy/implant-cleanup.sh            # preview only
#   ./ops/deploy/implant-cleanup.sh --apply    # write the changes
#
# Runs the cleanup inside the API image, against the database the API uses:
# links stock card lines from before to the follow-up they went into, merges a
# patient's same-day follow-ups the stock once wrote one per implant, and
# leaves each patient one linked implant file. Without --apply everything runs
# in a transaction that is rolled back, so the preview is exactly what --apply
# would write. It prints file and register numbers, never names.
#
# Take a backup first (`sudo systemctl start patient-book-backup.service`):
# --apply rewrites stored rows, which running an older release does not undo.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"

usage() { echo "usage: $0 [--apply]" >&2; exit 2; }

apply=()
for arg in "$@"; do
  case "$arg" in
    --apply) apply=(--apply) ;;
    *) usage ;;
  esac
done

cd "$REPO_ROOT"
[[ -f .env ]] || { echo "✗  no .env — see .env.production.example" >&2; exit 1; }

docker compose -f "$COMPOSE_FILE" run --rm \
  api node apps/api/dist/modules/implants/run-implant-cleanup.js "${apply[@]}"
