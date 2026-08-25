import type { Database } from 'sql.js';
import { getDb, downloadDb, loadDbFromFile, persist } from './db/database';
import { detectParser, bankParsers } from './parsers';
import { importCsvFile } from './import/importCsv';
import { getTheme, applyTheme, toggleTheme } from './lib/theme';
import type { DiscoveredImportFile } from './import/autoImport';

const app = document.querySelector<HTMLDivElement>('#app')!;

// Apply the saved/system theme immediately, before the first render, so
// there's no flash of the wrong palette.
applyTheme(getTheme());

interface Account {
  id: number;
  bank_name: string;
  account_name: string;
  handle: string | null;
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
let editingAccountId: number | null = null;
let editingAccountError: string | null = null;
// Only populated in `npm run dev` — see src/import/autoImport.ts.
let discoveredFiles: DiscoveredImportFile[] | null = null;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

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
        <p>${err instanceof Error ? escapeHtml(err.message) : 'Unknown error'}</p>
        <p class="account-meta">Check the browser console for details. This usually means the sql.js WASM file failed to load.</p>
      </div>`;
    return;
  }

  // Dev-only: this dynamic import, gated on a statically-known-false flag in
  // production, is dropped from the build entirely — so the folder scan (and
  // any local CSV content matched by it) never ships to GitHub Pages.
  if (import.meta.env.DEV) {
    const { discoverImportFiles } = await import('./import/autoImport');
    discoveredFiles = discoverImportFiles();
  }

  render();
}

function getAccounts(): Account[] {
  const res = db.exec('SELECT id, bank_name, account_name, handle, currency, account_type FROM accounts ORDER BY currency, bank_name');
  if (res.length === 0) return [];
  return res[0].values.map((r) => ({
    id: r[0] as number,
    bank_name: r[1] as string,
    account_name: r[2] as string,
    handle: r[3] as string | null,
    currency: r[4] as Account['currency'],
    account_type: r[5] as string,
  }));
}

function accountLabel(a: Account): string {
  return a.handle ? a.handle : `${a.bank_name} — ${a.account_name}`;
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
          <span class="value">${fmt(c.native)}</span>
          <span class="label">${cur}${c.missingRate ? ' · no rate for USD conversion' : ` · ≈ $${fmt(c.usd)}`}</span>
        </div>`;
    })
    .join('');

  return `
    <div class="panel">
      <h2>Overview</h2>
      <div class="totals-row">
        <div class="total-figure">
          <span class="value">$${fmt(totalUsd)}</span>
          <span class="label">Total (USD)${anyMissing ? ' · incomplete, missing exchange rates' : ''}</span>
        </div>
        ${figures}
      </div>
    </div>`;
}

function renderAccounts(accounts: Account[]): string {
  const rows = accounts
    .map((a) => {
      if (editingAccountId === a.id) {
        return `
          <div class="account-edit-row" data-account-id="${a.id}">
            <input name="bank_name" value="${escapeHtml(a.bank_name)}" placeholder="Bank name" required />
            <input name="account_name" value="${escapeHtml(a.account_name)}" placeholder="Account name" required />
            <input name="handle" value="${escapeHtml(a.handle ?? '')}" placeholder="Handle, e.g. BIDV-old" />
            <button data-save-account="${a.id}">Save</button>
            <button data-cancel-edit class="ghost" type="button">Cancel</button>
            ${editingAccountError ? `<span class="account-meta" style="color:var(--warn);">${escapeHtml(editingAccountError)}</span>` : ''}
          </div>`;
      }
      return `
        <div class="account-row">
          <div>
            <div class="account-name">
              ${a.handle ? `<span class="account-handle">${escapeHtml(a.handle)}</span> · ` : ''}${escapeHtml(a.bank_name)} — ${escapeHtml(a.account_name)}
            </div>
            <div class="account-meta">${a.account_type}</div>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="account-meta">${fmt(getAccountBalance(a.id))} ${a.currency}</div>
            <button data-edit-account="${a.id}" class="ghost" type="button">Edit</button>
          </div>
        </div>`;
    })
    .join('');

  return `
    <div class="panel">
      <h2>Accounts</h2>
      ${rows || '<div class="empty-state">No accounts yet — add one below.</div>'}
      <form id="add-account-form" class="actions" style="margin-top:16px; flex-wrap:wrap;">
        <input name="bank_name" placeholder="Bank name" required style="flex:1; min-width:120px;" />
        <input name="account_name" placeholder="Account name" required style="flex:1; min-width:120px;" />
        <input name="handle" placeholder="Handle, e.g. BIDV-old" style="flex:1; min-width:120px;" />
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
      <div id="add-account-error" class="account-meta" style="margin-top:6px; color:var(--warn);"></div>
    </div>`;
}

