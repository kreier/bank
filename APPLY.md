# Test setup for kreier/bank

Adds [Vitest](https://vitest.dev) with unit tests for the BIDV parser, the
shared parser helpers (`splitCsvLine`, `toDateTime`), and the import
validators (`validateRows`, `checkBalanceContinuity`) — the pure functions
every future bank parser will be built on.

## Files in this archive

Copy these into the repo root (paths relative to repo root):

| File | Purpose |
|---|---|
| `package.json` | Replaces existing — adds `test`/`test:watch` scripts plus `vitest` and `@types/node` dev dependencies |
| `.gitignore` | Replaces existing — also ignores `tsconfig.tsbuildinfo` (a build artifact currently committed by mistake) |
| `vitest.config.ts` | New — Vitest config, node environment, picks up `src/**/*.test.ts` |
| `src/parsers/__fixtures__/bidv-sample.csv` | New — synthetic-but-realistic BIDV statement: thousands separators, quoted fields with embedded commas, an opening-balance row, and deliberately out-of-order rows |
| `src/parsers/bidv.test.ts` | New — detect() + parse() behavior, incl. file-order preservation and blank-field handling |
| `src/parsers/types.test.ts` | New — CSV splitting (quotes/escapes/empty fields) and timestamp normalization |
| `src/import/validate.test.ts` | New — row validation warnings and balance-continuity checks, incl. resync-after-mismatch behavior |

Nothing under `src/` is modified — all test files are new, so applying this
cannot break existing behavior.

## Apply

```bash
# from the repo root, after extracting the zip over it:
npm install        # pulls in vitest + @types/node
npm test           # runs vitest once
npm run build      # confirm tsc + vite build still pass
```

Optional cleanup of the already-committed build artifact:

```bash
git rm --cached tsconfig.tsbuildinfo
```

## Notes

- The fixture is **not** your real export — it's hand-built to exercise the
  same format quirks (comma thousands separators must be quoted, or the naive
  comma splitter would break them into extra columns). When you add tests for
  the next banks, commit a trimmed real export as the fixture instead.
- Tests run in a plain Node environment via `environment: 'node'`; they never
  touch IndexedDB/sql.js, which is why no browser harness is needed.
- `@types/node` was added because `bidv.test.ts` reads its fixture with
  `node:fs`, keeping fixtures outside Vite's import graph entirely.
