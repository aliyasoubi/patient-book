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

# The front page lives at exactly `/` and the app everywhere else, by one
# rewrite in the Caddyfile that the dev server does not have. Check both
# through Caddy itself, so a broken rule is caught here, not by the clinic.
echo "→ checking routing"
domain="$(sed -n 's/^PB_DOMAIN=//p' .env | tail -n1 | tr -d '"'"'"' ')"
# Captured, not piped into `grep -q`: under pipefail, grep exiting on the
# first match would SIGPIPE curl and fail a check that actually passed.
serves() {
  local body
  body="$(curl -fsS --max-time 10 --resolve "$domain:443:127.0.0.1" "https://$domain$1" 2>/dev/null)" &&
    [[ "$body" == *"$2"* ]]
}
routing_ok=false
# A first deploy may still be obtaining its certificate; give it a minute.
for _ in $(seq 1 12); do
  if serves / 'data-landing' && serves /login '<app-root' && serves /dashboard '<app-root'; then
    routing_ok=true
    break
  fi
  sleep 5
done
if [[ "$routing_ok" != true ]]; then
  echo "✗  routing check failed: / must serve the front page, /login and /dashboard the app" >&2
  exit 1
fi

# Old image layers accumulate quickly on a small VPS disk.
docker image prune -f >/dev/null

echo
compose ps
echo
echo "✓  deployed"
