# دفترچه بیماران — Patient Book

A patient register for a dental practice

**Stack:** NestJS 11 · Angular 22 · Angular Material 22 (Material 3) · PostgreSQL 17 · TypeORM 1

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

Start PostgreSQL (Docker), then create the schema and seed the catalogue plus
the first administrator:

```bash
npm run db:up && npm run migration:run && npm run seed
```

Import the practice's workbook (place it at `data/patients-source.xlsx`):

```bash
npm run import
```

Run both apps:

```bash
npm run dev
```

| Service | URL |
| --- | --- |
| Web app | http://localhost:4200 |
| API | http://localhost:3000/api |
| Database readiness | http://localhost:3000/api/health |
| API docs (Swagger) | http://localhost:3000/api/docs |

Sign in with the credentials from `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`.
The first administrator is required to replace the seed password before the API
will allow access to patient data. Production seeding rejects missing, short,
or placeholder passwords.

### If the Postgres image will not pull

Some networks reach `auth.docker.io` but not `registry-1.docker.io`, where the
image layers actually live. The pull then hangs for minutes instead of failing,
which makes it look like a slow download rather than a blocked host.

Check in a few seconds rather than waiting it out:

```bash
curl -s -o /dev/null -w '%{http_code}\n' --max-time 15 https://registry-1.docker.io/v2/
```

`401` means reachable. `000` means blocked — point `POSTGRES_IMAGE` at a mirror
of the same official image in your `.env`:

```bash
echo 'POSTGRES_IMAGE=public.ecr.aws/docker/library/postgres:17-alpine' >> .env
```

`docker-compose.yml` reads that variable and falls back to `postgres:17-alpine`,
so nothing changes on a network that can reach Docker Hub normally.

### Running Postgres without Docker

Homebrew works just as well:

```bash
brew install postgresql@17 && brew services start postgresql@17
```

```bash
createuser -s dental && createdb -O dental patient_book
```

Only one of the two can hold port 5432. Stop the other first
(`brew services stop postgresql@17`, or `docker compose down`), or give the
container a different host port with `DB_PORT`.

---

## What the data actually looked like

The source workbook holds four sheets and 2,233 rows. Three findings shaped the
schema, and each is worth knowing before you touch the data.

### 1. The registers use independent numbering that collides

`بیماران ایمپلنت` (implant) and `بیماران ارتو` (ortho) each run their **own**
`شماره پرونده` sequence, which overlaps numerically with the main patient file
numbers while referring to different people.

Of the 99 numbers present in both the implant sheet and the main sheet, **only 2
are the same person.** Joining the books on their number would have mislinked 97
patients — for example implant register `9904` is مرجان بشردوست, who holds main
file `9905`; main file `9904` is a different patient entirely.

The import therefore matches these registers to patients **by name**, and stores
each register's number in its own `registryNo` column with no foreign key to
`patients.fileNo`. Every link records how it was established (`exact`, `fuzzy`,
`manual`, `unmatched`) and unmatched rows stay visible in the UI rather than
being guessed at.

| Sheet | Rows | Linked exactly | Linked by name | Left unlinked |
| --- | ---: | ---: | ---: | ---: |
| بیماران ایمپلنت | 277 | 246 | 5 | 26 |
| بیماران ارتو | 140 | 47 | 1 | 92 |

Most unlinked ortho rows have no name in the source at all (only 61 of 140 do).

### 2. The surgery list quotes reused register numbers

`لیست انتظار جراحی` references the **implant register** number. That register has
had numbers reassigned over time: 6 of its rows name a different person than the
register's current holder. Those rows are flagged `hasNameMismatch` and the app
shows a warning asking staff to confirm identity before operating, rather than
silently attaching the row to whoever holds the number today.

### 3. Dates are free-form Jalali, and often imprecise

Birth dates appear as `1368`, `1365/8`, `1368/5/12`, `99/05/15` and a handful of
impossible values. Roughly **half of all birth dates are a bare year.**

