/**
 * theme.js – light/dark theme. Default: system preference (prefers-color-scheme);
 * an explicit choice is stored in localStorage ("ow_theme"). Colours live in ui-components.css.
 */
const STORAGE_KEY = 'ow_theme';
const media = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)');

function stored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch { return null; }
}

export const getTheme = () => stored() ?? (media()?.matches ? 'dark' : 'light');

function apply(theme) {
  const doc = globalThis.document;
  if (!doc) return;
  doc.documentElement.setAttribute('data-theme', theme);
  doc.dispatchEvent(new CustomEvent('ow:themechange', { detail: { theme } }));
}

export function setTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') throw new Error('theme must be "light" or "dark"');
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* storage unavailable */ }
  apply(theme);
}

export const toggleTheme = () => setTheme(getTheme() === 'dark' ? 'light' : 'dark');

/** Applies the theme and follows system changes while the user has not chosen one. */
export function initTheme() {
  apply(getTheme());
  media()?.addEventListener?.('change', () => { if (!stored()) apply(getTheme()); });
}
