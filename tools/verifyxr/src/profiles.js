// Saved requirement profiles, kept in this browser (localStorage). One profile = name + rules.
const KEY = 'verifyxr:profiles';

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

// localStorage can be missing or throw (private mode): always caught.
function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list)
      ? list.map((p) => ({ name: typeof p?.name === 'string' ? p.name : '', rules: sanitizeRules(p?.rules) })).filter((p) => p.name && p.rules)
      : [];
  } catch { return []; }
}
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } };

export const listProfiles = () => read().sort((a, b) => a.name.localeCompare(b.name));
export const getProfile = (name) => read().find((p) => p.name === name);

/** Saves (or replaces) a profile. False if the name is empty or storage is blocked. */
export function saveProfile(name, rules) {
  const clean = name.trim().slice(0, 60);
  if (!clean) return false;
  return write([...read().filter((p) => p.name !== clean), { name: clean, rules }]);
}
export const deleteProfile = (name) => write(read().filter((p) => p.name !== name));
