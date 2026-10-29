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

Do not use `reconcile.sh` for this. That tool matches rows to records that
already exist by file number and corrects fields on them; it never creates
records, so a workbook fed into an empty register reports every row as
unmatched. The importer above is the answer.

### Loading the stock workbook

The inventory (انبار) is loaded the same way, from the practice's stock
workbook, after a deploy has run the inventory migrations:

```bash
./ops/deploy/import-inventory.sh ~/stock.xlsx           # preview: every renamed item, every unreadable cell
./ops/deploy/import-inventory.sh ~/stock.xlsx --apply   # write it, once
```

The same script loads the normalized stock list (`inventory-normalized.xlsx`:
one «Inventory» table with codes, reorder levels and lots) — it tells the two
apart by that sheet. Add `--replace` to swap the whole inventory for the
workbook in one transaction; its preview says what it replaces.

The preview writes nothing; read it before `--apply`. `--apply` refuses an
inventory that already has items. Each item's opening count is a line on its
stock card naming the sheet and cell it came from.

### Export and reconcile

The other half of the Excel round-trip, also run inside the API image:

```bash
./ops/deploy/export.sh [output.xlsx]              # snapshot the register; default ./patient-book-<date>.xlsx
./ops/deploy/reconcile.sh workbook.xlsx           # preview: print every field that would change
./ops/deploy/reconcile.sh workbook.xlsx --apply   # write exactly those changes
```

Neither has a screen in the app on purpose: an export is a bulk extract of
patient data and a reconcile rewrites records, so both stay with whoever has
shell access to this server. Both are recorded in the audit log as
`cli:<user>`. An exported workbook is patient data — keep it off the server
once you have it, and delete the copy you upload for a reconcile afterwards.

### Implant records from before the current rules

Once, after deploying the release that links a stock card line to its
follow-up (migration `InventoryMovementSurgery`):

```bash
./ops/deploy/implant-cleanup.sh            # preview: what would change, nothing written
sudo systemctl start patient-book-backup.service
./ops/deploy/implant-cleanup.sh --apply    # write exactly that
```

- **Stock card lines.** Older implant uses get linked to the follow-up they
  went into, so the card lists them. Their teeth are added where the rows they
  wrote say which tooth; a day whose uses were already joined on one row keeps
  its boxes without teeth.
- **Same-day follow-ups.** Follow-ups the stock once wrote one per implant are
  merged into one per patient per day, as long as none has been called about,
  booked or declined. Any other such day is listed, to be settled on the
  cards.
- **Implant files.** A patient linked to more than one implant file keeps one:
  the file the stock writes to, else one linked by hand, else the first
  opened. The others are unlinked, not merged: the import linked them by name,
  and two patients can share a name. Each is then settled from the implant
  register's list of unlinked files.

The preview runs everything in a transaction and rolls it back, so it is
exactly what `--apply` writes. It prints file and register numbers, never
names. Running it again changes nothing.

## Shipping a change

```bash
git pull && ./ops/deploy/deploy.sh
```

Migrations run as their own one-shot service that the API waits on, so the
schema is always current before new code serves a request. Just before them,
`deploy.sh` dumps the database into `predeploy/` in the backup directory (the
last 3 are kept, apart from the nightly ones); it asks for `sudo` because the
backup key is root-only, and if the dump fails, nothing is deployed.

The **Deploy** workflow on GitHub runs the same thing over SSH with no
terminal, where `sudo` cannot ask for a password. `install.sh` lets the
account that ran it (or `PB_DEPLOY_USER=<name>`) run exactly that dump as
root without one. A server set up before this needs it once, as that
account:

```bash
sudo ./ops/deploy/install.sh
```

Without it, a deploy from the button stops before migrating, with nothing
changed, and says so.

Write each release's migrations so the release before it still runs on the
new schema: add tables, and columns that are nullable or have a default.
Dropping or renaming a column, or rewriting data already stored, goes in a
later release, once code that no longer uses it is live. That keeps the
first, quick rollback below always available.

### Rolling back a release

Find the commit that ran before the last pull — the line before the newest
`pull` in:

```bash
git reflog -n 10
```

**If the release only added to the schema** (the usual case), run that
commit again. The data stays as it is, including what was written since the
deploy:

