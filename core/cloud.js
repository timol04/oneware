/**
 * cloud.js – optional "cloud folder" link, entirely client-side (no Oneware server).
 * The user picks a folder that their own cloud app already syncs (iCloud Drive, Dropbox, OneDrive,
 * Google Drive, ...). Oneware writes one backup file per tool into it and can restore from it.
 * Needs the File System Access API (showDirectoryPicker): Chrome, Edge, Opera, Brave on desktop.
 * Everywhere else the manual backup export/import keeps working.
 */
import { buildExport, importData } from './storage.js';

const DB = 'ow_cloud';
const STORE = 'folders';
const MIN_VERSIONS = { Chrome: 86, Edge: 86, Opera: 72 };

/** Recognises the browser family from a user agent string. */
export function detectBrowser(ua = navigator.userAgent) {
  const m = (re) => Number((ua.match(re) || [])[1]) || 0;
  if (/Edg\//.test(ua)) return { name: 'Edge', version: m(/Edg\/(\d+)/) };
  if (/OPR\//.test(ua)) return { name: 'Opera', version: m(/OPR\/(\d+)/) };
  if (/Firefox\//.test(ua)) return { name: 'Firefox', version: m(/Firefox\/(\d+)/) };
  if (/Chrome\//.test(ua) || /CriOS\//.test(ua)) return { name: 'Chrome', version: m(/(?:Chrome|CriOS)\/(\d+)/) };
  if (/Safari\//.test(ua)) return { name: 'Safari', version: m(/Version\/(\d+)/) };
  return { name: 'Unknown', version: 0 };
}

/** { supported, browser, mobile } - supported means a folder can be linked in this browser. */
export function getCloudSupport(win = globalThis) {
  const ua = win.navigator?.userAgent ?? '';
  const browser = detectBrowser(ua);
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const api = typeof win.showDirectoryPicker === 'function' && win.isSecureContext !== false;
  // Brave looks like Chrome but ships with the File System Access API switched off.
  const braveOff = !!win.navigator?.brave && !api && !mobile;
  return { supported: api && !mobile && browser.version >= (MIN_VERSIONS[browser.name] ?? 0), browser: braveOff ? { name: 'Brave', version: browser.version } : browser, mobile, braveOff };
}

const fileName = (slug) => `oneware-${slug}.json`;
const stateKey = (slug) => `ow_cloud_${slug}`;
const readState = (slug) => { try { return JSON.parse(localStorage.getItem(stateKey(slug))) || {}; } catch { return {}; } };
const writeState = (slug, s) => { try { localStorage.setItem(stateKey(slug), JSON.stringify(s)); } catch { /* storage blocked */ } };

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbOp(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}
// One folder for everything is stored under this key; a tool's own folder (if any) takes precedence.
const ALL = '*';
const getOwnHandle = (slug) => dbOp('readonly', (s) => s.get(slug)).catch(() => undefined);
const getHandle = async (slug) => (await getOwnHandle(slug)) ?? (await getOwnHandle(ALL));

/** Link info for a tool: { name, lastSync, shared } or null. `shared` means it uses the one folder for all tools. */
export async function getCloudLink(slug) {
  const own = await getOwnHandle(slug);
  const handle = own ?? (await getOwnHandle(ALL));
  return handle ? { name: handle.name, lastSync: readState(slug).lastSync ?? null, shared: !own } : null;
}

/** The one folder for all tools: { name } or null. */
export async function getSharedCloud() {
  const handle = await getOwnHandle(ALL);
  return handle ? { name: handle.name } : null;
}

/** Lets the user pick one folder for all tools and writes a backup file per tool into it. Throws AbortError if cancelled. */
export async function connectCloudAll(slugs) {
  const handle = await showDirectoryPicker({ id: 'oneware', mode: 'readwrite', startIn: 'documents' });
  await dbOp('readwrite', (s) => s.put(handle, ALL));
  await syncCloudAll(slugs, { interactive: true });
  return { name: handle.name };
}

/** Saves every given tool into its linked folder. Returns { ok, needsAccess }. */
export async function syncCloudAll(slugs, { interactive = false } = {}) {
  const out = { ok: 0, needsAccess: 0 };
  for (const slug of slugs) {
    const r = await syncCloud(slug, { interactive });
    if (r === 'ok') out.ok++; else if (r === 'needs-access') out.needsAccess++;
  }
  return out;
}

/** Restores every given tool that has a backup file in its linked folder. Returns the number of restored entries. */
export async function restoreCloudAll(slugs) {
  let count = 0;
  for (const slug of slugs) {
    try { count += await restoreCloud(slug); } catch { /* no file for this tool yet */ }
  }
  return count;
}

export async function disconnectCloudAll() {
  await dbOp('readwrite', (s) => s.delete(ALL));
}

async function hasAccess(handle, ask) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission?.(opts)) === 'granted') return true;
  return ask && (await handle.requestPermission?.(opts)) === 'granted';
}

/** Writes the current backup into the linked folder. Returns 'ok' | 'needs-access' | 'not-linked'. */
export async function syncCloud(slug, { interactive = false } = {}) {
  const handle = await getHandle(slug);
  if (!handle) return 'not-linked';
  if (!(await hasAccess(handle, interactive))) return 'needs-access';
  const file = await handle.getFileHandle(fileName(slug), { create: true });
  const w = await file.createWritable();
  await w.write(JSON.stringify(await buildExport(slug), null, 2));
  await w.close();
  writeState(slug, { lastSync: Date.now() });
  return 'ok';
}

/** Lets the user pick a folder, remembers it and writes the first backup. Throws AbortError if cancelled. */
export async function connectCloud(slug) {
  const handle = await showDirectoryPicker({ id: 'oneware', mode: 'readwrite', startIn: 'documents' });
  await dbOp('readwrite', (s) => s.put(handle, slug));
  await syncCloud(slug, { interactive: true });
  return { name: handle.name };
}

/** Reads the backup file from the linked folder and merges it into local data. Returns the item count. */
export async function restoreCloud(slug) {
  const handle = await getHandle(slug);
  if (!handle) throw new Error('not linked');
  if (!(await hasAccess(handle, true))) throw new Error('no access');
  const file = await (await handle.getFileHandle(fileName(slug))).getFile();
  return importData(slug, file);
}

export async function disconnectCloud(slug) {
  await dbOp('readwrite', (s) => s.delete(slug));
  try { localStorage.removeItem(stateKey(slug)); } catch { /* ignore */ }
}
