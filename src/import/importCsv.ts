import type { Database } from 'sql.js';
import { sha256 } from '../db/hash';
import { persist } from '../db/database';
import type { BankParser } from '../parsers/types';
import { validateRows, checkBalanceContinuity } from './validate';

export interface ImportResult {
  status: 'skipped-duplicate-file' | 'imported';
  rowsInserted: number;
  rowsSkippedAsDuplicate: number;
  rowsConflicting: { date: string; description: string; oldBalance: number; newBalance: number }[];
  dateRange: { start: string; end: string } | null;
  warnings: string[];
}

export async function importCsvFile(
  db: Database,
  accountId: number,
  filename: string,
  csvText: string,
  parser: BankParser,
): Promise<ImportResult> {
  const fileHash = await sha256(csvText);

  const existing = db.exec(
    'SELECT id FROM import_batches WHERE account_id = ? AND file_hash = ?',
    [accountId, fileHash],
  );
  if (existing.length > 0 && existing[0].values.length > 0) {
    return {
      status: 'skipped-duplicate-file',
      rowsInserted: 0,
      rowsSkippedAsDuplicate: 0,
      rowsConflicting: [],
      dateRange: null,
      warnings: [],
    };
  }

  const rows = parser.parse(csvText);
  const warnings = [...validateRows(rows), ...checkBalanceContinuity(rows)];
  let inserted = 0;
  let skippedDuplicate = 0;
  const conflicts: ImportResult['rowsConflicting'] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;

  db.run('BEGIN TRANSACTION');
  try {
    // Batch row is inserted first so import_batch_id is available for each transaction row.
    db.run(
      `INSERT INTO import_batches (account_id, filename, file_hash, row_count, date_range_start, date_range_end)
       VALUES (?, ?, ?, ?, NULL, NULL)`,
      [accountId, filename, fileHash, rows.length],
    );
    const batchId = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;

    for (const row of rows) {
      const rowHash = await sha256(`${accountId}|${row.date}|${row.amount}|${row.description}`);

      const dup = db.exec(
        'SELECT balance_after FROM transactions WHERE account_id = ? AND row_hash = ?',
        [accountId, rowHash],
      );
      if (dup.length > 0 && dup[0].values.length > 0) {
        skippedDuplicate++;
        const oldBalance = dup[0].values[0][0] as number;
        if (row.balance_after !== undefined && oldBalance !== null && row.balance_after !== oldBalance) {
          conflicts.push({
            date: row.date,
            description: row.description,
            oldBalance,
            newBalance: row.balance_after,
          });
        }
        continue;
      }

      db.run(
        `INSERT INTO transactions (account_id, date, amount, balance_after, description, row_hash, import_batch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [accountId, row.date, row.amount, row.balance_after ?? null, row.description, rowHash, batchId],
      );
      inserted++;
      if (!minDate || row.date < minDate) minDate = row.date;
      if (!maxDate || row.date > maxDate) maxDate = row.date;
    }

    db.run('UPDATE import_batches SET date_range_start = ?, date_range_end = ? WHERE id = ?', [
      minDate,
      maxDate,
      batchId,
    ]);

    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }

  await persist();

  return {
    status: 'imported',
    rowsInserted: inserted,
    rowsSkippedAsDuplicate: skippedDuplicate,
    rowsConflicting: conflicts,
    dateRange: minDate && maxDate ? { start: minDate, end: maxDate } : null,
    warnings,
  };
}
