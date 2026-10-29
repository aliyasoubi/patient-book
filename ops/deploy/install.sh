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
for unit in patient-book-backup.service patient-book-backup.timer patient-book-drill.service; do
  sed -e "s|__REPO_ROOT__|$REPO_ROOT|g" "$HERE/$unit" >"$UNIT_DIR/$unit"
  chmod 644 "$UNIT_DIR/$unit"
done
systemctl daemon-reload
systemctl enable --now patient-book-backup.timer
echo "✓  nightly backup timer installed and enabled"
# The restore test hangs off the backup's OnSuccess=, which older systemd
# ignores without complaint — leaving backups that are never tested.
readonly SYSTEMD_VERSION="$(systemctl --version | awk 'NR == 1 { print $2 }')"
if [[ "$SYSTEMD_VERSION" =~ ^[0-9]+$ && "$SYSTEMD_VERSION" -ge 249 ]]; then
  echo "✓  each nightly backup is restore-tested right after it is written"
else
  echo "!  systemd $SYSTEMD_VERSION is older than 249, so backups are not restore-tested" >&2
  echo "   on their own: run sudo ./ops/deploy/pb-restore-drill.sh after each one" >&2
fi

# -- pre-deploy backup without a password -----------------------------------
# deploy.sh dumps the database before migrations, which needs the root-only
# key. The deploy button runs it over SSH with no terminal to type a sudo
# password into, so the deploying account may run exactly that one command
# as root without one. That account already drives Docker, which is as much
# as root, so this gives it nothing new.
readonly DEPLOY_USER_NAME="${PB_DEPLOY_USER:-${SUDO_USER:-}}"
readonly SUDOERS_FILE="/etc/sudoers.d/patient-book-predeploy"
if [[ -n "$DEPLOY_USER_NAME" && "$DEPLOY_USER_NAME" != root ]]; then
  rule="$DEPLOY_USER_NAME ALL=(root) NOPASSWD: $HERE/pb-backup.sh predeploy"
  tmp="$(mktemp)"
  printf '%s\n' "$rule" >"$tmp"
  visudo -cf "$tmp" >/dev/null || { rm -f "$tmp"; die "the sudoers rule did not validate"; }
  install -m 440 -o root -g root "$tmp" "$SUDOERS_FILE"
  rm -f "$tmp"
  echo "✓  $DEPLOY_USER_NAME may run the pre-deploy backup without a password"
else
  echo "✓  deploying as root: the pre-deploy backup needs no sudo rule"
fi

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

  4. Take a backup now (it is restore-tested straight after) and check both:
       sudo systemctl start patient-book-backup.service
       sudo ./ops/deploy/pb-backup-status.sh

  5. Copy /etc/patient-book/backup.key somewhere off this server.
     Without it every backup is unreadable.
NEXT
