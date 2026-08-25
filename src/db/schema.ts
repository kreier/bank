// Schema is applied with `CREATE TABLE IF NOT EXISTS`, so it's safe to run
// against an already-populated database every time the app starts.
export const schema = `
CREATE TABLE IF NOT EXISTS accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_name     TEXT NOT NULL,
  account_name  TEXT NOT NULL,
  handle        TEXT UNIQUE,     -- short code for display/auto-import, e.g. 'BIDV-old'
  currency      TEXT NOT NULL CHECK (currency IN ('VND','USD','EUR')),
  account_type  TEXT NOT NULL DEFAULT 'checking'
                CHECK (account_type IN ('checking','savings','stock','term_deposit')),
  created_at    TEXT DEFAULT (datetime('now'))
);

-- One row per CSV file ever imported. file_hash lets us recognize
-- "this exact file was already imported" without touching row content.
CREATE TABLE IF NOT EXISTS import_batches (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id        INTEGER NOT NULL REFERENCES accounts(id),
  filename          TEXT NOT NULL,
  file_hash         TEXT NOT NULL,
  imported_at       TEXT DEFAULT (datetime('now')),
  row_count         INTEGER NOT NULL,
  date_range_start  TEXT,
  date_range_end    TEXT,
  UNIQUE (account_id, file_hash)
);

-- row_hash is a hash of (account_id, date, amount, description) — the
-- natural key of a bank transaction line. UNIQUE on it is what makes
-- re-importing an overlapping file a no-op instead of a duplicate.
CREATE TABLE IF NOT EXISTS transactions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id        INTEGER NOT NULL REFERENCES accounts(id),
  date              TEXT NOT NULL,          -- ISO YYYY-MM-DD
  amount            REAL NOT NULL,          -- positive = credit, negative = debit
  balance_after     REAL,                   -- as stated on the bank statement, if present
  description       TEXT,
  row_hash          TEXT NOT NULL,
  import_batch_id   INTEGER REFERENCES import_batches(id),
  UNIQUE (account_id, row_hash)
);
CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account_id, date);

-- Monthly exchange rate to USD. EUR/VND totals are derived at query time
-- by converting through USD, so we only ever need one column of rates.
CREATE TABLE IF NOT EXISTS exchange_rates (
  month         TEXT NOT NULL,   -- 'YYYY-MM'
  currency      TEXT NOT NULL CHECK (currency IN ('VND','EUR')),
  rate_to_usd   REAL NOT NULL,   -- 1 unit of currency = rate_to_usd USD
  source        TEXT,
  PRIMARY KEY (month, currency)
);

CREATE TABLE IF NOT EXISTS securities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER NOT NULL REFERENCES accounts(id),
  ticker      TEXT NOT NULL,
  name        TEXT
);

CREATE TABLE IF NOT EXISTS security_transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  security_id  INTEGER NOT NULL REFERENCES securities(id),
  date         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('buy','sell','dividend')),
  quantity     REAL,
  price        REAL,
  currency     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fixed_deposits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id      INTEGER NOT NULL REFERENCES accounts(id),
  principal       REAL NOT NULL,
  currency        TEXT NOT NULL,
  interest_rate   REAL,
  start_date      TEXT NOT NULL,
  maturity_date   TEXT,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','matured','closed'))
);
`;
