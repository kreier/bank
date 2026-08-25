export interface ParsedRow {
  date: string; // ISO YYYY-MM-DD
  amount: number; // positive = credit, negative = debit
  balance_after?: number;
  description: string;
}

export interface BankParser {
  id: string;
  label: string;
  /** Look at the raw CSV text and decide whether this parser can handle it. */
  detect: (csvText: string) => boolean;
  parse: (csvText: string) => ParsedRow[];
}

/** Minimal CSV line splitter that handles quoted fields with embedded commas. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

/**
 * Normalize to 'YYYY-MM-DD HH:MM' so every account's transactions sort and
 * compare consistently, even when the source CSV only has a date. Accepts
 * an already-full 'YYYY-MM-DD HH:MM' unchanged.
 */
export function toDateTime(isoDate: string, time = '00:00'): string {
  return /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(isoDate) && isoDate.includes(' ') ? isoDate : `${isoDate} ${time}`;
}
