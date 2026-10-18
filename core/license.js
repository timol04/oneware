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
    return stored !== null && validateLicenseKey(stored, toolSlug);
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
