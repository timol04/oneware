/**
 * persistence.js – protects users from data loss in a server-less tool:
 * backup reminders, storage availability check, persistent-storage request.
 */
export const BACKUP_INTERVAL_DAYS = 30;
const DAY = 86400000;
const lastKey = (slug) => `ow_lastexport_${slug}`;
const dismissKey = (slug) => `ow_backupdismiss_${slug}`;

function read(key) {
  try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* storage unavailable */ }
}

export const markExported = (slug, now = Date.now()) => write(lastKey(slug), now);
export const dismissBackupReminder = (slug, now = Date.now()) => write(dismissKey(slug), now);

/** True if there is data and no export within the interval (and the reminder was not dismissed within it). */
export function backupReminderDue(slug, itemCount, now = Date.now()) {
  if (!itemCount) return false;
  const dismissed = read(dismissKey(slug));
  if (dismissed && now - dismissed < BACKUP_INTERVAL_DAYS * DAY) return false;
  const last = read(lastKey(slug));
  return !last || now - last > BACKUP_INTERVAL_DAYS * DAY;
}

/** Returns null if local storage works, otherwise 'unavailable' (private mode, blocked storage). */
export async function storageProblem() {
  try {
    localStorage.setItem('ow_probe', '1');
    localStorage.removeItem('ow_probe');
  } catch { return 'unavailable'; }
  if (!globalThis.indexedDB) return 'unavailable';
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open('ow_probe');
      r.onsuccess = () => { r.result.close(); indexedDB.deleteDatabase('ow_probe'); resolve(null); };
      r.onerror = () => resolve('unavailable');
    } catch { resolve('unavailable'); }
  });
}

/** Asks the browser not to evict our data (no user prompt in most browsers). */
export async function requestPersistence() {
  try {
    if (globalThis.navigator?.storage?.persist && !(await navigator.storage.persisted())) return await navigator.storage.persist();
  } catch { /* unsupported */ }
  return false;
}
