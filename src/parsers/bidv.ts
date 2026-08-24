import type { BankParser, ParsedRow } from './types';
import { splitCsvLine } from './types';

// Built from a real BIDV export (2016). Header: date,details,debit,credit,balance
// - date is already ISO: "YYYY-MM-DD HH:MM". Keep the full timestamp, not just
//   the date — rows in real BIDV exports are NOT always in chronological order
//   (seen in the sample file), so the time component is what lets the app sort
//   them out and reconcile the running balance correctly. A plain date string
//   still sorts correctly alongside these lexicographically (ISO 8601).
// - debit/credit/balance use ',' as a thousands separator, no decimals (VND).
// - debit and credit are separate columns (never both non-zero on one row);
//   amount = credit - debit.
// - "Opening Bank Account" / "Closing Bank Account" rows have blank or
//   zeroed fields and are kept as ordinary (mostly zero) transactions.

function parseBidvNumber(raw: string | undefined): number {
  if (!raw || raw.trim() === '') return 0;
  return Number(raw.replace(/,/g, '')) || 0;
}

export const bidvParser: BankParser = {
  id: 'bidv',
  label: 'BIDV',

  detect(csvText: string): boolean {
    const firstLine = csvText.split(/\r?\n/)[0]?.toLowerCase() ?? '';
    return firstLine.includes('details') && firstLine.includes('debit') && firstLine.includes('credit');
  },

  parse(csvText: string): ParsedRow[] {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '');
    const rows: ParsedRow[] = [];

    for (const line of lines.slice(1)) {
      const cols = splitCsvLine(line);
      const [dateRaw, description, debitRaw, creditRaw, balanceRaw] = cols;
      if (!dateRaw) continue;

      const debit = parseBidvNumber(debitRaw);
      const credit = parseBidvNumber(creditRaw);

      rows.push({
        date: dateRaw, // full "YYYY-MM-DD HH:MM" — see note above on ordering
        amount: credit - debit,
        balance_after: balanceRaw && balanceRaw.trim() !== '' ? parseBidvNumber(balanceRaw) : undefined,
        description: description ?? '',
      });
    }

    return rows;
  },
};
