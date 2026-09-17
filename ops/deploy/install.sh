#!/bin/bash
#
# One-time host setup for the Ubuntu VPS: state directories, the backup key
# location, and the nightly backup timer.
#
# Safe to re-run — it reinstalls the units in place and never touches an
# existing key or an existing database.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly HERE="$REPO_ROOT/ops/deploy"
readonly UNIT_DIR="/etc/systemd/system"
# The `node` user inside the API image; the state directory is created owned
# by it so the one-off tools run through that image can write there too.
readonly APP_UID=1000
readonly APP_GID=1000

die() { echo "✗  $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run with sudo: sudo ./ops/deploy/install.sh"
[[ -f "$REPO_ROOT/.env" ]] || die "no .env found — copy .env.production.example to .env and fill it in first"

command -v docker >/dev/null || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is not installed"

set -a
. "$REPO_ROOT/.env"
set +a

for required in PB_DOMAIN PB_TLS_EMAIL DB_PASSWORD DB_APP_USER DB_APP_PASSWORD JWT_SECRET JWT_REFRESH_SECRET; do
  [[ -n "${!required:-}" ]] || die ".env is missing a value for $required"
done

readonly PB_HOME_DIR="${PB_HOME_DIR:-/srv/patient-book/home}"

# .env holds every secret the stack has.
chmod 600 "$REPO_ROOT/.env"
echo "✓  .env permissions set to 600"

# -- state directory --------------------------------------------------------
mkdir -p "$PB_HOME_DIR/PatientBookBackups"
chown -R "$APP_UID:$APP_GID" "$PB_HOME_DIR"
echo "✓  state directory ready at $PB_HOME_DIR (owned by uid $APP_UID)"

# -- backup key directory ---------------------------------------------------
# Kept apart from the backups and from anything the API image can see: the
# key that decrypts every backup should not sit beside them, nor be reachable
# from the web application.
mkdir -p /etc/patient-book
chmod 700 /etc/patient-book
echo "✓  key directory ready at /etc/patient-book (root only)"

# -- systemd units ----------------------------------------------------------
for unit in patient-book-backup.service patient-book-backup.timer; do
  sed -e "s|__REPO_ROOT__|$REPO_ROOT|g" "$HERE/$unit" >"$UNIT_DIR/$unit"
  chmod 644 "$UNIT_DIR/$unit"
done
systemctl daemon-reload
systemctl enable --now patient-book-backup.timer
echo "✓  nightly backup timer installed and enabled"

echo
systemctl list-timers patient-book-backup.timer --no-pager || true
echo
cat <<NEXT
Next:

  1. Point $PB_DOMAIN at this server's public IP, if you have not already.
     Caddy requests a certificate on first start and Let's Encrypt
     rate-limits repeated failures.

  2. Start the stack:
       ./ops/deploy/deploy.sh

  3. Create the first administrator (once only):
       docker compose -f compose.prod.yml run --rm api \\
         node apps/api/dist/database/seeds/run-seed.js

  4. Prove a backup restores before you rely on it:
       sudo systemctl start patient-book-backup.service
       sudo ./ops/deploy/pb-restore-drill.sh

  5. Copy /etc/patient-book/backup.key somewhere off this server.
     Without it every backup is unreadable.
NEXT