```bash
git checkout <commit> && ./ops/deploy/deploy.sh
```

**If its migrations dropped, renamed or rewrote data**, or the older code
fails on the new schema, go back to the dump taken just before the deploy.
Everything written since then leaves the live database, so note what staff
recorded in between; it stays readable in `patient_book_before_restore`.

1. Build the older release, without deploying it. The restore runs `migrate`
   from the images the checkout last built, and those must be the older
   release's, or they would apply the very migrations you are undoing:

   ```bash
   git checkout <commit> && docker compose -f compose.prod.yml build
   ```

2. Follow [Real recovery](#real-recovery) with the newest file in
   `predeploy/` instead of `daily/`. Its first step should report no
   migration as "now applied"; if it names one, step 1 did not happen —
   drop `patient_book_restore` and start again. `--switch` then starts the
   app on the images from step 1, the older release.

Either way, `git checkout main && git pull` puts the checkout back on the
branch once a fix is merged; then deploy as usual.

**Upgrading from a build that had a backup screen in Settings:** the backup
path is now read from `PB_BACKUP_DIR` in `.env` only; the
`.patient-book/backup-dir` file that screen wrote is ignored. If you ever
changed the path there, copy it into `.env` before the next nightly run, or
backups quietly return to the default `$PB_HOME_DIR/PatientBookBackups`.

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
  `DELETE` on every table except `audit_logs`, which it can only read and
  append to — nothing else, no `CREATE`, no `DROP`, no `ALTER`, not superuser. A compromise of the web application gets read/write access
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
touches disk, with 7 daily and 4 weekly copies kept. Each deploy adds one
more to `predeploy/` (see [Rolling back a release](#rolling-back-a-release)).
Every good nightly run is then restore-tested
([Prove a backup restores](#prove-a-backup-restores)).

Everything at a glance — the last backup, the last restore test, the
off-server copy and the key — exiting non-zero when something needs
attention:

```bash
sudo ./ops/deploy/pb-backup-status.sh
```

```bash
sudo systemctl start patient-book-backup.service   # run one now
```

```bash
journalctl -u patient-book-backup.service -n 50
```

A server set up before the restore test needs `sudo ./ops/deploy/install.sh`
once to get it; until then every deploy says so.

**The encryption key lives at `/etc/patient-book/backup.key`, root-only.** It is
deliberately outside the directory bind-mounted into the API container: a
compromise of the web application should not hand over the key that decrypts
every backup of the records it holds. Copy it somewhere off this server —
without it, every backup is unreadable.

Because dumps are encrypted before they are written, pointing the destination
at a cloud-synced folder is a supported setup; the sync provider never holds
readable records. The destination is `PB_BACKUP_DIR` in `.env` — the
application has no backup settings, so this file is the only place it is
configured — and the timer picks a change up on its next run.

The status script prints the key's fingerprint. To check that the copy you
keep elsewhere is the same key, run this on that copy and compare:

```bash
openssl dgst -sha256 -r backup.key | cut -c1-16
```

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
— no local mount, nothing else to install. `last-offsite-success` in the
backup directory records the last successful mirror, and a failed one fails
the whole run, so a broken remote is as visible as a failed backup.

Already have a network share or an `rclone mount` and would rather point at a
real path instead of shelling out to `rclone` per file? Set `PB_OFFSITE_DIR`
to that directory instead (or as well) — same mirroring, just a plain `cp`.
Either way, until one of these is set, the only copy is on this VPS.

### What the server keeps

Every run prunes as it goes, so the backup directory stays the same size
from month to month:

| What | Kept | Change with |
| --- | --- | --- |
| `daily/` | newest 7 | `PB_KEEP_DAILY` |
| `weekly/` | newest 4 | `PB_KEEP_WEEKLY` |
| `predeploy/` | newest 3 | `PB_KEEP_PREDEPLOY` |
| Offsite copy | same counts as `daily/` and `weekly/` | the same |
| `backup.log` | last 2000 lines, about a year | — |

The counts go in `.env`. Lowering one takes effect on the next run, which
removes the extra files. To see what it all takes on disk:

```bash
sudo du -sh /srv/patient-book/home/PatientBookBackups/*
```

The one thing no run removes on its own is a spare copy of the database: the
`patient_book_before_restore` a recovery leaves as its fallback, a
`patient_book_restore` that was never switched to, or a
`patient_book_drill_…` left by a drill that was killed half-way. Each holds
every patient record, so as long as one exists, every backup and every deploy
prints a warning naming it. Once you no longer need it:

```bash
docker compose -f compose.prod.yml exec -T db psql -U dental -d postgres \
  -c 'DROP DATABASE <name>;'
```

### Prove a backup restores

A backup that has never been restored is not a recovery plan. Straight after
every good nightly backup, systemd runs `pb-restore-drill.sh`
(`patient-book-drill.service`). It restores the newest dump into a throwaway
database with the same steps a real recovery takes — they live in
`restore-lib.sh`, shared with `pb-restore.sh` — provisions the API's role on
it, reads every table back **as that role**, and drops it. The live database
is never touched. `last-drill` records the last pass, and the status script
flags it once that is more than a day old.

```bash
journalctl -u patient-book-drill.service -n 20   # the last test
```

```bash
sudo ./ops/deploy/pb-restore-drill.sh            # one now
```

### Real recovery

**Read this before you need it.** `pb-restore.sh` does it in three commands,
each of which changes one thing and says what it did. Its restore steps are
the ones the nightly test runs, so a passing test means they work on this
server as it is today.

**1. Restore into a new database.** The live `patient_book` is not touched,
and the app stays up:

```bash
sudo ./ops/deploy/pb-restore.sh /srv/patient-book/home/PatientBookBackups/daily/<file>.sql.gz.enc
```

`sudo` because the key and the backups are root-only. It reads the whole file
through first, so a wrong key or a damaged or cut-short file stops it before
anything is created. Then it restores into `patient_book_restore`, runs
`migrate` against it — which grants the API's role (the dump carries no
grants), and applies any migration newer than the backup, naming it — reads
every table back as that role, and prints each table's rows in the backup
beside the live database's.

**2. Look before you switch.** Compare the counts with what you expect, and
spot-check a patient or two:

```bash
docker compose -f compose.prod.yml exec db psql -U dental -d patient_book_restore
```

On any doubt, stop here: drop `patient_book_restore` (the command is in the
output) and nothing has changed.

**3. Switch the app over:**

```bash
./ops/deploy/pb-restore.sh --switch
```

It stops the API, then renames `patient_book` to `patient_book_before_restore`
and `patient_book_restore` to `patient_book` in one transaction — both happen
or neither does, so there is never a moment with no live database — and
starts the app again. `DB_NAME` never changes, so nothing needs
reconfiguring.

**4. Confirm the app looks right.** If it does not, put the previous database
back:

```bash
./ops/deploy/pb-restore.sh --undo
```

Anything staff entered between the backup and the switch is still in
`patient_book_before_restore`. Once you are sure, drop it (the command is in
the output of `--switch`). That is the only step here that cannot be undone,
and every backup run reminds you while it is there.

Why a script and not a pipe into `psql`: without `pipefail`, a stream that
breaks half-way still ends in `psql`'s success. Tested on this setup, a backup
cut at a line boundary loaded that way exits 0 holding about half the rows
and none of the indexes, and a patient count alone does not show it.

### If the server itself is gone

1. Put the backup key back before anything else, at
   `/etc/patient-book/backup.key` (root, `chmod 600`). The first backup run
   generates a new key when none is there, and that one cannot read the old
   backups.
2. Set up the new server as in [First deploy](#first-deploy), up to and
   including `deploy.sh`. Skip creating the administrator: the backup has
   the accounts.
3. Fetch a backup from the off-server copy, for example
   `sudo rclone copy dropbox:PatientBookBackups/daily/<file> /root/`, and
   follow [Real recovery](#real-recovery) with it.

To read a backup on some other machine, decrypt it with the key and load it
with `psql` from **Postgres 17.6 or newer** (`-v ON_ERROR_STOP=1`): the dump
opens with commands older versions reject.

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:backup.key -in <file>.sql.gz.enc | gunzip > patient-book.sql
```

That file is every record in plain text; delete it when you are done.

Plain SQL rather than `pg_dump`'s custom format is on purpose throughout: in a
real recovery someone may be working from a different machine under time
pressure, and none of this needs a matching `pg_restore`.

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
