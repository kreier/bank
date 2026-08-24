# bank

![GitHub License](https://img.shields.io/github/license/kreier/bank)
![GitHub Release](https://img.shields.io/github/v/release/kreier/bank)

Personal multi-currency bank ledger. Runs entirely in the browser — no
backend, no server-side storage. The database is [sql.js](https://sql.js.org/)
(SQLite compiled to WebAssembly), persisted to IndexedDB between sessions,
and exportable as a plain `.sqlite` file at any time.

## Stack

- **Vite** + plain TypeScript (no framework)
- **sql.js** for the database, loaded from a CDN at runtime
- **IndexedDB** to persist the serialized database between page loads
- Deployed via **GitHub Actions** to GitHub Pages

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

## Data model

See `src/db/schema.ts` for the full schema. Summary:

- `accounts` — one row per bank account (currency, type: checking/savings/stock/term_deposit)
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

Each bank exports CSVs a little differently. Copy `src/parsers/vietcombank.ts`
as a template, adjust the column order / date format / number format to match
a real exported file, give it a `detect()` that recognizes that bank's
header line, and register it in `src/parsers/index.ts`. If you don't want to
write a dedicated parser for a low-volume account, `src/parsers/generic.ts`
takes a manual column mapping instead.

## What's scaffolded vs. what's next

Working now: accounts, CSV import with dedup, transaction table with
account/currency/year filters, overview totals, sqlite export/import.

Not yet built — left for you to extend:

- **Exchange rate import** — no UI yet; for now, insert rows directly into
  `exchange_rates` (e.g. via the SQL console in browser devtools against the
  exported `.sqlite`, or a small CSV importer following the same pattern as
  `importCsv.ts`). ECB publishes monthly EUR reference rates; VND historical
  rates are harder to source consistently back to 2011, so expect gaps —
  the schema is designed to tolerate missing months (`getRateToUsd` falls
  back to the nearest earlier rate) rather than fail.
- **Gap/anomaly detection** — flagging missing months of transactions per
  account, or balance jumps that don't match the sum of transactions in
  between. `import_batches.date_range_start/end` gives you the raw material
  for this; a query comparing consecutive batches per account is the
  natural next step.
- **Stocks & fixed deposits UI** — the tables exist (`securities`,
  `security_transactions`, `fixed_deposits`) but there's no import/entry
  form yet, only the CSV/transaction flow for regular accounts.
- **OPFS storage** — IndexedDB works everywhere but is slower for a large
  15-year transaction history; Origin Private File System is worth
  switching to once the dataset is large enough to notice.
- **Per-bank parsers** — only Vietcombank is stubbed in as a template. Real
  parsers need real sample exports from each of your 12 accounts to get the
  column order and date/number formats right.
