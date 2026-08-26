import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bidvParser } from './bidv';

const fixture = readFileSync(new URL('./__fixtures__/bidv-sample.csv', import.meta.url), 'utf8');

describe('bidvParser.detect', () => {
  it('recognizes a BIDV header line', () => {
    expect(bidvParser.detect(fixture)).toBe(true);
  });

  it('rejects headers without details/debit/credit columns', () => {
    expect(bidvParser.detect('date,type,amount\n2016-01-01,X,100')).toBe(false);
    expect(bidvParser.detect('')).toBe(false);
  });
});

describe('bidvParser.parse', () => {
  const rows = bidvParser.parse(fixture);

  it('parses every data row', () => {
    expect(rows).toHaveLength(5);
  });

  it('converts debit/credit into a signed amount', () => {
    // Opening row: no debit, no credit
    expect(rows[0].amount).toBe(0);
    // Credit-only row
    expect(rows[1].amount).toBe(12_500_000);
    // Debit-only row
    expect(rows[2].amount).toBe(-3_000_000);
  });

  it('strips thousands separators and parses balances', () => {
    expect(rows[0].balance_after).toBe(50_000_000);
    expect(rows[4].balance_after).toBe(58_250_000);
  });

  it('keeps quoted descriptions with embedded commas intact', () => {
    expect(rows[2].description).toBe('ATM WITHDRAWAL, TRAN QUOC HOAN');
  });

  it('preserves file order (real BIDV exports are not chronological)', () => {
    // Fixture deliberately lists Jan 25 before Jan 20 — the parser must not sort.
    expect(rows[3].date).toBe('2016-01-25 16:45');
    expect(rows[4].date).toBe('2016-01-20 08:05');
  });

  it('normalizes dates to full YYYY-MM-DD HH:MM timestamps', () => {
    for (const row of rows) {
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    }
  });

  it('treats a missing balance column as undefined', () => {
    const rowsNoBalance = bidvParser.parse(
      'date,details,debit,credit,balance\n2016-02-01,CASH DEPOSIT,,"1,000,000",',
    );
    expect(rowsNoBalance[0].balance_after).toBeUndefined();
    expect(rowsNoBalance[0].amount).toBe(1_000_000);
  });

  it('returns 0 for blank numeric fields instead of NaN', () => {
    const rowsBlank = bidvParser.parse(
      'date,details,debit,credit,balance\n2016-01-05,Opening Bank Account,,,',
    );
    expect(rowsBlank[0].amount).toBe(0);
    expect(rowsBlank[0].balance_after).toBeUndefined();
  });
});
