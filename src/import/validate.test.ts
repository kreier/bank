import { describe, expect, it } from 'vitest';
import type { ParsedRow } from '../parsers/types';
import { checkBalanceContinuity, validateRows } from './validate';

function row(overrides: Partial<ParsedRow>): ParsedRow {
  return {
    date: '2016-01-10 10:30',
    amount: 100,
    description: 'SALARY ABC COMPANY',
    ...overrides,
  };
}

describe('validateRows', () => {
  it('returns no warnings for well-formed rows', () => {
    expect(validateRows([row({})])).toEqual([]);
  });

  it('flags a malformed date, citing the CSV line number (header = line 1)', () => {
    const warnings = validateRows([
      row({ date: '01/02/2016' }), // first data row -> line 2
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Line 2');
    expect(warnings[0]).toContain('unrecognized date');
  });

  it('flags non-numeric amounts and balances', () => {
    const warnings = validateRows([
      row({ amount: NaN }),
      row({ balance_after: Infinity }),
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('Line 2');
    expect(warnings[1]).toContain('Line 3');
  });

  it('flags missing descriptions', () => {
    const warnings = validateRows([row({ description: '   ' })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('missing description');
  });

  it('allows rows without a balance (balance is optional)', () => {
    expect(validateRows([row({ balance_after: undefined })])).toEqual([]);
  });
});

describe('checkBalanceContinuity', () => {
  it('accepts an in-order series whose running total matches stated balances', () => {
    const rows = [
      row({ date: '2016-01-05 09:00', amount: 50_000_000, balance_after: 50_000_000 }),
      row({ date: '2016-01-06 09:00', amount: 12_500_000, balance_after: 62_500_000 }),
      row({ date: '2016-01-07 09:00', amount: -3_000_000, balance_after: 59_500_000 }),
    ];
    expect(checkBalanceContinuity(rows)).toEqual([]);
  });

  it('sorts internally, so out-of-order input still reconciles', () => {
    const rows = [
      row({ date: '2016-01-07 09:00', amount: -3_000_000, balance_after: 59_500_000 }),
      row({ date: '2016-01-05 09:00', amount: 50_000_000, balance_after: 50_000_000 }),
      row({ date: '2016-01-06 09:00', amount: 12_500_000, balance_after: 62_500_000 }),
    ];
    expect(checkBalanceContinuity(rows)).toEqual([]);
  });

  it('flags a mismatch and includes the date and both balances', () => {
    const rows = [
      row({ date: '2016-01-05 09:00', amount: 50_000_000, balance_after: 50_000_000 }),
      // Statement claims 99,900,000 but 50,000,000 + 12,500,000 = 62,500,000
      row({ date: '2016-01-06 09:00', amount: 12_500_000, balance_after: 99_900_000 }),
    ];
    const warnings = checkBalanceContinuity(rows);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2016-01-06 09:00');
    expect(warnings[0]).toContain('62,500,000');
    expect(warnings[0]).toContain('99,900,000');
  });

  it('resyncs after a mismatch so one bad row does not cascade', () => {
    const rows = [
      row({ date: '2016-01-05 09:00', amount: 100, balance_after: 100 }),
      row({ date: '2016-01-06 09:00', amount: 999, balance_after: 999 }), // bad
      row({ date: '2016-01-07 09:00', amount: 1, balance_after: 1_000 }), // consistent again
    ];
    expect(checkBalanceContinuity(rows)).toHaveLength(1);
  });

  it('tolerates small float drift within the 0.5 threshold', () => {
    const rows = [
      row({ date: '2016-01-05 09:00', amount: 0.1 + 0.2, balance_after: 0.3 }),
    ];
    expect(checkBalanceContinuity(rows)).toEqual([]);
  });

  it('anchors on the first row that states a balance; earlier rows are skipped silently', () => {
    const rows = [
      row({ date: '2016-01-04 09:00', amount: 123 }), // no balance — nothing to check against yet
      row({ date: '2016-01-05 09:00', amount: -70, balance_after: 53 }),
    ];
    expect(checkBalanceContinuity(rows)).toEqual([]);
  });
});
