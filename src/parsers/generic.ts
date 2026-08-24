import type { BankParser, ParsedRow } from './types';
import { splitCsvLine } from './types';

export interface ColumnMapping {
  dateCol: number;
  descriptionCol: number;
  amountCol: number; // single signed amount column
  balanceCol?: number;
  dateFormat: 'YMD' | 'DMY' | 'MDY';
  hasHeader: boolean;
}

function toIsoDate(raw: string, format: ColumnMapping['dateFormat']): string {
  const parts = raw.split(/[/\-.]/).map((p) => p.trim());
  if (parts.length !== 3) return raw; // leave as-is; import UI will flag bad rows
  let [a, b, c] = parts;
  let y: string, m: string, d: string;
  if (format === 'YMD') [y, m, d] = [a, b, c];
  else if (format === 'DMY') [d, m, y] = [a, b, c];
  else [m, d, y] = [a, b, c];
  return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Build a one-off parser from a user-supplied column mapping (no auto-detect). */
export function genericParser(mapping: ColumnMapping): BankParser {
  return {
    id: 'generic',
    label: 'Generic (manual mapping)',
    detect: () => false, // never auto-selected; user picks it explicitly
    parse(csvText: string): ParsedRow[] {
      const lines = csvText.split('\n').filter((l) => l.trim() !== '');
      const body = mapping.hasHeader ? lines.slice(1) : lines;
      const rows: ParsedRow[] = [];

      for (const line of body) {
        const cols = splitCsvLine(line);
        const dateRaw = cols[mapping.dateCol];
        if (!dateRaw) continue;

        rows.push({
          date: toIsoDate(dateRaw, mapping.dateFormat),
          amount: Number(cols[mapping.amountCol]?.replace(/,/g, '') ?? 0),
          balance_after:
            mapping.balanceCol !== undefined
              ? Number(cols[mapping.balanceCol]?.replace(/,/g, ''))
              : undefined,
          description: cols[mapping.descriptionCol] ?? '',
        });
      }

      return rows;
    },
  };
}
