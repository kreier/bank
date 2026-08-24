import type { Database } from 'sql.js';
import { getDb, downloadDb, loadDbFromFile } from './db/database';
import { detectParser, bankParsers } from './parsers';
import { importCsvFile } from './import/importCsv';

const app = document.querySelector<HTMLDivElement>('#app')!;

interface Account {
  id: number;
  bank_name: string;
  account_name: string;
  currency: 'VND' | 'USD' | 'EUR';
  account_type: string;
}

interface Filters {
  accountId: 'all' | number;
  currency: 'all' | 'VND' | 'USD' | 'EUR';
  year: 'all' | number;
}

let db: Database;
const filters: Filters = { accountId: 'all', currency: 'all', year: 'all' };

async function main() {
  app.innerHTML = `<p class="subtitle">Loading…</p>`;
  try {
    db = await getDb();
  } catch (err) {
    console.error('Failed to initialize database:', err);
    app.innerHTML = `
      <h1>Bank</h1>
      <div class="panel">
        <h2>Couldn't start</h2>
        <p>${err instanceof Error ? err.message : String(err)}</p>
        <p class="account-meta">Check the browser console for details. This usually means the sql.js WASM file failed to load.</p>
      </div>`;
    return;
  }
  render();
}

function getAccounts(): Account[] {
  const res = db.exec('SELECT id, bank_name, account_name, currency, account_type FROM accounts ORDER BY currency, bank_name');
  if (res.length === 0) return [];
  return res[0].values.map((r) => ({
    id: r[0] as number,
    bank_name: r[1] as string,
    account_name: r[2] as string,
    currency: r[3] as Account['currency'],
    account_type: r[4] as string,
  }));
}

/** Latest known balance for an account: last stated balance_after, else running sum of amounts. */
function getAccountBalance(accountId: number): number {
  const stated = db.exec(
    'SELECT balance_after FROM transactions WHERE account_id = ? AND balance_after IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1',
    [accountId],
  );
  if (stated.length > 0 && stated[0].values.length > 0) {
    return stated[0].values[0][0] as number;
  }
  const summed = db.exec('SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_id = ?', [accountId]);
  return (summed[0]?.values[0]?.[0] as number) ?? 0;
}

/** Nearest exchange rate to USD for a currency at/around a given month (falls back to latest known). */
function getRateToUsd(currency: 'VND' | 'EUR', month?: string): number | null {
  const query = month
    ? 'SELECT rate_to_usd FROM exchange_rates WHERE currency = ? AND month <= ? ORDER BY month DESC LIMIT 1'
    : 'SELECT rate_to_usd FROM exchange_rates WHERE currency = ? ORDER BY month DESC LIMIT 1';
  const args = month ? [currency, month] : [currency];
  const res = db.exec(query, args);
  if (res.length === 0 || res[0].values.length === 0) return null;
  return res[0].values[0][0] as number;
}

function toUsd(amount: number, currency: Account['currency']): number | null {
  if (currency === 'USD') return amount;
  const rate = getRateToUsd(currency);
  return rate === null ? null : amount * rate;
}

