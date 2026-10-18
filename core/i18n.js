/**
 * i18n.js – lightweight translations. English is the default language.
 *
 *   t('core.privacy')                   → translated string (falls back to English, then the key)
 *   registerMessages('en', { ... })     → add a tool's own dictionary (merged per language)
 *   localize(value)                     → string, or { en: '…', de: '…' } → current language
 *   <el data-i18n="key">                → textContent translated by applyTranslations()
 *   <el data-i18n-attr="placeholder:key;aria-label:key2">
 *
 * The chosen language is stored in localStorage ("ow_lang"); on the first visit the browser language is used if available, otherwise English. Changing it fires
 * the "ow:langchange" event on `document`; JS-rendered UI should re-render on it.
 */
import { LOCALES } from './locales/index.js';

export const DEFAULT_LANG = 'en';
const STORAGE_KEY = 'ow_lang';

const messages = {};
let current = DEFAULT_LANG;

export function registerMessages(lang, dict) {
  messages[lang] = { ...messages[lang], ...dict };
}
for (const [lang, dict] of Object.entries(LOCALES)) registerMessages(lang, dict);

export const availableLanguages = () => Object.keys(messages);
export const getLang = () => current;
/** Name of a language in that language itself. */
export const languageName = (code) => messages[code]?.['lang.name'] ?? code;

export function t(key, params = {}) {
  const str = messages[current]?.[key] ?? messages[DEFAULT_LANG]?.[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

/** Picks the current language from a { lang: text } object; plain strings are returned as-is. */
export function localize(value) {
  if (value && typeof value === 'object') return value[current] ?? value[DEFAULT_LANG] ?? Object.values(value)[0] ?? '';
  return value ?? '';
}

export function applyTranslations(root = globalThis.document) {
  if (!root) return;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}

export function setLang(lang, { persist = true } = {}) {
  if (!messages[lang]) return false;
  current = lang;
  if (persist) { try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage unavailable */ } }
  const doc = globalThis.document;
  if (doc) {
    doc.documentElement.lang = lang;
    applyTranslations(doc);
    doc.dispatchEvent(new CustomEvent('ow:langchange', { detail: { lang } }));
  }
  return true;
}

/**
 * Picks the language: ?lang=xx (and stores it) > stored choice > browser language (first visit) > English.
 * Called automatically on import.
 */
export function initI18n() {
  let stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  let fromUrl = null;
  try { fromUrl = new URLSearchParams(globalThis.location?.search).get('lang'); } catch { /* no URL */ }
  const browser = (globalThis.navigator?.languages ?? [globalThis.navigator?.language]).filter(Boolean)
    .map((l) => l.slice(0, 2).toLowerCase()).find((l) => messages[l]);

  if (fromUrl && messages[fromUrl]) setLang(fromUrl);
  else if (stored && messages[stored]) setLang(stored, { persist: false });
  else if (browser && browser !== DEFAULT_LANG) setLang(browser, { persist: false });
  else if (globalThis.document) globalThis.document.documentElement.lang = DEFAULT_LANG;
}
initI18n();

/** Runs `fn` on every language change (for JS-rendered UI). */
export function onLangChange(fn) {
  globalThis.document?.addEventListener('ow:langchange', fn);
}
