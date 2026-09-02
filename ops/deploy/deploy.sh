#!/bin/bash
#
# Build and (re)start the stack. Safe to re-run; this is the normal way to
# ship a change.
#
# Migrations run as their own one-shot service that the API waits on, so the
# schema is always current before the new code serves a request.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"

cd "$REPO_ROOT"
[[ -f .env ]] || { echo "✗  no .env — see .env.production.example" >&2; exit 1; }

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

echo "→ building images"
compose build

echo "→ starting stack"
compose up -d --remove-orphans

echo "→ waiting for the API to report healthy"
for _ in $(seq 1 60); do
  status="$(compose ps --format '{{.Health}}' api 2>/dev/null | head -n1)"
  [[ "$status" == "healthy" ]] && break
  sleep 5
done

if [[ "${status:-}" != "healthy" ]]; then
  echo "✗  the API did not become healthy. Recent logs:" >&2
  compose logs --tail=40 api >&2
  exit 1
fi

# Old image layers accumulate quickly on a small VPS disk.
docker image prune -f >/dev/null

echo
compose ps
echo
echo "✓  deployed"