function renderOverview(accounts: Account[]): string {
  const byCurrency: Record<string, { native: number; usd: number; missingRate: boolean }> = {
    VND: { native: 0, usd: 0, missingRate: false },
    USD: { native: 0, usd: 0, missingRate: false },
    EUR: { native: 0, usd: 0, missingRate: false },
  };

  for (const acc of accounts) {
    const bal = getAccountBalance(acc.id);
    byCurrency[acc.currency].native += bal;
    const usd = toUsd(bal, acc.currency);
    if (usd === null) byCurrency[acc.currency].missingRate = true;
    else byCurrency[acc.currency].usd += usd;
  }

  const totalUsd = Object.values(byCurrency).reduce((s, c) => s + c.usd, 0);
  const anyMissing = Object.values(byCurrency).some((c) => c.missingRate);

  const figures = (['VND', 'USD', 'EUR'] as const)
    .map((cur) => {
      const c = byCurrency[cur];
      if (accounts.every((a) => a.currency !== cur)) return '';
      return `
        <div class="total-figure">
          <span class="value">${c.native.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          <span class="label">${cur}${c.missingRate ? ' · no rate for USD conversion' : ` · ≈ $${c.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}</span>
        </div>`;
    })
    .join('');

  return `
    <div class="panel">
      <h2>Overview</h2>
      <div class="totals-row">
        <div class="total-figure">
          <span class="value">$${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          <span class="label">Total (USD)${anyMissing ? ' · incomplete, missing exchange rates' : ''}</span>
        </div>
        ${figures}
      </div>
    </div>`;
}

function renderAccounts(accounts: Account[]): string {
  const rows = accounts
    .map(
      (a) => `
      <div class="account-row">
        <div>
          <div class="account-name">${a.bank_name} — ${a.account_name}</div>
          <div class="account-meta">${a.account_type}</div>
        </div>
        <div class="account-meta">${getAccountBalance(a.id).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${a.currency}</div>
      </div>`,
    )
    .join('');

  return `
    <div class="panel">
      <h2>Accounts</h2>
      ${rows || '<div class="empty-state">No accounts yet — add one below.</div>'}
      <form id="add-account-form" class="actions" style="margin-top:16px; flex-wrap:wrap;">
        <input name="bank_name" placeholder="Bank name" required style="flex:1; min-width:120px;" />
        <input name="account_name" placeholder="Account name" required style="flex:1; min-width:120px;" />
        <select name="currency">
          <option value="VND">VND</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
        <select name="account_type">
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
          <option value="stock">Stock</option>
          <option value="term_deposit">Fixed deposit</option>
        </select>
        <button type="submit">Add account</button>
      </form>
    </div>`;
}

function renderImport(accounts: Account[]): string {
  const options = accounts.map((a) => `<option value="${a.id}">${a.bank_name} — ${a.account_name} (${a.currency})</option>`).join('');
  return `
    <div class="panel">
      <h2>Import CSV</h2>
      <form id="import-form" class="actions" style="flex-wrap:wrap;">
        <select name="account_id" required>
          <option value="" disabled selected>Select account…</option>
          ${options}
        </select>
        <input type="file" name="file" accept=".csv" required />
        <button type="submit">Import</button>
      </form>
      <div id="import-result" class="account-meta" style="margin-top:10px;"></div>
    </div>`;
}

function renderFilters(accounts: Account[]): string {
  const years = db.exec('SELECT DISTINCT substr(date, 1, 4) AS y FROM transactions ORDER BY y DESC');
  const yearOptions = (years[0]?.values ?? []).map((r) => `<option value="${r[0]}">${r[0]}</option>`).join('');
  const accountOptions = accounts.map((a) => `<option value="${a.id}">${a.bank_name} — ${a.account_name}</option>`).join('');

  return `
    <div class="filters">
      <select id="filter-account">
        <option value="all">All accounts</option>
        ${accountOptions}
      </select>
      <select id="filter-currency">
        <option value="all">All currencies</option>
        <option value="VND">VND</option>
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
      </select>
      <select id="filter-year">
        <option value="all">All years</option>
        ${yearOptions}
      </select>
    </div>`;
}

function renderTransactions(accounts: Account[]): string {
  let sql = `
    SELECT t.date, a.bank_name, a.account_name, a.currency, t.amount, t.balance_after, t.description
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE 1=1`;
  const args: (string | number)[] = [];

  if (filters.accountId !== 'all') {
    sql += ' AND t.account_id = ?';
    args.push(filters.accountId);
  }
  if (filters.currency !== 'all') {
    sql += ' AND a.currency = ?';
    args.push(filters.currency);
  }
  if (filters.year !== 'all') {
    sql += ' AND substr(t.date, 1, 4) = ?';
    args.push(String(filters.year));
  }
  sql += ' ORDER BY t.date DESC LIMIT 500';

  const res = db.exec(sql, args);
  const rows = res[0]?.values ?? [];

  const body = rows
    .map((r) => {
      const [date, bank, acc, currency, amount, balance, desc] = r as [string, string, string, string, number, number | null, string];
      return `
        <tr>
          <td>${date}</td>
          <td>${bank} — ${acc}</td>
          <td>${currency}</td>
          <td class="amount ${amount < 0 ? 'negative' : 'positive'}">${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
          <td class="balance">${balance !== null ? balance.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</td>
          <td>${desc ?? ''}</td>
        </tr>`;
    })
    .join('');

  return `
    <div class="panel">
      <h2>Transactions</h2>
      ${renderFilters(accounts)}
      ${
        rows.length
          ? `<table>
              <thead><tr><th>Date</th><th>Account</th><th>Cur.</th><th>Amount</th><th>Balance</th><th>Description</th></tr></thead>
              <tbody>${body}</tbody>
            </table>`
          : '<div class="empty-state">No transactions match these filters.</div>'
      }
    </div>`;
}

function render() {
  const accounts = getAccounts();
  app.innerHTML = `
    <h1>Bank</h1>
    <p class="subtitle">Personal ledger — stored locally in this browser, exportable as .sqlite.</p>
    ${renderOverview(accounts)}
    ${renderAccounts(accounts)}
    ${renderImport(accounts)}
    ${renderTransactions(accounts)}
    <div class="actions">
      <button id="export-db">Export .sqlite</button>
      <button id="import-db">Load .sqlite</button>
      <input type="file" id="import-db-input" accept=".sqlite,.db" style="display:none;" />
    </div>
  `;
  attachHandlers(accounts);
}

function attachHandlers(accounts: Account[]) {
  document.querySelector('#add-account-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    db.run('INSERT INTO accounts (bank_name, account_name, currency, account_type) VALUES (?, ?, ?, ?)', [
      String(data.get('bank_name')),
      String(data.get('account_name')),
      String(data.get('currency')),
      String(data.get('account_type')),
    ]);
    const { persist } = await import('./db/database');
    await persist();
    render();
  });

  document.querySelector('#import-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const accountId = Number(data.get('account_id'));
    const file = data.get('file') as File;
    const resultEl = document.querySelector('#import-result')!;

    if (!file || !accountId) return;
    const text = await file.text();
    const parser = detectParser(text) ?? bankParsers[0]; // no auto-match: falls back to first registered parser

    const result = await importCsvFile(db, accountId, file.name, text, parser);

    if (result.status === 'skipped-duplicate-file') {
      resultEl.textContent = `${file.name}: already imported — skipped.`;
    } else {
      const parts = [`${result.rowsInserted} new rows`];
      if (result.rowsSkippedAsDuplicate) parts.push(`${result.rowsSkippedAsDuplicate} already present`);
      if (result.rowsConflicting.length) parts.push(`⚠ ${result.rowsConflicting.length} balance mismatches — review manually`);
      resultEl.textContent = `${file.name}: ${parts.join(', ')}.`;
    }
    render();
  });

  document.querySelector('#filter-account')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    filters.accountId = v === 'all' ? 'all' : Number(v);
    render();
  });
  document.querySelector('#filter-currency')?.addEventListener('change', (e) => {
    filters.currency = (e.target as HTMLSelectElement).value as Filters['currency'];
    render();
  });
  document.querySelector('#filter-year')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    filters.year = v === 'all' ? 'all' : Number(v);
    render();
  });

  document.querySelector('#export-db')?.addEventListener('click', () => downloadDb());
  document.querySelector('#import-db')?.addEventListener('click', () => {
    document.querySelector<HTMLInputElement>('#import-db-input')?.click();
  });
  document.querySelector('#import-db-input')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await loadDbFromFile(bytes);
    db = await getDb();
    render();
  });

  void accounts; // referenced above via closures in the render functions
}

main();
