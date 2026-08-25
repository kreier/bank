# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
This project has no releases/tags yet — versions here just mark points in
development for reference.

## [0.2] — current

### Added
- Light/dark theme toggle, persisted to `localStorage`, defaulting to OS
  preference (`src/lib/theme.ts`).
- Accounts are now editable in place (bank name, account name, handle),
  not just creatable.
- `handle` field on accounts: a short display code (e.g. `BIDV-old`) shown
  in the Transactions table instead of the full bank/account name, with
  the full name available as a tooltip. Enforced unique at the database
  level; a duplicate handle surfaces as an inline error on save.
- Local CSV auto-import for development: drop files into
  `import/<HANDLE>/*.csv` (gitignored) and `npm run dev` shows a panel
  listing what it found, matched to accounts by handle, with a one-click
  "import all matched" action (`src/import/autoImport.ts`).
- Post-import warnings, shown as a collapsible list:
  - row-level checks (unrecognized date format, non-numeric amount/balance,
    missing description) — `validateRows()`
  - a balance-continuity check that sorts rows chronologically and flags
    anywhere the running total doesn't match the statement's own stated
    balance — `checkBalanceContinuity()` (`src/import/validate.ts`)
- `bidv.ts`: a working parser built and verified against a real 2016 BIDV
  export (comma-thousands debit/credit columns, full timestamps, BOM/CRLF
  handling).
- `toDateTime()` helper (`src/parsers/types.ts`) — normalizes every
  parser's output to `'YYYY-MM-DD HH:MM'`, padding a bare date with
  `00:00`. Adopted by all three parsers (BIDV, Vietcombank, generic).
- Debit and Credit as separate columns in the Transactions table (was one
  signed "Amount" column).
- `escapeHtml()` used throughout `main.ts` for any user-provided string
  interpolated into `innerHTML` (account names, handles, descriptions).

### Changed
- Transactions now sort oldest-first (was newest-first); the hard
  `LIMIT 500` was removed.
- sql.js's WASM binary is now bundled locally via Vite (`?url` import)
  instead of fetched from a CDN at runtime — the app has no external
  runtime dependency and works offline.
- `vite.config.ts`: `base` is now conditional on `command === 'build'`
  (`/bank/` only in production), so `npm run dev` serves at plain
  `http://localhost:5173/` instead of requiring `/bank/` in the URL.
- `main.ts` now shows a loading state on startup and a visible error panel
  if database initialization fails, instead of leaving `#app` empty.

### Fixed
- **Blank/black screen on both `npm run dev` and the deployed site.** Root
  cause: the CDN-hosted sql.js WASM fetch could fail silently with no
  error surfaced, leaving `#app` empty against a near-black background.
  Fixed by bundling the WASM locally (see Changed) and adding visible
  error handling (see Added/Changed above). Verified by building,
  serving the output, and curling the HTML/JS/CSS/WASM asset URLs to
  confirm all four return 200 and the JS correctly references the local
  WASM asset path.
- Delivery zip previously omitted `.github/workflows/deploy.yml` — an
  overly broad exclude pattern (`*.git*`) accidentally matched `.github`
  too. Fixed the exclude pattern.

## [0.1] — initial scaffold

### Added
- Project scaffold: Vite + plain TypeScript, no framework (deliberate
  choice — evaluated against Svelte/React/Vue).
- sql.js (SQLite-to-WASM) as the in-browser database, persisted to
  IndexedDB between sessions, exportable/importable as a `.sqlite` file.
- Schema (`src/db/schema.ts`): `accounts`, `import_batches`,
  `transactions`, `exchange_rates`, `securities`,
  `security_transactions`, `fixed_deposits`.
- CSV import pipeline (`src/import/importCsv.ts`) with two-level dedup:
  whole-file hash (skip an already-imported file entirely) and per-row
  hash of `(account, date, amount, description)` (skip individual
  duplicate rows on an overlapping re-import); a repeated row whose
  stated balance disagrees with what's stored is surfaced as a conflict
  rather than silently overwritten.
- Parser interface (`src/parsers/types.ts`) plus a Vietcombank template
  and a `generic.ts` manual-column-mapping fallback for banks without a
  dedicated parser.
- Minimal UI (`src/main.ts`): account list + add-account form, CSV import
  form, overview totals (native currency + USD-equivalent via
  `exchange_rates`, tolerating missing months), transaction table with
  account/currency/year filters.
- GitHub Actions workflow deploying to GitHub Pages on push to `main`.

### Known limitations at this point (see TODO.md)
- Only one (unverified) bank parser existed; no editable accounts; single
  signed amount column; newest-first sort with a 500-row cap; no import
  warnings; theme was dark-only; no local auto-import.