Rather than padding those to `۱۳۶۸/۰۱/۰۱` and inventing a birthday, each date is
stored three ways:

- `birthDate` — the parsed Gregorian date, for sorting and filtering
- `birthDatePrecision` — `day` / `month` / `year`
- `birthDateRaw` — exactly what the sheet said

The UI renders each at its true precision. Values that cannot be parsed at all
(month 20, day 45, a Gregorian year in a Jalali column) are kept verbatim and
surfaced as a review item on the patient's record.

### Import results

```
پرونده              2,233 read · 1,656 imported · 577 skipped (reserved file
                    numbers with no name, phone, or clinical data)
بیماران ایمپلنت       277 read · 277 imported
بیماران ارتو          140 read · 140 imported
لیست انتظار جراحی      73 read · 73 imported
                    3,674 treatment records linked
                       87 values flagged for review
```

Nothing is discarded and nothing is invented. Re-running the import against a
populated database is refused unless `--force` is passed.

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

National IDs are validated by their check digit, not just their length, and
9-digit values are zero-padded first (spreadsheets routinely eat the leading
zero).

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
`PatientNameMatcher` are plain classes; their 81 tests need no container and no
Nest testing module.

**Invalid values cannot reach the database.** A `NationalId` can only be
constructed through a factory that has already checked its length and check
digit, so "a string that might be an id" is not a type the persistence layer can
be handed.

**The rule that matters most is a named thing.** `PatientNameMatcher` holds the
reason the registers are matched by name and not by number, along with its
refusal to guess between two patients who share a name. It is one class with one
job, and its tests read as a specification of that decision.

**Ports keep the import honest.** `ImportWorkbookUseCase` depends on
`WorkbookPort` — "rows of text" — not on ExcelJS. The mapping rules, which are
the practice-specific part, are tested against plain arrays.

### Errors: codes, not sentences

The API never returns prose to be shown to a user. Every failure is a stable
code plus the values needed to render it:

