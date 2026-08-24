import type { BankParser, ParsedRow } from './types';
import { splitCsvLine } from './types';

// TEMPLATE — adjust column order and date format to match your actual
// Vietcombank export once you have a real file in hand. The shape here
// (date, description, debit, credit, balance) is a common layout for
// Vietnamese bank statement exports; treat it as a starting point.
//
// Copy this file per bank (e.g. techcombank.ts, wise.ts, revolut.ts,
// n26.ts) and register the new parser in src/parsers/index.ts.

function parseVnDate(raw: string): string {
  // Expects DD/MM/YYYY -> YYYY-MM-DD
  const [d, m, y] = raw.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseVnNumber(raw: string): number {
  // Vietnamese exports commonly use '.' as thousands separator, ',' as decimal.
  if (!raw || raw.trim() === '') return 0;
  return Number(raw.replace(/\./g, '').replace(',', '.'));
}

export const vietcombankParser: BankParser = {
  id: 'vietcombank',
  label: 'Vietcombank',

  detect(csvText: string): boolean {
    const firstLine = csvText.split('\n')[0]?.toLowerCase() ?? '';
    return firstLine.includes('ngày') || firstLine.includes('vietcombank');
  },

  parse(csvText: string): ParsedRow[] {
    const lines = csvText.split('\n').filter((l) => l.trim() !== '');
    const rows: ParsedRow[] = [];

    // Skip header row.
    for (const line of lines.slice(1)) {
      const cols = splitCsvLine(line);
      const [dateRaw, description, debitRaw, creditRaw, balanceRaw] = cols;
      if (!dateRaw) continue;

      const debit = parseVnNumber(debitRaw);
      const credit = parseVnNumber(creditRaw);

      rows.push({
        date: parseVnDate(dateRaw),
        amount: credit - debit,
        balance_after: balanceRaw ? parseVnNumber(balanceRaw) : undefined,
        description: description ?? '',
      });
    }

    return rows;
  },
};
