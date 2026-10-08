# CLAUDE.md

Guidance for anyone — developer or AI session — working in this repo. The
README explains the product and the schema's reasoning; this file is the short
list of things that go wrong if you don't know them.

## Real patient data — read first

The local database and `data/*.xlsx` hold a real dental practice's patient
records: names, national ids, phones, addresses, medical histories.

- Never paste patient rows into commits, issues, PRs, logs or external
  services. Refer to a record by file number, not name.
- `data/*.xlsx` and `.env` are gitignored; keep them that way.
- Test rows you create while checking something must be deleted afterwards.

## Databases

Postgres 17 runs via Homebrew (`brew services start postgresql@17`; `psql` is
in `/opt/homebrew/opt/postgresql@17/bin`), superuser role `dental`.
`npm run db:up` (Docker) is the documented alternative.

| Database               | Holds                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| `patient_book`         | Real records                                                        |
| `patient_book_staging` | Not throwaway either — `.env` may point here                        |
| `patient_book_e2e`     | Throwaway, for `npm run test:e2e`                                   |
| `patient_book_ui_e2e`  | Fake rows only, for the `*-ui-e2e` launch configs (ports 3100/4300) |

**Always pass `DB_NAME` explicitly** for e2e tests and migrations — never rely
on `.env`:

```bash
DB_NAME=patient_book_e2e npm run migration:run
DB_NAME=patient_book_e2e npm run test:e2e
```

The e2e specs skip themselves unless `CI=true` or `DB_NAME` ends in
`_e2e`/`_test`. Keep that guard on any new spec that writes.

## Before you push

```bash
npm run lint          # CI runs this first; includes Prettier on the API
npm test              # API (jest) + web (vitest), no database
npm run build
npm run i18n:check    # also rejects hard-coded Persian text in .ts/.html
npm run icons:check   # a new Material Symbol needs `npm run icons:build --workspace=web`
```

## Conventions that bite

- **TypeORM relation + id column pairs** (`referralSource`/`referralSourceId`,
  `patient`/`patientId`, …): when the relation object is loaded, `save()`
  takes the join column from it and silently ignores a changed id. On a write
  path, change the id and drop the loaded relation (or don't load it).
- **Edits are versioned.** Updates lock the row and check `expectedVersion`;
  a write path that reads, changes and saves a whole entity must lock it too.
- **Stock moves only through a movement.** Never write
  `inventory_items.quantity` directly: record a receive/use/discard/count via
  `applyMovement` (`inventory-stock.ts`) so the stock card still adds up.
- **Errors leave the API as codes** (`ErrorCode`), never prose; the web app
  owns the wording in `public/i18n/fa.json`.
- **Persian text is folded before comparing**: `searchKey` / `loosePersianKey`
  (Arabic ي/ك, ZWNJ, digits). Identifiers are stored as ASCII digits; mobiles
  as `09…`.
- **Statistics live on the statistics page only** (`/stats`, «آمار») — no
  counts, charts or sort-by-frequency lists on the dashboard, settings or
  other pages. The dashboard is the front desk's work: each tile counts a
  list and opens exactly that list.
- **No patient data in `localStorage`.** The access token is in memory only;
  per-session conveniences (recent patients) use `sessionStorage` and are
  cleared on sign-out.
- New web UI composes the `pb-*` primitives in `apps/web/src/app/shared/ui`
  rather than styling its own.