```json
{
  "statusCode": 409,
  "code": "ERR_FILE_NUMBER_TAKEN",
  "params": { "fileNo": "11559" },
  "message": "File number 11559 already exists",
  "path": "/api/patients",
  "timestamp": "2026-08-26T20:25:16.250Z"
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

This is also why `dataIssues` on a patient record stores codes. A row flagged
during the import carries `ERR_DATE_MONTH_INVALID` with `{ month: 20 }`, not a
Persian sentence frozen into the database at import time.

### Data model

| Table | Purpose |
| --- | --- |
| `patients` | The main register. Soft-deleted, never destroyed. |
| `treatment_types` | The 13 procedures, seeded from the sheet's columns. |
| `patient_treatments` | Join, with room for a date and note the sheet never had. |
| `referral_sources` | نحوه آشنایی, deduplicated on its Persian-folded form. |
| `implant_cases` | Implant register — **its own numbering**. |
| `ortho_cases` | Ortho register — **its own numbering**. |
| `surgery_queue` | Second-stage surgery list, linked to the implant register. |
| `users` | Staff accounts. |
| `audit_logs` | Append-only record of who changed what. |

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
- Login is rate-limited to 5 attempts per minute. Unknown usernames and wrong
  passwords return the same message and run the same bcrypt comparison, so the
  response leaks neither existence nor timing.
- Patient, implant, orthodontic, and surgery records are **archived, never
  deleted** — a dental record is a legal document. Users are deactivated rather
  than removed so audit rows keep pointing at a real person.
- Patient, registry, surgery, referral-catalogue, and user-administration writes
  commit with their audit records in the same database transaction, so a
  successful office change cannot silently lose its audit trail.
- Production startup refuses development/placeholder secrets, short database
  passwords, missing browser origins, and non-HTTPS CORS origins.

---

## Internationalisation

All user-facing text goes through Angular's built-in i18n (`@angular/localize`).
Nothing a user reads is hard-coded in a component, and the API contributes no
wording at all.

**Source locale is Persian.** The app is authored in the language its users
speak, so templates read naturally and adding English later is a translation
job rather than a rewrite.

Templates mark text with `i18n`:

```html
<h2 i18n="@@login.title">ورود به سیستم</h2>
```

TypeScript uses `$localize`, with stable ids so a reworded string keeps its
translation:

```ts
protected readonly unnamed = $localize`:@@patient.unnamed:بدون نام`;
```

Label helpers are **functions, not constants** — a `$localize` template
evaluated at module load runs before the runtime has its translations, which
silently pins the source locale.

### Adding a language

```bash
npm run i18n:extract --workspace=web
```

That writes `apps/web/src/locale/messages.xlf` (440 messages, with stable
ids). Translate it to `messages.en.xlf`, then register the locale in
`apps/web/angular.json`:

```json
"i18n": {
  "sourceLocale": { "code": "fa", "baseHref": "/" },
  "locales": { "en": { "translation": "src/locale/messages.en.xlf" } }
}
```

`ng build` then emits one bundle per locale under `dist/web/<locale>/`. Serve
whichever the practice needs; there is no runtime cost and no locale switcher to
maintain.

### What the API contributes

Nothing. It returns `ERR_FILE_NUMBER_TAKEN` with `{ fileNo: "11559" }`, and
`ApiErrorTranslator` on the frontend decides that reads as
«شماره پرونده ۱۱۵۵۹ قبلاً ثبت شده است». Swagger summaries and developer messages
are English, because their audience is developers.

The one deliberate exception is *data*: worksheet names, seeded treatment names
and the seeded administrator's display name stay Persian, because they are
values the practice owns rather than labels the app chose.

## UI notes

**Icons: Material Symbols, not Font Awesome.** It is the Material 3 native set,
`<mat-icon>` renders its ligatures with no extra configuration, and its variable
axes (`FILL`, `wght`, `GRAD`, `opsz`) drive the M3 selection idiom where the
active nav item fills in. It is self-hosted, so the clinic has no CDN dependency.
Font Awesome would need separate wiring and would not match M3's metrics.

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

| Command | Does |
| --- | --- |
| `npm run dev` | API and web app together |
| `npm run dev:api` / `npm run dev:web` | Either one alone |
| `npm run build` | Production build of both |
| `npm test` | API and web unit tests (no database needed) |
| `npm run test:e2e` | API readiness test (requires PostgreSQL) |
| `npm run i18n:extract -w web` | Regenerate the message catalogue |
| `npm run migration:run` / `migration:revert` | Schema |
| `npm run seed` | Treatment catalogue + admin account |
| `npm run import -- [file] [--force]` | Load the workbook |
| `npm run db:up` / `db:down` | Postgres via Docker |

---

## Before going live

1. Configure unique `JWT_SECRET` and `JWT_REFRESH_SECRET` values
   (`openssl rand -base64 48`), a strong database password, a strong
   `SEED_ADMIN_PASSWORD`, and the exact HTTPS frontend URL in `CORS_ORIGIN`.
2. Deploy the API and web app together, then run `npm run migration:run` before
   opening the new release. The auth response/cookie contract changed, and the
   migrations add the required initial-password-change flag, case-insensitive
   username uniqueness, and archive columns for the clinical registers.
3. Serve both sides over HTTPS and verify `GET /api/health` through the same
   reverse proxy/load balancer staff will use.
4. Set up automated `pg_dump` backups and complete a restore drill on a separate
   database. A backup that has never been restored is not a recovery plan.
5. Work through the 87 flagged review items — the dashboard links straight to
   them, and clearing one is a single click on the patient's record.
6. Decide what to do with the 92 unlinked ortho entries; most simply have no name
   in the source and need one typed in.
7. Run a short pilot with each real role and verify login, password change,
   patient create/edit/archive/restore, treatment changes, search, audit history,
   session expiry, and backup recovery before using it as the office system of
   record.
