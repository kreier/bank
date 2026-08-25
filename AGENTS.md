# AGENTS.md

Orientation for AI coding agents (and future-you) working on this repo.
Read this before making changes — it covers the constraints that aren't
obvious from the code alone.

## What this is

A personal, multi-currency (VND/USD/EUR) bank ledger. Vite + plain
TypeScript, no framework. Runs entirely client-side: the database is
sql.js (SQLite-to-WASM), persisted to IndexedDB, exportable as `.sqlite`.
Deployed as a static site to GitHub Pages via GitHub Actions. There is no
backend, no server, no API — every piece of state lives in the visitor's
browser.

Read `README.md` first for the data model and current feature list. This
file is about *how to work on the code*, not *what it does*.

## Non-negotiable constraints

- **No external runtime dependencies.** The app must work offline and
  without any CDN. sql.js's WASM binary is bundled locally via Vite's
  `?url` import (`src/db/database.ts`) — do not change this back to a CDN
  `locateFile`. If you add another WASM/binary dependency, bundle it the
  same way.
- **`base: '/bank/'` only in production.** `vite.config.ts` sets `base`
  conditionally on `command === 'build'`. Don't hardcode `/bank/` — it
  breaks `npm run dev`, which is exactly the bug that motivated the
  conditional in the first place.
- **`import/` must never reach the production bundle.** It holds real bank
  CSVs locally (gitignored) for the dev-only auto-import feature
  (`src/import/autoImport.ts`). That module is only ever reached via a
  dynamic `import()` behind `if (import.meta.env.DEV)` in `main.ts` — never
  import it statically. Vite dead-code-eliminates the whole branch for
  `vite build` because `import.meta.env.DEV` is statically known `false`
  in production; a static import would defeat that. If you touch this
  path, rebuild and grep `dist/assets/*.js` for `autoImport` /
  `discoverImportFiles` — it should be absent.
- **Schema changes need a migration, not just a new `CREATE TABLE`.**
  `CREATE TABLE IF NOT EXISTS` is a no-op against a database that already
  exists in someone's IndexedDB. New columns go through `migrate()` in
  `src/db/database.ts` (check `PRAGMA table_info`, `ALTER TABLE ADD COLUMN`
  if missing). There's real user data behind this now — treat every schema
  change as a migration, not a fresh `CREATE TABLE`.
- **All transaction dates are `'YYYY-MM-DD HH:MM'`.** Always pass parsed
  dates through `toDateTime()` (`src/parsers/types.ts`), which appends
  `00:00` if a source has no time component. This isn't cosmetic: sorting
  and the balance-continuity check (`checkBalanceContinuity` in
  `src/import/validate.ts`) depend on it. Real bank exports (BIDV's, at
  least) aren't always in chronological order — the time component is
  what makes reconciliation possible at all.
- **No build step for HTML.** `main.ts` builds the UI with template
  strings and `innerHTML`, not a framework. Keep it that way unless
  explicitly asked to introduce one (the user chose plain TS deliberately —
  see CHANGELOG v0.1). Escape any user-provided string with `escapeHtml()`
  before interpolating into `innerHTML`.

## Before you commit a change

1. `npm install`
2. `npx tsc --noEmit` — must be clean.
3. `npm run build` — must succeed, and check the reported asset list
   (`dist/assets/*.wasm`, `*.js`, `*.css`) looks sane.
4. If you touched anything DB/import/dev-only related, actually serve the
   build (`npm run preview`) and curl the HTML + JS + CSS + WASM asset
   URLs it references — a broken `base` path or a missing asset fails
   silently in the browser (blank screen, no error) far more often than it
   throws something you'd catch by reading the code. This has already bitten
   this project once (see CHANGELOG v0.1) — don't skip it.
5. If you add a bank parser, test it against a real sample file before
   trusting it — see "Adding a bank's CSV parser" in `README.md`. A parser
   that merely type-checks can still silently mis-map columns.

## Where things live

- `src/db/schema.ts` — table definitions. `src/db/database.ts` — sql.js
  lifecycle, IndexedDB persistence, migrations, `.sqlite` export/import.
- `src/parsers/` — one file per bank, plus `generic.ts` (manual column
  mapping) and `types.ts` (shared `ParsedRow`/`BankParser` types,
  `splitCsvLine`, `toDateTime`).
- `src/import/importCsv.ts` — dedup + insert logic (file-hash and
  row-hash based). `validate.ts` — post-parse warnings.
  `autoImport.ts` — dev-only local folder scan.
- `src/lib/theme.ts` — light/dark state, `localStorage`-backed.
- `src/main.ts` — the entire UI: rendering, event handlers, filters.
  Currently one file; if it keeps growing, splitting by panel
  (accounts/transactions/import) is the natural seam — ask before doing
  this unprompted, it's a structural change.

## Conventions

- No framework, no component library. Keep `main.ts`'s render functions
  small and composable (`renderX(): string`) the way it's already
  structured, rather than introducing a different pattern partway through.
- CSS custom properties in `style.css` (`--bg`, `--panel`, `--accent`,
  etc.) are the theming mechanism — don't hardcode colors in new markup.
- Currency amounts are formatted with `fmt()` in `main.ts`
  (`toLocaleString` with `maximumFractionDigits: 0`) — VND/USD/EUR are all
  shown without decimals throughout. Match this unless a feature
  specifically needs fractional display (e.g. exchange rates, once built).
- See `TODO.md` for what's planned and `CHANGELOG.md` for what's already
  landed and why — check both before assuming something is unbuilt or
  proposing something already tried.