function renderImport(accounts: Account[]): string {
  const options = accounts.map((a) => `<option value="${a.id}">${escapeHtml(accountLabel(a))} (${a.currency})</option>`).join('');
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

function warningsBlock(warnings: string[]): string {
  if (warnings.length === 0) return '';
  return `
    <details class="warnings">
      <summary>⚠ ${warnings.length} warning${warnings.length === 1 ? '' : 's'} — review before trusting this import</summary>
      <ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
    </details>`;
}

function renderLocalImport(accounts: Account[]): string {
  if (discoveredFiles === null) return ''; // not in dev mode

  if (discoveredFiles.length === 0) {
    return `
      <div class="panel">
        <h2>Local import (dev only)</h2>
        <div class="empty-state">No files found under <code>import/&lt;HANDLE&gt;/*.csv</code> at the project root.</div>
      </div>`;
  }

  const handleToAccount = new Map(accounts.filter((a) => a.handle).map((a) => [a.handle as string, a]));
  const rows = discoveredFiles
    .map((f) => {
      const acc = handleToAccount.get(f.handle);
      return `
        <div class="account-row">
          <div>
            <div class="account-name">${escapeHtml(f.path)}</div>
            <div class="account-meta">${acc ? escapeHtml(`${acc.bank_name} — ${acc.account_name}`) : `⚠ no account has handle "${escapeHtml(f.handle)}"`}</div>
          </div>
        </div>`;
    })
    .join('');

  const importable = discoveredFiles.filter((f) => handleToAccount.has(f.handle)).length;

  return `
    <div class="panel">
      <h2>Local import (dev only)</h2>
      ${rows}
      <div class="actions">
        <button id="run-local-import" ${importable === 0 ? 'disabled' : ''} type="button">
          Import ${importable} matched file${importable === 1 ? '' : 's'}
        </button>
      </div>
      <div id="local-import-result" class="account-meta" style="margin-top:10px;"></div>
    </div>`;
}

function renderFilters(accounts: Account[]): string {
  const years = db.exec('SELECT DISTINCT substr(date, 1, 4) AS y FROM transactions ORDER BY y DESC');
  const yearOptions = (years[0]?.values ?? []).map((r) => `<option value="${r[0]}">${r[0]}</option>`).join('');
  const accountOptions = accounts.map((a) => `<option value="${a.id}">${escapeHtml(accountLabel(a))}</option>`).join('');

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
    SELECT t.date, a.handle, a.bank_name, a.account_name, a.currency, t.amount, t.balance_after, t.description
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
  sql += ' ORDER BY t.date ASC, t.id ASC'; // oldest first

  const res = db.exec(sql, args);
  const rows = res[0]?.values ?? [];

  const body = rows
    .map((r) => {
      const [date, handle, bank, acc, currency, amount, balance, desc] = r as [
        string,
        string | null,
        string,
        string,
        string,
        number,
        number | null,
        string,
      ];
      const label = handle || `${bank} — ${acc}`;
      const debit = amount < 0 ? -amount : null;
      const credit = amount >= 0 ? amount : null;
      return `
        <tr>
          <td>${date}</td>
          <td title="${escapeHtml(`${bank} — ${acc}`)}">${escapeHtml(label)}</td>
          <td>${currency}</td>
          <td class="debit">${debit !== null ? fmt(debit) : ''}</td>
          <td class="credit">${credit !== null ? fmt(credit) : ''}</td>
          <td class="balance">${balance !== null ? fmt(balance) : '—'}</td>
          <td>${escapeHtml(desc ?? '')}</td>
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
              <thead><tr><th>Date</th><th>Account</th><th>Cur.</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Description</th></tr></thead>
              <tbody>${body}</tbody>
            </table>`
          : '<div class="empty-state">No transactions match these filters.</div>'
      }
    </div>`;
}

function render() {
  const accounts = getAccounts();
  app.innerHTML = `
    <div class="top-row">
      <div>
        <h1>Bank</h1>
        <p class="subtitle">Personal ledger — stored locally in this browser, exportable as .sqlite.</p>
      </div>
      <button id="theme-toggle" class="ghost" type="button">${getTheme() === 'dark' ? '☀ Light' : '🌙 Dark'}</button>
    </div>
    ${renderOverview(accounts)}
    ${renderAccounts(accounts)}
    ${renderImport(accounts)}
    ${renderLocalImport(accounts)}
    ${renderTransactions(accounts)}
    <div class="actions">
      <button id="export-db" type="button">Export .sqlite</button>
      <button id="import-db" type="button">Load .sqlite</button>
      <input type="file" id="import-db-input" accept=".sqlite,.db" style="display:none;" />
    </div>
  `;
  attachHandlers(accounts);
}

function attachHandlers(accounts: Account[]) {
  document.querySelector('#theme-toggle')?.addEventListener('click', () => {
    toggleTheme();
    render();
  });

  document.querySelector('#add-account-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const handle = String(data.get('handle') ?? '').trim();
    const errorEl = document.querySelector('#add-account-error')!;
    try {
      db.run('INSERT INTO accounts (bank_name, account_name, handle, currency, account_type) VALUES (?, ?, ?, ?, ?)', [
        String(data.get('bank_name')),
        String(data.get('account_name')),
        handle || null,
        String(data.get('currency')),
        String(data.get('account_type')),
      ]);
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : String(err);
      return;
    }
    await persist();
    render();
  });

  document.querySelectorAll<HTMLButtonElement>('[data-edit-account]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingAccountId = Number(btn.dataset.editAccount);
      editingAccountError = null;
      render();
    });
  });
  document.querySelector('[data-cancel-edit]')?.addEventListener('click', () => {
    editingAccountId = null;
    editingAccountError = null;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-save-account]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.saveAccount);
      const row = btn.closest('.account-edit-row')!;
      const bankName = (row.querySelector('input[name="bank_name"]') as HTMLInputElement).value.trim();
      const accountName = (row.querySelector('input[name="account_name"]') as HTMLInputElement).value.trim();
      const handle = (row.querySelector('input[name="handle"]') as HTMLInputElement).value.trim();
      try {
        db.run('UPDATE accounts SET bank_name = ?, account_name = ?, handle = ? WHERE id = ?', [
          bankName,
          accountName,
          handle || null,
          id,
        ]);
      } catch (err) {
        editingAccountError = err instanceof Error ? err.message : String(err);
        render();
        return;
      }
      editingAccountId = null;
      editingAccountError = null;
      await persist();
      render();
    });
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
      resultEl.innerHTML = `${escapeHtml(file.name)}: already imported — skipped.`;
    } else {
      const parts = [`${result.rowsInserted} new rows`];
      if (result.rowsSkippedAsDuplicate) parts.push(`${result.rowsSkippedAsDuplicate} already present`);
      if (result.rowsConflicting.length) parts.push(`⚠ ${result.rowsConflicting.length} balance mismatches — review manually`);
      resultEl.innerHTML = `${escapeHtml(file.name)}: ${escapeHtml(parts.join(', '))}. ${warningsBlock(result.warnings)}`;
    }
    render();
  });

  document.querySelector('#run-local-import')?.addEventListener('click', async () => {
    if (!discoveredFiles) return;
    const handleToAccount = new Map(accounts.filter((a) => a.handle).map((a) => [a.handle as string, a]));
    const resultEl = document.querySelector('#local-import-result')!;
    const summaries: string[] = [];
    const allWarnings: string[] = [];

    for (const f of discoveredFiles) {
      const acc = handleToAccount.get(f.handle);
      if (!acc) continue;
      const parser = detectParser(f.content) ?? bankParsers[0];
      const result = await importCsvFile(db, acc.id, f.filename, f.content, parser);
      summaries.push(
        result.status === 'skipped-duplicate-file' ? `${f.path}: already imported` : `${f.path}: ${result.rowsInserted} new rows`,
      );
      allWarnings.push(...result.warnings.map((w) => `${f.path} — ${w}`));
    }

    resultEl.innerHTML = `${escapeHtml(summaries.join(' · ') || 'Nothing to import.')} ${warningsBlock(allWarnings)}`;
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
}

main();
