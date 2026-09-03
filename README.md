# Dentixo — سامانه هوشمند مدیریت مطب دندانپزشکی

A practice management system for a dental clinic — patient records, implant and
ortho registers, and the surgery waiting list

**Stack:** NestJS 11 · Angular 22 · Angular Material 22 (Material 3) · PostgreSQL 17 · TypeORM

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

Start PostgreSQL, then create the schema and seed the treatment catalogue plus
the first administrator:

```bash
npm run db:up && npm run migration:run && npm run seed
```

Run both apps:

```bash
npm run dev
```

| Service            | URL                              |
| ------------------ | -------------------------------- |
| Web app            | http://localhost:4200            |
| API                | http://localhost:3000/api        |
| Database readiness | http://localhost:3000/api/health |
| API docs (Swagger) | http://localhost:3000/api/docs   |

Swagger is registered only when `NODE_ENV` is not `production`, so the schema of
the patient API is not published from a live deployment.

Sign in with the credentials from `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`.
The first administrator is required to replace the seed password before the API
will allow access to patient data. Production seeding rejects missing, short, or
placeholder passwords.

### Running Postgres without Docker

Homebrew works just as well, and is the better option on a network that cannot
reach Docker Hub:

```bash
brew install postgresql@17 && brew services start postgresql@17
```

```bash
createuser -s dental && createdb -O dental patient_book
```

Only one of the two can hold port 5432. Stop the other first
(`brew services stop postgresql@17`, or `docker compose down`), or give the
container a different host port with `DB_PORT`.

### Importing an existing register

The importer reads an Excel workbook and is intended for practices migrating off
a spreadsheet. Place the file at `data/patients-source.xlsx` — the `data/`
directory is gitignored — and run:

```bash
npm run import
```

Nothing is discarded and nothing is invented: unparseable values are kept
verbatim and surfaced for review rather than being guessed at or dropped.
Re-running against a populated database is refused unless `--force` is passed.

---

## Why the schema looks like this

Three characteristics of paper dental registers drove the data model. They are
worth understanding before changing the import or the entities.

### Registers use independent numbering that collides

The implant and orthodontic books each run their **own** `شماره پرونده`
sequence. Those sequences overlap numerically with the main patient file
numbers while referring to entirely different people, and numbers get reassigned
as old books are retired.

Joining the registers to patients on their number would therefore mislink
records. The import matches **by name** instead, and stores each register's
number in its own `registryNo` column with no foreign key to `patients.fileNo`.
Every link records how it was established (`exact`, `fuzzy`, `manual`,
`unmatched`), and unmatched rows stay visible in the UI rather than being
attached to a plausible guess.

`PatientNameMatcher` owns this rule, including its refusal to choose between two
patients who share a name.

### The surgery list quotes register numbers, not patient files

Surgery queue rows reference the **implant register** number. Because those
numbers are reused over time, a row can name a different person than the
register's current holder. Such rows are flagged `hasNameMismatch`, and the app
asks staff to confirm identity before operating rather than silently attaching
the row to whoever holds the number today.

### Dates are free-form Jalali, and often imprecise

Handwritten birth dates arrive as a bare year, a year and month, a full date, or
a two-digit year — and a fraction are simply impossible. Padding a bare year to
`۱۳۶۸/۰۱/۰۱` would invent a birthday nobody recorded, so each date is stored
three ways:

- `birthDate` — the parsed Gregorian date, for sorting and filtering
- `birthDatePrecision` — `day` / `month` / `year`
- `birthDateRaw` — exactly what the source said

The UI renders each at its true precision. Values that cannot be parsed at all
are kept verbatim and surfaced as a review item on the patient's record.

---

## Persian text handling

Persian data mixes Arabic and Persian codepoints for letters that read
identically (ي/ی, ك/ک), uses three different digit sets, and relies on a
zero-width non-joiner that carries meaning. Two normalisers live in
`apps/api/src/common/utils/persian.util.ts` and they are **not** interchangeable:

- **`normalizeForDisplay`** — for anything stored and shown back. Repairs
  keyboard artefacts only. A patient who writes their name «آزمون» gets «آزمون»
  back, not «ازمون».
