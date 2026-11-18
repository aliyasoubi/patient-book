#!/bin/bash
#
# Build and (re)start the stack. Safe to re-run; this is the normal way to
# ship a change.
#
# Migrations run as their own one-shot service that the API waits on, so the
# schema is always current before the new code serves a request. A dump taken
# just before them is what a bad release rolls back to (README: "Rolling back
# a release").

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"

cd "$REPO_ROOT"
[[ -f .env ]] || { echo "✗  no .env — see .env.production.example" >&2; exit 1; }

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# The release this is. ship.sh passes the tag it checked out; otherwise git
# says: the tag on a release commit (v1.4.0), how far past one a pull of main
# is (v1.4.0-3-g7b4b038), and -dirty when tracked files were edited here. The
# images carry it, and open tabs compare it with their own to offer a reload.
if [[ -z "${PB_VERSION:-}" ]]; then
  PB_VERSION="$(git describe --tags --match 'v[0-9]*' --always --dirty 2>/dev/null || echo dev)"
fi
if [[ ! "$PB_VERSION" =~ ^[A-Za-z0-9._+-]{1,64}$ ]]; then
  echo "✗  PB_VERSION must look like v1.4.0, not '$PB_VERSION'" >&2
  exit 1
fi
export PB_VERSION

echo "→ building images for $PB_VERSION"
compose build

# After the build, so a failed build costs no dump, and right before `up`,
# which runs the migrations. No dump, no deploy. A first deploy has no
# database running yet, and nothing to keep.
#
# The backup key is root-only. The deploy button runs this over SSH with no
# terminal, where sudo cannot ask for a password: there it must be allowed
# without one, which install.sh sets up for this one command. Run by hand in
# a terminal, sudo may ask as usual.
readonly PREDEPLOY=("$REPO_ROOT/ops/deploy/pb-backup.sh" predeploy)
if [[ -n "$(compose ps --status running --quiet db 2>/dev/null)" ]]; then
  echo "→ backing up the database before migrations"
  if [[ $EUID -eq 0 ]]; then
    "${PREDEPLOY[@]}"
  elif [[ -t 0 ]] || sudo -n -l "${PREDEPLOY[@]}" >/dev/null 2>&1; then
    sudo "${PREDEPLOY[@]}"
  else
    echo "✗  the pre-deploy backup needs root, and sudo would ask for a password" >&2
    echo "   nobody can type here. Run once on the server: sudo ./ops/deploy/install.sh" >&2
    exit 1
  fi
else
  echo "→ no database running yet — no backup to take"
fi

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

# www only redirects, and its DNS record is set up separately, so a miss here
# is a warning: the real site above is already confirmed working.
www_target="$(curl -sS --max-time 10 -o /dev/null -w '%{redirect_url}' \
  --resolve "www.$domain:443:127.0.0.1" "https://www.$domain/login" 2>/dev/null || true)"
if [[ "$www_target" != "https://$domain/login" ]]; then
  echo "!  www.$domain does not redirect to https://$domain yet — check its DNS record" >&2
fi

# Old image layers accumulate quickly on a small VPS disk.
docker image prune -f >/dev/null

# Units are installed by install.sh, not here. A server set up before the
# nightly restore test still backs up, but never tests a backup.
if [[ ! -f /etc/systemd/system/patient-book-drill.service ]]; then
  echo "!  backups here are not restore-tested yet. Run once: sudo ./ops/deploy/install.sh" >&2
fi

# What ran here and when: the list ship.sh shows when choosing a release to
# go back to. Gitignored, so checking out another release leaves it in place.
printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M')" "$PB_VERSION" >>"$REPO_ROOT/ops/deploy/deploys.log"

echo
compose ps
echo
echo "✓  deployed $PB_VERSION"
