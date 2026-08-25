import type { ParsedRow } from '../parsers/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

/** Row-level checks: malformed dates, non-numeric amounts, missing description. */
export function validateRows(rows: ParsedRow[]): string[] {
  const warnings: string[] = [];
  rows.forEach((row, i) => {
    const line = i + 2; // +1 for header, +1 for 1-indexing
    if (!DATE_RE.test(row.date)) {
      warnings.push(`Line ${line}: unrecognized date "${row.date}" (expected YYYY-MM-DD HH:MM)`);
    }
    if (!Number.isFinite(row.amount)) {
      warnings.push(`Line ${line}: amount is not a number`);
    }
    if (row.balance_after !== undefined && !Number.isFinite(row.balance_after)) {
      warnings.push(`Line ${line}: balance is not a number`);
    }
    if (!row.description || !row.description.trim()) {
      warnings.push(`Line ${line}: missing description`);
    }
  });
  return warnings;
}

/**
 * Sorts a copy of the rows chronologically and walks the stated balances,
 * flagging anywhere the running total doesn't match. Catches out-of-order
 * rows, missing transactions, or gaps in the statement — resyncs to the
 * stated balance after each mismatch so one bad row doesn't cascade into
 * a wall of follow-on warnings.
 */
export function checkBalanceContinuity(rows: ParsedRow[]): string[] {
  const warnings: string[] = [];
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));

  let running: number | null = null;
  for (const row of sorted) {
    if (running === null) {
      if (row.balance_after !== undefined) running = row.balance_after;
      continue;
    }
    running += row.amount;
    if (row.balance_after !== undefined && Math.abs(running - row.balance_after) > 0.5) {
      warnings.push(
        `${row.date}: running balance ${running.toLocaleString()} doesn't match statement balance ` +
          `${row.balance_after.toLocaleString()} (${row.description.slice(0, 40)}) — check for rows out of order or missing`,
      );
      running = row.balance_after;
    }
  }
  return warnings;
}
