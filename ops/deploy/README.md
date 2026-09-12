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

Fill in every value. Generate each secret (`DB_PASSWORD`, `DB_APP_PASSWORD`,
`JWT_SECRET`, `JWT_REFRESH_SECRET`) separately:

```bash
openssl rand -base64 48
```

`DB_USER`/`DB_PASSWORD` is the Postgres superuser, used only to initialize the
database and run migrations. `DB_APP_USER`/`DB_APP_PASSWORD` is what the API
actually connects with day to day; `migrate` creates that role automatically
on first deploy and keeps its grants and password in sync on every deploy
after — see [Database roles](#database-roles).

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

## Loading the existing register

Copy the practice's workbook to the server (`scp workbook.xlsx user@vps:`),
then run the importer once, after the seed above:

```bash
./ops/deploy/import.sh ~/workbook.xlsx
```

It runs the one-shot migration importer inside the API image, prints a report
of what it created and what it flagged for review, and refuses to run a
second time against a populated database (pass `--force` after clearing it —
the refusal message shows the exact `TRUNCATE`). Delete the copy on the server
afterwards; it is patient data.

Do not use the **Excel upload on the settings page** for this. That is the
*reconcile* tool: it matches rows to records that already exist by file
number and proposes field corrections. It never creates records, so a workbook
uploaded into an empty register reports every row as unmatched and "no
differences" — the page now says so, but the importer above is the answer.

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

## Database roles

Two roles, not one:

- **`DB_USER`** (Postgres superuser) — created by the official image at
  initdb, used by `migrate` to run schema migrations and by the nightly
  backup to `pg_dump` everything. Nothing else connects with it.
- **`DB_APP_USER`** — what the running API connects as. `migrate` provisions
  it after every migration (`ensure-app-role.ts`): `SELECT`/`INSERT`/`UPDATE`/
  `DELETE` on every table, nothing else — no `CREATE`, no `DROP`, no `ALTER`,
  not superuser. A compromise of the web application gets read/write access
  to patient rows, not the ability to touch the schema or any other database
  on the server.

Rotating `DB_APP_PASSWORD` takes effect on the next deploy — `migrate` runs
`ALTER ROLE` for you, there is nothing else to update. There is no equivalent
automation for `DB_PASSWORD` (the superuser): that one is only ever read by
`db`, `migrate`, and the backup script, so rotating it means updating `.env`
and restarting the stack.

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

### Off-server copies

The setup above still keeps every copy on this one VPS: losing the disk loses
the database and every backup with it. Closing that gap needs a copy that
lives somewhere else — the easiest way on a headless box is
[`rclone`](https://rclone.org), which pushes straight to Dropbox, Google
Drive, or almost anything else with no mount and no daemon to keep alive:

```bash
sudo apt install rclone
rclone config                 # choose "n" for new remote, then Dropbox or
                               # Drive; it opens a one-time authorization link
```

That saves a token under `/root/.config/rclone/rclone.conf`. Name the remote
whatever you like during `rclone config` (the examples here use `dropbox`);
then add one line to `.env`:

```bash
PB_OFFSITE_REMOTE=dropbox:PatientBookBackups
```

The next nightly run copies the new dump straight there with `rclone copyto`
— no local mount, nothing else to install. The settings screen shows the last
successful offsite mirror alongside the local backup status, so a broken
remote is as visible as a failed backup.

Already have a network share or an `rclone mount` and would rather point at a
real path instead of shelling out to `rclone` per file? Set `PB_OFFSITE_DIR`
to that directory instead (or as well) — same mirroring, just a plain `cp`.
Either way, until one of these is set, the only copy is on this VPS.

### Prove a backup restores

A backup that has never been restored is not a recovery plan. The drill
restores the newest backup into a throwaway database, checks that patients came
back, and drops it. The live database is never touched.

```bash
sudo ./ops/deploy/pb-restore-drill.sh
```

### Real recovery

**Read this before you need it.** Piping the dump straight into `psql -d
patient_book` is exactly what the drill above avoids, and for good reason:
Postgres does not stop on a SQL error by default, so a truncated download or
a version mismatch would not fail loudly — `psql` carries on to the next
statement and exits looking successful, leaving `patient_book` with some
tables dropped (the dump uses `--clean --if-exists`) and never recreated.
Restore into a new database instead, confirm it looks right, then switch the
app over. The app stays up for every step except the last two.

**1. Restore into a new database** — `patient_book` is not touched here:

```bash
docker compose -f compose.prod.yml exec -T db psql -U dental -d postgres \
  -c 'CREATE DATABASE patient_book_restore;'

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass file:/etc/patient-book/backup.key \
  -in /srv/patient-book/home/PatientBookBackups/daily/<file>.sql.gz.enc \
  | gunzip \
  | docker compose -f compose.prod.yml exec -T db psql -U dental \
      -d patient_book_restore -v ON_ERROR_STOP=1
```

`-v ON_ERROR_STOP=1` — the same flag `pb-restore-drill.sh` already runs
with — is what turns a broken restore into a command that fails visibly
instead of one that quietly leaves half a schema behind.

**2. Validate before switching anything over:**

```bash
docker compose -f compose.prod.yml exec -T db psql -U dental \
  -d patient_book_restore -tAc 'SELECT count(*) FROM patients;'
```

Compare the count against what you expect, and spot-check a patient or two by
name while you are in there. Do not go further on any doubt — the live
database is still untouched.

**3. Stop the API**, so nothing writes to either database during the swap:

```bash
docker compose -f compose.prod.yml stop api
```

**4. Swap the names.** `DB_NAME` never changes — only which physical database
currently holds it — so the app needs no config change to come back up
against the restored data:

```bash
docker compose -f compose.prod.yml exec -T db psql -U dental -d postgres \
  -v ON_ERROR_STOP=1 <<'SQL'
ALTER DATABASE patient_book RENAME TO patient_book_before_restore;
ALTER DATABASE patient_book_restore RENAME TO patient_book;
SQL

docker compose -f compose.prod.yml start api
```

**5. Confirm the app looks right**, then drop the pre-restore database once
you no longer need it as a fallback:

```bash
docker compose -f compose.prod.yml exec -T db psql -U dental -d postgres \
  -c 'DROP DATABASE patient_book_before_restore;'
```

Keeping `patient_book_before_restore` around costs nothing but disk space
until you are sure — dropping it is the only step here that cannot be undone.

Plain SQL rather than `pg_dump`'s custom format is on purpose throughout: in a
real recovery someone may be working from a different machine under time
pressure, and none of this needs a matching `pg_restore` or any expertise
beyond following these steps in order.

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
