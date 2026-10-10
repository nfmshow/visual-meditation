import { STORAGE_KEYS } from './config.js';

// Picked files, kept in IndexedDB (localStorage only holds strings).
// The browser copies the file in, so it survives the original being moved or deleted.
const STORE = 'files';
let db = null;

function open() {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(STORAGE_KEYS.files, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return db;
}

// Resolves once the transaction has committed.
async function run(mode, fn) {
  const tx = (await open()).transaction(STORE, mode);
  const req = fn(tx.objectStore(STORE));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
  });
}

export async function saveFile(key, file) {
  await run('readwrite', (store) => store.put({ name: file.name, blob: file }, key));
  navigator.storage?.persist?.().catch?.(() => {}); // ask the browser not to clear it when space runs low
}

// { name, blob }, or undefined.
export const loadFile = (key) => run('readonly', (store) => store.get(key));
