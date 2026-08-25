# bank

![GitHub License](https://img.shields.io/github/license/kreier/bank)
![GitHub Release](https://img.shields.io/github/v/release/kreier/bank)

Personal multi-currency bank ledger. Runs entirely in the browser — no
backend, no server-side storage. The database is [sql.js](https://sql.js.org/)
(SQLite compiled to WebAssembly), persisted to IndexedDB between sessions,
and exportable as a plain `.sqlite` file at any time.

## Stack

- **Vite** + plain TypeScript (no framework)
- **sql.js** for the database — its WASM binary is bundled by Vite (`?url`
  import in `src/db/database.ts`), not fetched from a CDN, so the app has no
  external runtime dependency and works offline
- **IndexedDB** to persist the serialized database between page loads
- Deployed via **GitHub Actions** to GitHub Pages
- Light/dark theme, saved to `localStorage` (`src/lib/theme.ts`), defaulting
  to your OS preference

## Getting started

```bash
npm install
npm run dev
```

Build & preview the production bundle:

```bash
npm run build
npm run preview
```

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and
publishes to GitHub Pages. In the repo settings, set **Pages → Source** to
**GitHub Actions** (not "deploy from branch").

### Local CSV auto-import (dev only)

Drop CSV exports into `import/<HANDLE>/*.csv` at the project root — e.g.
`import/BIDV-old/2016-12-31_BIDV.csv` — where `<HANDLE>` matches an
account's **Handle** field exactly (set it in the Accounts panel). Next
time you run `npm run dev`, a "Local import" panel lists what it found and
matched, with a button to import them all in one go.

`import/` is gitignored and only scanned in dev mode — the folder scan
itself (`src/import/autoImport.ts`) is excluded from the production build
via a dynamic import gated on `import.meta.env.DEV`, so nothing under
`import/` is ever bundled or deployed.

## Data model

See `src/db/schema.ts` for the full schema. Summary:

- `accounts` — one row per bank account (currency, type:
  checking/savings/stock/term_deposit). `handle` is an optional short code
  (e.g. `BIDV-old`) shown in the Transactions table instead of the full
  bank/account name, and used to match files under `import/<HANDLE>/`.
  Bank name, account name, and handle are all editable from the Accounts
  panel
- `import_batches` — one row per CSV file imported, keyed by a hash of the
  file contents, so re-importing the same export is a no-op
- `transactions` — one row per statement line, keyed by a hash of
  `(account, date, amount, description)` so overlapping CSV exports don't
  create duplicates. If a re-imported row's stated balance differs from
  what's already stored, it's surfaced as a conflict instead of silently
  overwritten
- `exchange_rates` — monthly `rate_to_usd` per non-USD currency, used to
  convert VND/EUR balances into USD (and, going the other way, USD → EUR)
  for the overview totals
- `securities` / `security_transactions` — stock positions per account
- `fixed_deposits` — term deposits with principal, rate, and maturity

## Adding a bank's CSV parser

Each bank exports CSVs a little differently. Copy `src/parsers/bidv.ts` (a
real, working example) or `src/parsers/vietcombank.ts` (an unverified
template) as a starting point, adjust the column order / date format /
number format to match a real exported file, give it a `detect()` that
recognizes that bank's header line, and register it in
`src/parsers/index.ts`. If you don't want to write a dedicated parser for a
low-volume account, `src/parsers/generic.ts` takes a manual column mapping
instead.

Every parser should produce `date` as `'YYYY-MM-DD HH:MM'` — use the
`toDateTime()` helper from `src/parsers/types.ts`, which appends `00:00`
when a source only has a date. Consistent timestamps (not just dates) matter
for real statements: BIDV's own export has rows that aren't in chronological
order, and only the time component lets the app sort them out and catch it
(see `checkBalanceContinuity` in `src/import/validate.ts`, which reconciles
the running balance and warns wherever it doesn't match the statement —
shown as an expandable warning list after each import).

## What's scaffolded vs. what's next

Working now: accounts (editable, with a display handle), CSV import with
dedup and post-import warnings (bad rows, balance-continuity checks),
transaction table with debit/credit split and account/currency/year filters
sorted oldest-first, overview totals, sqlite export/import, light/dark
theme, local-folder auto-import for dev, one real parser (BIDV) plus a
Vietcombank template and a generic manual-mapping fallback.

Not yet built — left for you to extend:

- **Exchange rate import** — no UI yet; for now, insert rows directly into
  `exchange_rates` (e.g. via the SQL console in browser devtools against the
  exported `.sqlite`, or a small CSV importer following the same pattern as
  `importCsv.ts`). ECB publishes monthly EUR reference rates; VND historical
  rates are harder to source consistently back to 2011, so expect gaps —
  the schema is designed to tolerate missing months (`getRateToUsd` falls
  back to the nearest earlier rate) rather than fail.
- **Gap/anomaly detection across imports** — the per-file balance check
  exists, but nothing yet flags missing months of transactions *between*
  import batches for an account. `import_batches.date_range_start/end` is
  the raw material for that; a query comparing consecutive batches per
  account is the natural next step.
- **Stocks & fixed deposits UI** — the tables exist (`securities`,
  `security_transactions`, `fixed_deposits`) but there's no import/entry
  form yet, only the CSV/transaction flow for regular accounts.
- **OPFS storage** — IndexedDB works everywhere but is slower for a large
  15-year transaction history; Origin Private File System is worth
  switching to once the dataset is large enough to notice.
- **Per-bank parsers** — 10 of your 12 accounts still need one. Copy
  `bidv.ts`, adjust to match a real export, register in `parsers/index.ts`.
