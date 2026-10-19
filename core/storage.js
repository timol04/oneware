/**
 * storage.js – IndexedDB wrapper. One shared database ("oneware"),
 * one object store per tool (name = toolSlug), primary key `id`.
 */

import { t } from './i18n.js';
import { markExported } from './persistence.js';

const DB_NAME = 'oneware';
const EXPORT_VERSION = 1;

let dbPromise = null;

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb(version) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, version);
    r.onupgradeneeded = () => {
      if (pendingStore && !r.result.objectStoreNames.contains(pendingStore)) {
        r.result.createObjectStore(pendingStore, { keyPath: 'id' });
      }
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => { r.result.close(); dbPromise = null; };
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
    // Blocked is only a notice: our own closing connection may still be finishing a transaction. Give up after a while.
    r.onblocked = () => setTimeout(() => reject(new Error(t('core.storage.blocked'))), 4000);
  });
}

let pendingStore = null;

// Opening, upgrading and starting a transaction must not overlap: parallel first-time calls for different tools
// would close each other's connection.
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

async function openFor(toolSlug) {
  if (!toolSlug || typeof toolSlug !== 'string') throw new Error('toolSlug is required');
  if (!dbPromise) dbPromise = openDb();
  let db = await dbPromise;
  if (!db.objectStoreNames.contains(toolSlug)) {
    const next = db.version + 1;
    db.close();
    pendingStore = toolSlug;
    dbPromise = openDb(next);
    try { db = await dbPromise; } finally { pendingStore = null; }
  }
  return db;
}

function store(toolSlug, mode) {
  return serial(async () => (await openFor(toolSlug)).transaction(toolSlug, mode).objectStore(toolSlug));
}

const changed = (toolSlug) => globalThis.document?.dispatchEvent(new CustomEvent('ow:datachange', { detail: { tool: toolSlug } }));

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Saves an item (adds `id` if missing). Returns the stored item. */
export async function saveItem(toolSlug, item) {
  const stored = { ...item, id: item.id ?? newId() };
  await req((await store(toolSlug, 'readwrite')).add(stored));
  changed(toolSlug);
  return stored;
}

export async function getAllItems(toolSlug) {
  return req((await store(toolSlug, 'readonly')).getAll());
}

export async function deleteItem(toolSlug, id) {
  await req((await store(toolSlug, 'readwrite')).delete(id));
  changed(toolSlug);
}

/** Overwrites the item with this id (id is kept). Throws if it does not exist. */
export async function updateItem(toolSlug, id, item) {
  const s = await store(toolSlug, 'readwrite');
  if ((await req(s.get(id))) === undefined) throw new Error(t('core.storage.notFound', { id }));
  const updated = { ...item, id };
  await req(s.put(updated));
  changed(toolSlug);
  return updated;
}

/** Export as an object (testable, no download). */
export async function buildExport(toolSlug) {
  return {
    tool: toolSlug,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data: await getAllItems(toolSlug),
  };
}

/** Downloads `<toolSlug>-export-YYYY-MM-DD.json`. */
export async function exportData(toolSlug) {
  const payload = await buildExport(toolSlug);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${toolSlug}-export-${payload.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markExported(toolSlug);
  return payload;
}

/**
 * Imports an export file (File/Blob or an already parsed object).
 * Validates the format and the `tool` field; existing items with the same id are overwritten.
 * With { replace: true } the store is cleared first. Returns the number of imported items.
 */
export async function importData(toolSlug, file, { replace = false } = {}) {
  let parsed = file;
  if (typeof file?.text === 'function') {
    try { parsed = JSON.parse(await file.text()); }
    catch { throw new Error(t('core.storage.invalidJson')); }
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.data)
      || typeof parsed.tool !== 'string' || typeof parsed.version !== 'number') {
    throw new Error(t('core.storage.invalidFormat'));
  }
  if (parsed.tool !== toolSlug) {
    throw new Error(t('core.storage.wrongTool', { found: parsed.tool, expected: toolSlug }));
  }
  if (parsed.version > EXPORT_VERSION) {
    throw new Error(t('core.storage.unsupportedVersion', { version: parsed.version }));
  }
  const items = parsed.data.map((it) => ({ ...it, id: it?.id ?? newId() }));
  const s = await store(toolSlug, 'readwrite');
  if (replace) await req(s.clear());
  for (const it of items) await req(s.put(it));
  changed(toolSlug);
  return items.length;
}
