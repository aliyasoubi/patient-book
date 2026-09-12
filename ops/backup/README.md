# Database backup and recovery

Nightly encrypted backups of the patient-book database, with a restore drill
that proves they actually work.

| | |
|---|---|
| **Schedule** | Daily at 21:00 (launchd agent, runs as the logged-in user) |
| **Location** | `~/PatientBookBackups/` — `daily/` (7 kept) and `weekly/` (4 kept) |
| **Format** | `pg_dump` plain SQL → gzip → AES-256 (`.sql.gz.enc`) |
| **Key** | `~/.patient-book/backup.key` |
| **Size** | ~356 KB per dump |

---

## ⚠ The encryption key

Every backup is encrypted with `~/.patient-book/backup.key`. **Lose that file
and every backup is permanently unreadable.** It is generated once, on the
first run, and never rotated automatically.

Do this now, if you have not already:

1. Copy the key into a password manager, or print it and put it in the
   practice safe.
2. Keep that copy **somewhere other than where the backups live**. A key
   stored on the same external drive as the backups protects nothing — the
   whole point of encrypting is that losing the drive is survivable.

---

## Install

```bash
./ops/backup/install.sh
```

Safe to re-run — it reloads the agent in place. To remove it:

```bash
launchctl unload ~/Library/LaunchAgents/com.patientbook.backup.plist && rm ~/Library/LaunchAgents/com.patientbook.backup.plist
```

## Is it working?

```bash
cat ~/PatientBookBackups/last-success && ls -lh ~/PatientBookBackups/daily/
```

If a backup fails you get a desktop notification, and the settings screen
shows the failure instead of the last success until a run passes again.
Details land in `~/PatientBookBackups/backup.log`.

## Prove the backups still restore

Run this monthly. It restores the newest backup into a throwaway database,
compares every table against the live one, and drops it again. It never
writes to the live database.

```bash
./ops/backup/pb-restore-drill.sh
```

---

## Restoring for real

**Read this before you need it.** The dump is taken with `--clean`, so it
drops and recreates every table in whatever database you point it at.

**1. Stop the API** so nothing writes while you restore.

**2. If you are not certain the backup is good, restore into a copy first:**

```bash
createdb -U dental patient_book_check && openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:$HOME/.patient-book/backup.key -in ~/PatientBookBackups/daily/<FILE>.sql.gz.enc | gunzip | psql -U dental -d patient_book_check
```

Look around, confirm the data is there, then drop it: `dropdb -U dental patient_book_check`

**3. Restore over the live database:**

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:$HOME/.patient-book/backup.key -in ~/PatientBookBackups/daily/<FILE>.sql.gz.enc | gunzip | psql -U dental -d patient_book
```

**4. Restart the API** and confirm the patient count on the dashboard looks right.

---

## Off-machine copies

Backups written only to `~/PatientBookBackups/` survive accidental deletion, a
bad migration, or a corrupted table — but not theft, fire, or the SSD failing.
Set `PB_OFFSITE_DIR` (in `ops/backup/backup.env`) to a second directory and
every run also mirrors the encrypted file there, independent of the primary
copy — a sync hiccup on the second copy never puts the first at risk.

```bash
PB_OFFSITE_DIR="$HOME/Library/CloudStorage/GoogleDrive-you@example.com/My Drive/PatientBookBackups"
# or: PB_OFFSITE_DIR="$HOME/Dropbox/PatientBookBackups"
```

(Quoted because Google Drive's own folder is literally named "My Drive" —
this file is `source`d, so an unquoted space would split into two words.)

The script only ever `cp`s already-gzipped, already-AES-256-encrypted files
into that directory — it does not know or care which provider syncs it, and
the provider never sees readable records. On a Mac this is the easy case:
point it at the local folder the Dropbox or Google Drive desktop app already
keeps in sync, and the app does the rest. The settings screen shows the last
successful offsite mirror alongside the local backup status, so a stalled
sync is as visible as a failed backup.

If you would rather not run a cloud client at all, an external drive kept out
of the office works too — `PB_OFFSITE_DIR` just needs to be a writable path,
so it can point at a mounted drive instead. Either way, until `PB_OFFSITE_DIR`
is set, the only copy is on this Mac — treat that as protection against
mistakes, not against disasters.

## Configuration

Defaults come from the repo's `.env`. To override, create
`ops/backup/backup.env`:

```bash
PB_BACKUP_DIR=/Volumes/PracticeBackup/PatientBook
PB_KEEP_DAILY=14
```

| Variable | Default |
|---|---|
| `PB_BACKUP_DIR` | `~/PatientBookBackups` |
| `PB_OFFSITE_DIR` | unset — no offsite mirror until set |
| `PB_BACKUP_KEY` | `~/.patient-book/backup.key` |
| `PB_KEEP_DAILY` | `7` |
| `PB_KEEP_WEEKLY` | `4` |
| `PB_SCRATCH_DB` | `patient_book_restore_check` |
