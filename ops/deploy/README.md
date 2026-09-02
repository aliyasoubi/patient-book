# Deploying to an Ubuntu VPS

Four containers behind one domain: Postgres, the API, a one-shot migration
step, and Caddy serving the Angular bundle and terminating TLS.

```
                    :443
  browser ────► Caddy ──┬── /api/*  ──► api  ──► db
                        └── everything else from /srv (the Angular bundle)
```

Two properties of this layout are deliberate:

- **Postgres publishes no port at all.** It is reachable only on the internal
  Docker network. Publishing it — even on `127.0.0.1` — is worth avoiding,
  because Docker inserts its own iptables rules ahead of `ufw`: a published
  port stays reachable from the internet even when the firewall is configured
  to deny it. This is the single most common way a self-hosted database ends
  up public.
- **The app and the API are the same origin.** That is what lets the refresh
  cookie stay `SameSite=Strict`, and it keeps CORS out of the request path.

---

## Prerequisites

- Ubuntu 22.04 or 24.04 with Docker Engine and the Compose plugin
  (`curl -fsSL https://get.docker.com | sh`)
- A domain whose A record already points at the VPS — Caddy requests a
  certificate on first start, and Let's Encrypt rate-limits repeated failures
- Ports 80 and 443 reachable from the internet (80 is required for the
  ACME challenge, not just for the redirect)

## First deploy

```bash
git clone <your-repo> /opt/patient-book && cd /opt/patient-book
```

```bash
cp .env.production.example .env && chmod 600 .env
```

Fill in every value. Generate the three secrets separately:

```bash
openssl rand -base64 48
```

The API refuses to boot in production with placeholder, short, or reused
secrets, so a half-filled file fails loudly at startup rather than quietly
running something insecure.

```bash
sudo ./ops/deploy/install.sh
```

That creates the state directory, prepares `/etc/patient-book` for the backup
key, and installs the nightly backup timer. Then:

```bash
./ops/deploy/deploy.sh
```

Create the first administrator, once:

```bash
docker compose -f compose.prod.yml run --rm api node apps/api/dist/database/seeds/run-seed.js
```

Sign in at `https://<your-domain>` with `SEED_ADMIN_USERNAME` /
`SEED_ADMIN_PASSWORD`. The account must change its password before any patient
data unlocks, and doing so signs it out — that is intended; sign back in with
the new password.

## Shipping a change

```bash
git pull && ./ops/deploy/deploy.sh
```

Migrations run as their own one-shot service that the API waits on, so the
schema is always current before new code serves a request.

## Everyday commands

```bash
docker compose -f compose.prod.yml ps
```

```bash
docker compose -f compose.prod.yml logs -f api
```

```bash
docker compose -f compose.prod.yml exec db psql -U dental -d patient_book
```

## Firewall

Allow SSH **before** enabling the firewall, or you will lock yourself out:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

Remember that `ufw` does not govern published Docker ports. Nothing in this
stack publishes anything but 80 and 443, which is what makes that safe here —
keep it that way.

---

## Backups

A systemd timer runs `pb-backup.sh` nightly at 21:00. The dump runs *inside*
the Postgres container, so it needs no client on the host and its version
always matches the server. Output is gzipped and AES-256 encrypted before it
touches disk, with 7 daily and 4 weekly copies kept.

```bash
systemctl list-timers patient-book-backup.timer
```

```bash
sudo systemctl start patient-book-backup.service   # run one now
```

```bash
journalctl -u patient-book-backup.service -n 50
```

**The encryption key lives at `/etc/patient-book/backup.key`, root-only.** It is
deliberately outside the directory bind-mounted into the API container: a
compromise of the web application should not hand over the key that decrypts
every backup of the records it holds. Copy it somewhere off this server —
without it, every backup is unreadable.

Because dumps are encrypted before they are written, pointing the destination
at a cloud-synced folder is a supported setup; the sync provider never holds
readable records. Change the destination on the app's settings screen, or with
`PB_BACKUP_DIR`. A destination outside `PB_HOME_DIR` must also be bind-mounted
into the API container at the identical path, or the settings screen cannot
verify that it exists and is writable.

### Prove a backup restores

A backup that has never been restored is not a recovery plan. The drill
restores the newest backup into a throwaway database, checks that patients came
back, and drops it. The live database is never touched.

```bash
sudo ./ops/deploy/pb-restore-drill.sh
```

### Real recovery

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass file:/etc/patient-book/backup.key \
  -in /srv/patient-book/home/PatientBookBackups/daily/<file>.sql.gz.enc \
  | gunzip \
  | docker compose -f compose.prod.yml exec -T db psql -U dental -d patient_book
```

Plain SQL rather than `pg_dump`'s custom format is on purpose: in a real
recovery someone may be working from a different machine under time pressure,
and this needs no matching `pg_restore` and no expertise beyond following these
lines.

---

## Troubleshooting

**Caddy cannot get a certificate.** Check that the domain resolves to this host
and that port 80 is open — the ACME HTTP challenge needs it.
`docker compose -f compose.prod.yml logs web` shows the reason.

**The API will not start.** It validates its configuration before listening;
`docker compose -f compose.prod.yml logs api` names the offending variable.
Every production check is about a real risk: placeholder secrets, a short
database password, a non-HTTPS origin.

**The site loads but has no styling or icons.** Something is blocking the
stylesheet. Check the browser console for a Content-Security-Policy error and
see the note on `inlineCritical` in `apps/web/angular.json` before relaxing the
policy in `Caddyfile`.

**Migrations failed and the API never started.** That ordering is intentional.
`docker compose -f compose.prod.yml logs migrate` shows what failed; fix it and
re-run `./ops/deploy/deploy.sh`.
