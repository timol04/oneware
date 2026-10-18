/**
 * license.js – local license key validation and premium status.
 *
 * Key format:  XXXX-XXXX-XXXX-XXXX   (16 characters, Crockford base32 alphabet)
 *   - characters 1–12: payload (free choice / random)
 *   - characters 13–16: checksum = 20 bits of an FNV-1a 32-bit hash over
 *       "<SALT>|<toolSlug>|<payload>"
 *     If a toolSlug is passed when validating, the key is only valid for that tool.
 *
 * NOTE: client-side validation is NOT copy protection. It filters typos and random
 * guesses; a determined user can bypass it. This is an accepted trade-off for a
 * one-time-payment product without a backend.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // without I, L, O, U
const PAYLOAD_LEN = 12;
const CHECK_LEN = 4;
const SALT = 'oneware-v1'; // change if needed → all existing keys become invalid

const storageKey = (toolSlug) => `premium_${toolSlug}`;

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function checksum(payload, toolSlug = '') {
  let n = fnv1a(`${SALT}|${toolSlug}|${payload}`) & 0xfffff; // 20 Bit = 4 × 5 Bit
  let out = '';
  for (let i = 0; i < CHECK_LEN; i++) {
    out = ALPHABET[n & 31] + out;
    n >>>= 5;
  }
  return out;
}

/** Normalizes input: upper case, strips spaces/dashes, O→0, I/L→1 (Crockford). */
export function normalizeKey(key) {
  if (typeof key !== 'string') return '';
  return key
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** true/false. With toolSlug, also checks that the key belongs to that tool. */
export function validateLicenseKey(key, toolSlug = '') {
  const k = normalizeKey(key);
  if (k.length !== PAYLOAD_LEN + CHECK_LEN) return false;
  for (const ch of k) if (!ALPHABET.includes(ch)) return false;
  const payload = k.slice(0, PAYLOAD_LEN);
  return checksum(payload, toolSlug) === k.slice(PAYLOAD_LEN);
}

/** Generates a valid key (for you as the seller; do not ship this call inside a tool). */
export function generateLicenseKey(toolSlug = '', payload) {
  if (payload === undefined) {
    const bytes = crypto.getRandomValues(new Uint8Array(PAYLOAD_LEN));
    payload = Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
  }
  payload = normalizeKey(payload);
  if (payload.length !== PAYLOAD_LEN) throw new Error(`payload must be ${PAYLOAD_LEN} characters`);
  const full = payload + checksum(payload, toolSlug);
  return full.match(/.{4}/g).join('-');
}

/** Reads the status from localStorage (separate per tool). */
export function isPremiumUnlocked(toolSlug) {
  if (!toolSlug) throw new Error('toolSlug is required');
  try {
    const stored = localStorage.getItem(storageKey(toolSlug));
    if (stored === null) return false;
    if (stored.startsWith('{')) { // online activation record
      const r = JSON.parse(stored);
      return r.v === 2 && !!r.key && !!r.instanceId;
    }
    return validateLicenseKey(stored, toolSlug); // offline checksum key
  } catch {
    return false; // localStorage blocked (e.g. private mode)
  }
}

/** Validates the key and stores it under `premium_${toolSlug}`. Returns true/false. */
export function unlockPremium(toolSlug, key) {
  if (!toolSlug) throw new Error('toolSlug is required');
  if (!validateLicenseKey(key, toolSlug)) return false;
  try {
    localStorage.setItem(storageKey(toolSlug), normalizeKey(key));
    globalThis.document?.dispatchEvent(new CustomEvent('ow:licensechange', { detail: { toolSlug } }));
    return true;
  } catch {
    return false;
  }
}

/** Returns the slug (from `slugs`) this key is valid for, or null. Used for "wrong tool" messages. */
export function licenseOwner(key, slugs = []) {
  return slugs.find((slug) => validateLicenseKey(key, slug)) ?? null;
}

/** Removes the unlock (e.g. for tests / support). */
export function lockPremium(toolSlug) {
  try { localStorage.removeItem(storageKey(toolSlug)); } catch { /* ignore */ }
  globalThis.document?.dispatchEvent(new CustomEvent('ow:licensechange', { detail: { toolSlug } }));
}

// ---- Lemon Squeezy license API (public endpoints, no API key needed) ----
// A key is activated once online; afterwards the status is stored locally and works offline.
// The activation limit (e.g. 3 devices) is configured per product in the Lemon Squeezy dashboard.
const LS_API = 'https://api.lemonsqueezy.com/v1/licenses';
const REVALIDATE_DAYS = 30;

async function lsPost(path, body, fetchImpl) {
  const res = await fetchImpl(`${LS_API}/${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* no JSON body */ }
  return { status: res.status, json };
}

function readRecord(toolSlug) {
  try {
    const raw = localStorage.getItem(storageKey(toolSlug));
    if (!raw?.startsWith('{')) return null;
    const r = JSON.parse(raw);
    return r.v === 2 ? r : null;
  } catch { return null; }
}

const defaultInstanceName = (toolSlug) =>
  `${toolSlug} (${globalThis.navigator?.userAgentData?.platform ?? globalThis.navigator?.platform ?? 'browser'})`;

/**
 * Activates a Lemon Squeezy license key for this tool.
 * Returns { ok: true } or { ok: false, reason } with reason one of
 * 'invalid' | 'limit' | 'disabled' | 'wrongProduct' | 'network'.
 * `productId` (from tool.config.json: lemonSqueezy.productId) makes sure the key belongs to this tool.
 */
export async function unlockPremiumOnline(toolSlug, key, { productId, fetchImpl = globalThis.fetch, instanceName, now = Date.now() } = {}) {
  if (!toolSlug) throw new Error('toolSlug is required');
  key = String(key ?? '').trim();
  if (!key) return { ok: false, reason: 'invalid' };

  let res;
  try { res = await lsPost('activate', { license_key: key, instance_name: instanceName ?? defaultInstanceName(toolSlug) }, fetchImpl); }
  catch { return { ok: false, reason: 'network' }; }
  const j = res.json;
  if (!j) return { ok: false, reason: 'network' };               // no usable answer (server error)
  if (!j.activated) {
    const err = String(j.error ?? '');
    return { ok: false, reason: /limit/i.test(err) ? 'limit' : /expired|disabled|inactive/i.test(err) ? 'disabled' : 'invalid' };
  }
  if (productId != null && Number(j.meta?.product_id) !== Number(productId)) {
    try { await lsPost('deactivate', { license_key: key, instance_id: j.instance?.id }, fetchImpl); } catch { /* best effort: frees the slot */ }
    return { ok: false, reason: 'wrongProduct' };
  }
  try {
    localStorage.setItem(storageKey(toolSlug), JSON.stringify({ v: 2, key, instanceId: j.instance?.id, checkedAt: now }));
  } catch { return { ok: false, reason: 'network' }; }
  globalThis.document?.dispatchEvent(new CustomEvent('ow:licensechange', { detail: { toolSlug } }));
  return { ok: true };
}

/**
 * Re-checks an online-activated license at most every 30 days. Offline or server errors never lock the tool.
 * Returns 'skip' | 'fresh' | 'offline' | 'ok' | 'revoked'.
 */
export async function revalidateLicense(toolSlug, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const rec = readRecord(toolSlug);
  if (!rec) return 'skip';
  if (now - (rec.checkedAt ?? 0) < REVALIDATE_DAYS * 86400000) return 'fresh';
  let res;
  try { res = await lsPost('validate', { license_key: rec.key, instance_id: rec.instanceId }, fetchImpl); }
  catch { return 'offline'; }
  const j = res.json;
  if (!j) return 'offline';
  if (j.valid === false || ['expired', 'disabled'].includes(j.license_key?.status)) {
    lockPremium(toolSlug);
    return 'revoked';
  }
  try { localStorage.setItem(storageKey(toolSlug), JSON.stringify({ ...rec, checkedAt: now })); } catch { /* ignore */ }
  return 'ok';
}
