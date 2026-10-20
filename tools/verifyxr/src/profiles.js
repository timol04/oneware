// Saved requirement profiles, kept in this browser (IndexedDB store "verifyxr", so backup/cloud cover them). One profile = name + rules.
import { getAllItems, updateItem, saveItem, deleteItem } from '../../../core/storage.js';

const SLUG = 'verifyxr';
const LEGACY_KEY = 'verifyxr:profiles';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Keeps known fields with the right type; null if the required fields are missing. */
export function sanitizeRules(r) {
  if (!r || typeof r !== 'object' || typeof r.font !== 'string' || num(r.size) === null || num(r.lineSpacing) === null || !r.marginsCm) return null;
  const m = r.marginsCm;
  return {
    font: r.font.slice(0, 80), size: r.size, lineSpacing: r.lineSpacing,
    marginsCm: { top: num(m.top), bottom: num(m.bottom), left: num(m.left), right: num(m.right) },
    minWords: num(r.minWords), maxWords: num(r.maxWords), minPages: num(r.minPages), maxPages: num(r.maxPages),
    ignoreSpecial: r.ignoreSpecial !== false,
  };
}

const clean = (p) => ({ name: typeof p?.name === 'string' ? p.name : '', rules: sanitizeRules(p?.rules) });

// Profiles used to live in localStorage; move them into the store once.
async function migrateLegacy() {
  let legacy;
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch { return; }
  if (!Array.isArray(legacy)) return;
  try {
    for (const raw of legacy) {
      const p = clean(raw);
      if (p.name && p.rules) await saveItem(SLUG, { id: p.name, name: p.name, rules: p.rules }).catch(() => {});
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* try again next time */ }
}

async function read() {
  try {
    await migrateLegacy();
    return (await getAllItems(SLUG)).map(clean).filter((p) => p.name && p.rules);
  } catch { return []; }
}

export const listProfiles = async () => (await read()).sort((a, b) => a.name.localeCompare(b.name));
export const getProfile = async (name) => (await read()).find((p) => p.name === name);

/** Saves (or replaces) a profile. False if the name is empty or storage is blocked. */
export async function saveProfile(name, rules) {
  const n = name.trim().slice(0, 60);
  if (!n) return false;
  try {
    const item = { name: n, rules };
    await updateItem(SLUG, n, item).catch(() => saveItem(SLUG, { ...item, id: n }));
    return true;
  } catch { return false; }
}
export async function deleteProfile(name) {
  try { await deleteItem(SLUG, name); return true; } catch { return false; }
}