- **`normalizePersian` / `searchKey`** — for the search column. Deliberately
  lossy, so آ and ا, ة and ه, ي and ی all collapse together.

This means a receptionist can type `كريمي` (Arabic keyboard), `کریمی` (Persian),
or `۰۹۱۲…` (Persian digits) and find the same records. Search runs against a
denormalised `searchText` column backed by a **`pg_trgm` GIN index** — Postgres
ships no Persian full-text dictionary, so trigram similarity is what makes
partial Persian name search work.

National IDs are validated by their check digit, not just their length.

---

## Architecture

The API is layered so that the rules of the practice do not depend on the
framework, the database, or the file format the data arrived in.

```
apps/api/src/
├── domain/              Pure TypeScript. No @nestjs/*, no typeorm, no I/O.
│   ├── errors/          ErrorCode + DomainError
│   ├── model/           enums, DataIssue
│   ├── value-objects/   JalaliDate, NationalId, MobileNumber, LandlineNumber
│   └── services/        Persian folding, attribute classifiers, name matcher
├── application/         Use cases, ports, cross-cutting services
│   ├── errors/          AppException — the one place codes meet HTTP statuses
│   ├── ports/           WorkbookPort and friends
│   └── services/        AuditService
├── infrastructure/      Adapters: TypeORM entities, the ExcelJS reader
├── presentation/http/   Controllers, filters, decorators, HTTP DTOs
└── modules/<feature>/   A feature's own application / infrastructure /
                         presentation pieces, kept together
```

Shared concerns live in the top-level layers; a feature's own code stays in its
folder rather than being scattered across four directories.

### What this buys

**The domain is testable without a database.** `JalaliDate`, `NationalId` and
`PatientNameMatcher` are plain classes; their tests need no container and no Nest
testing module.

**Invalid values cannot reach the database.** A `NationalId` can only be
constructed through a factory that has already checked its length and check
digit, so "a string that might be an id" is not a type the persistence layer can
be handed.

**Ports keep the import honest.** `ImportWorkbookUseCase` depends on
`WorkbookPort` — "rows of text" — not on ExcelJS. The mapping rules are tested
against plain arrays.

### Errors: codes, not sentences

The API never returns prose to be shown to a user. Every failure is a stable
code plus the values needed to render it:

