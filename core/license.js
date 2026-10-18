/**
 * license.js – lokale Lizenzschlüssel-Prüfung und Premium-Status.
 *
 * Schlüsselformat:  XXXX-XXXX-XXXX-XXXX   (16 Zeichen, Alphabet Crockford-Base32)
 *   - Zeichen 1–12: Nutzlast (frei wählbar / zufällig)
 *   - Zeichen 13–16: Prüfsumme = 20 Bit eines FNV-1a-32-Hashes über
 *       "<SALT>|<toolSlug>|<Nutzlast>"
 *     Ist beim Prüfen ein toolSlug angegeben, gilt der Schlüssel nur für dieses Tool.
 *
 * ACHTUNG: Client-seitige Prüfung ist KEIN Kopierschutz. Sie filtert Tippfehler und
 * Zufallstreffer, ein entschlossener Nutzer kann sie umgehen. Das ist für ein
 * Einmalzahlungs-Produkt ohne Backend bewusst akzeptiert.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // ohne I, L, O, U
const PAYLOAD_LEN = 12;
const CHECK_LEN = 4;
const SALT = 'oneware-v1'; // bei Bedarf ändern → alle bisherigen Schlüssel werden ungültig

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

/** Normalisiert Eingaben: Grossschreibung, Leerzeichen weg, O→0, I/L→1 (Crockford). */
export function normalizeKey(key) {
  if (typeof key !== 'string') return '';
  return key
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** true/false. Mit toolSlug wird zusätzlich geprüft, dass der Schlüssel zu diesem Tool gehört. */
export function validateLicenseKey(key, toolSlug = '') {
  const k = normalizeKey(key);
  if (k.length !== PAYLOAD_LEN + CHECK_LEN) return false;
  for (const ch of k) if (!ALPHABET.includes(ch)) return false;
  const payload = k.slice(0, PAYLOAD_LEN);
  return checksum(payload, toolSlug) === k.slice(PAYLOAD_LEN);
}

/** Erzeugt einen gültigen Schlüssel (für dich als Verkäufer; nicht im Tool ausliefern). */
export function generateLicenseKey(toolSlug = '', payload) {
  if (payload === undefined) {
    const bytes = crypto.getRandomValues(new Uint8Array(PAYLOAD_LEN));
    payload = Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
  }
  payload = normalizeKey(payload);
  if (payload.length !== PAYLOAD_LEN) throw new Error(`Nutzlast muss ${PAYLOAD_LEN} Zeichen haben`);
  const full = payload + checksum(payload, toolSlug);
  return full.match(/.{4}/g).join('-');
}

/** Liest den Status aus localStorage (pro Tool getrennt). */
export function isPremiumUnlocked(toolSlug) {
  if (!toolSlug) throw new Error('toolSlug fehlt');
  try {
    const stored = localStorage.getItem(storageKey(toolSlug));
    return stored !== null && validateLicenseKey(stored, toolSlug);
  } catch {
    return false; // localStorage gesperrt (z. B. Privatmodus)
  }
}

/** Validiert den Schlüssel und speichert ihn unter `premium_${toolSlug}`. Gibt true/false zurück. */
export function unlockPremium(toolSlug, key) {
  if (!toolSlug) throw new Error('toolSlug fehlt');
  if (!validateLicenseKey(key, toolSlug)) return false;
  try {
    localStorage.setItem(storageKey(toolSlug), normalizeKey(key));
    return true;
  } catch {
    return false;
  }
}

/** Entfernt die Freischaltung (z. B. für Tests / Support). */
export function lockPremium(toolSlug) {
  try { localStorage.removeItem(storageKey(toolSlug)); } catch { /* ignorieren */ }
}
