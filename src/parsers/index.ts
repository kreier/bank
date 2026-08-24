import type { BankParser } from './types';
import { vietcombankParser } from './vietcombank';

// Register one parser per bank here. Copy vietcombank.ts as a starting
// point for each new one (Techcombank, Wise, Revolut, N26, your USD
// accounts, etc.) once you have a sample export to work from.
export const bankParsers: BankParser[] = [vietcombankParser];

/** Auto-detect a parser from the CSV's first line; null if none match. */
export function detectParser(csvText: string): BankParser | null {
  return bankParsers.find((p) => p.detect(csvText)) ?? null;
}

export * from './types';
export * from './generic';
