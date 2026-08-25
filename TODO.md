# TODO

Backlog for the bank ledger, roughly ordered by what unblocks the most use
right now. Update this alongside `CHANGELOG.md` as items land — move a
finished item from here into the changelog under a new version rather than
just deleting it.

## Next up

- [ ] **Per-bank parsers for the remaining 10 accounts.** Only BIDV
      (`src/parsers/bidv.ts`) is built from a real sample; Vietcombank is
      an unverified template. Need real CSV exports from the other VND
      accounts, both USD accounts, and both EUR accounts to write/verify
      parsers for each. Copy `bidv.ts` as the pattern; register in
      `src/parsers/index.ts`.
- [ ] **Exchange rate import.** No UI yet — `exchange_rates` has to be
      populated by hand (SQL console against the exported `.sqlite`).
      Needs: a small CSV importer following `importCsv.ts`'s pattern, a
      source for monthly EUR→USD (ECB publishes these) and VND→USD rates
      back to 2011 (expect gaps for VND; `getRateToUsd` already falls back
      to the nearest earlier month, so gaps degrade gracefully rather than
      breaking).
- [ ] **Gap/anomaly detection across imports.** `checkBalanceContinuity`
      catches problems *within* one imported file. Nothing yet flags a
      missing month *between* two import batches for the same account
      (e.g. statements for Mar–Apr 2019 were never imported).
      `import_batches.date_range_start/end` has the raw material — a query
      comparing consecutive batches per account, surfaced as a warning
      panel, is the natural shape.

## Stocks & fixed deposits

- [ ] Entry/edit UI for `fixed_deposits` (principal, currency, rate, start/
      maturity date, status). Table exists, no UI.
- [ ] Entry/edit UI plus CSV import for `securities` /
      `security_transactions` (buy/sell/dividend). Table exists, no UI.
- [ ] Decide how stock positions contribute to the Overview totals — mark-
      to-market needs a price source, which is a bigger design question
      than the rest of this list (worth a short design note before
      building).

## Import & data quality

- [ ] `import/accounts.json` as an alternative to the folder-per-handle
      convention (`import/<HANDLE>/*.csv`), for cases where organizing
      real exports into per-handle folders is inconvenient. Not built —
      the folder convention covers the same need with less config, but
      the user's original request mentioned this as an option.
- [ ] Within-file duplicate-row detection on first import (two identical
      rows in the same CSV). Currently only cross-import dedup is handled
      (via `row_hash` uniqueness); an accidental duplicate on a *first*
      import of a file would just insert twice.
- [ ] Surface `import_batches` history somewhere in the UI (what was
      imported, when, how many rows) — currently only visible via the
      `.sqlite` export or devtools.

## UI / UX

- [ ] Pagination or virtualization for the Transactions table now that the
      hard `LIMIT 500` was removed in v0.2 — fine for now, but a 15-year,
      12-account history will eventually make one giant `innerHTML` table
      slow to render.
- [ ] Custom date-range filter (currently only whole-year).
- [ ] Delete/archive an account (currently only editable, not removable).
- [ ] Inline handle-uniqueness hint on the Add Account form before
      submit, rather than only surfacing the SQLite constraint error after.

## Infrastructure

- [ ] Switch persistence from IndexedDB to OPFS (Origin Private File
      System) once the dataset is large enough that IndexedDB's
      serialize-the-whole-DB-on-every-write approach becomes noticeably
      slow. Not urgent at current data volume.
- [ ] Automated tests. There are none yet — parser correctness has so far
      been verified by ad hoc scripts run against real sample files
      (see CHANGELOG v0.1/v0.2), not committed as tests. At minimum, the
      BIDV parser and `checkBalanceContinuity` are worth locking down with
      real fixtures now that a real sample file exists.
