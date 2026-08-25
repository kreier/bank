import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
// '?url' tells Vite to emit this as a standalone asset and give us its final
// URL (hashed, and correctly prefixed with `base` in both dev and build) —
// so the wasm binary ships from your own repo instead of an external CDN.
// This matters here: a CDN fetch failing silently (blocked network, offline,
// ad blocker) is the most likely cause of a blank screen with no visible error.
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { schema } from './schema';

const IDB_NAME = 'bank-app';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'main';

let sqlPromise: Promise<SqlJsStatic> | null = null;
let db: Database | null = null;

function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: () => sqlWasmUrl });
  }
  return sqlPromise;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadPersisted(): Promise<Uint8Array | null> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Write the current in-memory database to IndexedDB. Call after every mutation. */
export async function persist(): Promise<void> {
  if (!db) return;
  const data = db.export();
  const idb = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Add columns/tables that a schema change introduced, to databases created before it. */
function migrate(database: Database): void {
  const cols = database.exec('PRAGMA table_info(accounts)');
  const colNames = (cols[0]?.values ?? []).map((r) => r[1] as string);
  if (!colNames.includes('handle')) {
    database.run('ALTER TABLE accounts ADD COLUMN handle TEXT');
  }
}

/** Get the (singleton) database, loading it from IndexedDB or creating it fresh. */
export async function getDb(): Promise<Database> {
  if (db) return db;
  const SQL = await loadSqlJs();
  const saved = await loadPersisted();
  db = saved ? new SQL.Database(saved) : new SQL.Database();
  db.run(schema);
  migrate(db);
  return db;
}

/** Trigger a browser download of the current database as a .sqlite file. */
export function downloadDb(filename?: string): void {
  if (!db) return;
  const data = db.export();
  const blob = new Blob([data as unknown as BlobPart], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `bank-${new Date().toISOString().slice(0, 10)}.sqlite`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Replace the current database with an uploaded .sqlite file. */
export async function loadDbFromFile(bytes: Uint8Array): Promise<void> {
  const SQL = await loadSqlJs();
  db = new SQL.Database(bytes);
  db.run(schema); // no-op if tables already exist; adds anything missing
  migrate(db);
  await persist();
}
