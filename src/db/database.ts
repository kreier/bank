import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { schema } from './schema';

// sql.js ships a .wasm binary that Vite doesn't need to bundle — pulling it
// from a CDN keeps the repo/build simple. Pin the version to match package.json.
const SQL_JS_VERSION = '1.10.3';

const IDB_NAME = 'bank-app';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'main';

let sqlPromise: Promise<SqlJsStatic> | null = null;
let db: Database | null = null;

function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@${SQL_JS_VERSION}/dist/${file}`,
    });
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

/** Get the (singleton) database, loading it from IndexedDB or creating it fresh. */
export async function getDb(): Promise<Database> {
  if (db) return db;
  const SQL = await loadSqlJs();
  const saved = await loadPersisted();
  db = saved ? new SQL.Database(saved) : new SQL.Database();
  db.run(schema);
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
  await persist();
}