```json
{
  "statusCode": 409,
  "code": "ERR_FILE_NUMBER_TAKEN",
  "params": { "fileNo": "10001" },
  "message": "File number 10001 already exists",
  "path": "/api/patients",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

`message` is English, for logs and for anyone reading the API directly. The
client renders `code` and `params` in whatever language it speaks. Validation
failures arrive the same way, keyed by field path:

```json
{
  "code": "ERR_VALIDATION_FAILED",
  "fieldErrors": {
    "fileNo": [{ "code": "matches", "params": {} }],
    "nationalId": [{ "code": "nationalId", "params": {} }]
  }
}
```

This is also why `dataIssues` on a patient record stores codes rather than a
Persian sentence frozen into the database at import time.

### Data model

| Table                | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `patients`           | The main register. Soft-deleted, never destroyed.          |
| `treatment_types`    | The procedure catalogue, seeded from code.                 |
| `patient_treatments` | Join, with room for a date and note.                       |
| `referral_sources`   | نحوه آشنایی, deduplicated on its Persian-folded form.      |
| `implant_cases`      | Implant register — **its own numbering**.                  |
| `ortho_cases`        | Ortho register — **its own numbering**.                    |
| `surgery_queue`      | Second-stage surgery list, linked to the implant register. |
| `users`              | Staff accounts.                                            |
| `audit_logs`         | Append-only record of who changed what.                    |

### Security

- Short-lived JWT access tokens are held in browser memory, while refresh tokens
  use `HttpOnly`, `SameSite=Strict` cookies (`Secure` in production). Patient
  sessions are therefore not persisted in `localStorage` and are not readable by
  browser JavaScript.
- A `tokenVersion` on each user means a password change, logout, or deactivation
  revokes existing refresh sessions. Seeded administrators must change their
  initial password before they can access patient endpoints.
- Every endpoint requires authentication by default; opting out is explicit
  (`@Public()`), so a new controller cannot accidentally expose patient records.
- Roles: `admin` · `dentist` · `receptionist` · `viewer`. The frontend hides what
  a role cannot do; the API re-checks every request regardless.
- Login is rate-limited to 5 attempts per minute, per client address. Unknown
  usernames and wrong passwords return the same message and run the same bcrypt
  comparison, so the response leaks neither existence nor timing.
- `TRUST_PROXY` is the number of reverse-proxy hops in front of the API — 1
  behind a single nginx, which is the production default. It is what makes
  "per client address" true: without it every request appears to come from the
  proxy, so one mistyped password rate-limits the whole practice and every
  audit row records the proxy instead of the person. It is a hop count rather
  than a flag because trusting the entire forwarded chain would let a client
  forge `X-Forwarded-For` and evade the login limit outright.
- Errors return a code, never an internal message. Unmapped failures are logged
  server-side and answered with a fixed `ERR_UNEXPECTED`, so a driver string or
  a filesystem path cannot reach the browser through an unhandled exception.
- Patient, implant, orthodontic, and surgery records are **archived, never
  deleted** — a dental record is a legal document. Users are deactivated rather
  than removed so audit rows keep pointing at a real person.
- Patient, registry, surgery, referral-catalogue, and user-administration writes
  commit with their audit records in the same database transaction, so a
  successful office change cannot silently lose its audit trail.
- The Excel export is admin-only and writes an `export` audit entry recording who
  exported, from where, and how many rows — a whole-register extract is exactly
  the event an audit trail exists for. Row counts only; never exported values.
- Swagger is disabled in production, and production startup refuses
  development/placeholder secrets, short database passwords, missing browser
  origins, and non-HTTPS CORS origins.

---

## Deploying

The production stack — Postgres, the API, and Caddy serving the Angular bundle
with automatic TLS — is four containers described by
[`compose.prod.yml`](compose.prod.yml). The runbook is
[`ops/deploy/README.md`](ops/deploy/README.md).

```bash
cp .env.production.example .env && chmod 600 .env
```

```bash
sudo ./ops/deploy/install.sh && ./ops/deploy/deploy.sh
```

Postgres publishes no port in production: it is reachable only on the internal
Docker network. Publishing it even on `127.0.0.1` is worth avoiding, because
Docker inserts its own iptables rules ahead of `ufw` — a published port stays
reachable from the internet while the firewall reports it as denied.

The app and the API are served from one origin, which is what lets the refresh
cookie stay `SameSite=Strict` and keeps CORS out of the request path entirely.

Caddy rather than nginx with certbot: certificates are obtained and renewed
without a cron job, so an expired certificate is not a way for the practice to
lose access to its records on a Sunday.

---

## Backups

On the VPS, a systemd timer runs nightly encrypted `pg_dump` backups with
retention and a restore drill — see [`ops/deploy/`](ops/deploy/README.md).
The macOS equivalent, for a practice running this on an office Mac under
launchd, is [`ops/backup/`](ops/backup/README.md).

```bash
./ops/backup/install.sh          # macOS: install the scheduled job
./ops/backup/pb-restore-drill.sh # macOS: prove the newest backup restores
```

```bash
sudo ./ops/deploy/install.sh          # Linux/VPS: install the systemd timer
sudo ./ops/deploy/pb-restore-drill.sh # Linux/VPS: prove the newest backup restores
```

Backups are AES-256 encrypted before they touch disk, which is what makes it
safe to point `PB_BACKUP_DIR` at an external drive or a cloud-synced folder: the
sync provider never sees plaintext. A backup that has never been restored is not
a recovery plan — run the drill.

---

## Internationalisation

All user-facing text is resolved at runtime by `@ngx-translate` from
`apps/web/public/i18n/fa.json`. Nothing a user reads is hard-coded in an
application template or component, and the API contributes no wording at all.

Templates use stable, semantic keys:

```html
<h2>{{ 'auth.heading' | translate }}</h2>
```

TypeScript services resolve the same keys when they need messages for errors,
dialogs, snackbars, route titles, or Material controls:

```ts
return this.i18n.instant("error.fileNumberTaken", { fileNo });
```

Enum label helpers return translation keys, while dynamic practice data such as
treatment and referral names remains data and is not translated as interface
copy.

### Adding a language

Copy `apps/web/public/i18n/fa.json` to `en.json`, preserve its key structure and
placeholders, and translate only the values. Then switch at runtime:

```ts
translate.use("en");
```

The loader reads `public/i18n/<language>.json`, so adding a language does not
require rebuilding templates or producing a separate Angular bundle. A language
selector should also update the document's `lang` and `dir` attributes.

`npm run i18n:check` validates the JSON, rejects missing keys, and fails if
Persian UI literals, visible English template copy, legacy `i18n` markers, or
`$localize` calls are reintroduced.

### What the API contributes

Nothing. It returns `ERR_FILE_NUMBER_TAKEN` with a file number, and
`ApiErrorTranslator` on the frontend decides how that reads in Persian. Swagger
summaries and developer messages are English, because their audience is
developers.

The one deliberate exception is _data_: worksheet names, seeded treatment names
and the seeded administrator's display name stay Persian, because they are values
the practice owns rather than labels the app chose.

## UI notes

**Icons: Material Symbols, not Font Awesome.** It is the Material 3 native set,
`<mat-icon>` renders its ligatures with no extra configuration, and its variable
axes (`FILL`, `wght`, `GRAD`, `opsz`) drive the M3 selection idiom where the
active nav item fills in. It is self-hosted, so the clinic has no CDN dependency.

**Layout** adapts at three sizes, not two: a phone gets a thumb-reachable bottom
bar, a tablet a collapsible drawer, a desktop a permanent rail. The patient list
becomes cards below 900px, where a seven-column table is unusable.

**Components share one M3 vocabulary.** Global and list search use the same
search-field primitive; profile, patient, and account identities use the same
avatar primitive; status colors use semantic M3 chips; and list/form pages share
one page header. App-level spacing, control, avatar, and page-width tokens prevent
each feature from inventing its own dimensions.

**Dates** run through a custom `JalaliDateAdapter`, so the Material datepicker
counts months the Jalali way — the first six have 31 days, the next five 30, and
Esfand 29 or 30 by leap year. Deriving that from the Gregorian calendar would be
wrong about half the time.

**Numerals** are Persian (۰۱۲۳) for counts and dates, matching the paper charts
this replaces. Phone numbers, file numbers and national IDs stay Latin and are
isolated with `direction: ltr`, because the bidi algorithm otherwise reorders
them.

---

## Commands

| Command                                      | Does                                             |
| -------------------------------------------- | ------------------------------------------------ |
| `npm run dev`                                | API and web app together                         |
| `npm run dev:api` / `npm run dev:web`        | Either one alone                                 |
| `npm run build`                              | Production build of both                         |
| `npm test`                                   | API and web unit tests (no database needed)      |
| `npm run test:e2e`                           | API readiness test (requires PostgreSQL)         |
| `npm run i18n:check`                         | Validate JSON keys and reject hard-coded UI text |
| `npm run migration:run` / `migration:revert` | Schema                                           |
| `npm run seed`                               | Treatment catalogue + admin account              |
| `npm run import -- [file] [--force]`         | Load a source workbook                           |
| `npm run db:up` / `db:down`                  | Postgres via Docker                              |

---

## Before going live

1. Configure unique `JWT_SECRET` and `JWT_REFRESH_SECRET` values
   (`openssl rand -base64 48`), a strong database password, a strong
   `SEED_ADMIN_PASSWORD`, and the exact HTTPS frontend URL in `CORS_ORIGIN`.
2. Deploy the API and web app together, then run `npm run migration:run` before
   opening the new release.
3. Serve both sides over HTTPS and verify `GET /api/health` through the same
   reverse proxy staff will use.
4. Install the backup job and complete a restore drill (see
   [`ops/backup/`](ops/backup/README.md)), then arrange an off-machine copy.
5. Work through any items the import flagged for review — the dashboard links
   straight to them, and clearing one is a single click on the patient's record.
6. Run a short pilot with each real role and verify login, password change,
   patient create/edit/archive/restore, treatment changes, search, audit history,
   session expiry, and backup recovery before using it as the office system of
   record.
