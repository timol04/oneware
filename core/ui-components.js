/**
 * ui-components.js – reusable UI snippets (requires ui-components.css).
 * All functions build DOM elements; text is never inserted as HTML.
 * Texts go through i18n (data-i18n) so they follow language changes.
 */
import { unlockPremium } from './license.js';
import { createIcon } from './icons.js';
import { t, availableLanguages, languageName, getLang, setLang, applyTranslations } from './i18n.js';
import { getTheme, toggleTheme, initTheme } from './theme.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function i18nEl(tag, className, key) {
  const node = el(tag, className, t(key));
  node.dataset.i18n = key;
  return node;
}

/** "Your data stays local" banner. Appended to `container` if given. */
export function createPrivacyBanner({ text } = {}, container) {
  const banner = el('div', 'ow-banner');
  banner.setAttribute('role', 'note');
  banner.append(createIcon('lock'), text ? el('span', '', text) : i18nEl('span', '', 'core.privacy'));
  container?.append(banner);
  return banner;
}

/** "Upgrade to Premium" button, a link to the Lemon Squeezy URL. */
export function createUpgradeButton({ url, label }, container) {
  if (!/^https?:\/\//i.test(url || '')) throw new Error('A valid purchase URL is required');
  const a = label ? el('a', 'ow-btn', label) : i18nEl('a', 'ow-btn', 'core.upgrade');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  container?.append(a);
  return a;
}

/** Traffic-light badge. status: 'green' | 'yellow' | 'red'. */
export function createStatusBadge(status, label) {
  if (!['green', 'yellow', 'red'].includes(status)) throw new Error(`Unknown status: ${status}`);
  return el('span', `ow-status ow-status--${status}`, label ?? t(`status.${status}`));
}

/** Icon button that switches between light and dark theme. */
export function createThemeToggle() {
  const btn = el('button', 'ow-iconbtn');
  btn.type = 'button';
  const sync = () => {
    const dark = getTheme() === 'dark';
    const label = t(dark ? 'core.theme.toLight' : 'core.theme.toDark');
    btn.replaceChildren(createIcon(dark ? 'sun' : 'moon', { size: '1.15rem' }));
    btn.title = label;
    btn.setAttribute('aria-label', label);
  };
  btn.addEventListener('click', toggleTheme);
  document.addEventListener('ow:themechange', sync);
  document.addEventListener('ow:langchange', sync);
  sync();
  return btn;
}

/** Language <select>; returns null while only one language is registered. */
export function createLanguageSwitcher() {
  const langs = availableLanguages();
  if (langs.length < 2) return null;
  const wrap = el('label', 'ow-langselect');
  const select = el('select');
  for (const code of langs) {
    const opt = el('option', '', languageName(code));
    opt.value = code;
    select.append(opt);
  }
  select.value = getLang();
  select.addEventListener('change', () => setLang(select.value));
  const label = i18nEl('span', 'ow-sr-only', 'core.lang.label');
  wrap.append(createIcon('globe'), label, select);
  return wrap;
}

/** Applies the theme, translates the page and mounts theme toggle (+ language switcher) in `container`. */
export function mountToolbar(container) {
  initTheme();
  applyTranslations();
  const bar = el('span', 'ow-toolbar');
  const sw = createLanguageSwitcher();
  if (sw) bar.append(sw);
  bar.append(createThemeToggle());
  container?.append(bar);
  return bar;
}

/**
 * License key dialog. Returns Promise<boolean> (true = unlocked, false = cancelled).
 * `onUnlock` is called on success.
 */
export function showLicenseDialog({ toolSlug, purchaseUrl, onUnlock } = {}) {
  if (!toolSlug) throw new Error('toolSlug is required');
  return new Promise((resolve) => {
    const dialog = el('dialog', 'ow-dialog');
    const form = el('form');
    form.method = 'dialog';

    const field = el('div', 'ow-field');
    const label = i18nEl('label', 'ow-label', 'core.license.label');
    const input = el('input', 'ow-input');
    input.id = `ow-license-${toolSlug}`;
    input.placeholder = 'XXXX-XXXX-XXXX-XXXX';
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.htmlFor = input.id;
    const error = el('p', 'ow-error');
    error.setAttribute('role', 'alert');
    field.append(label, input, error);

    const actions = el('div', 'ow-dialog__actions');
    const cancel = i18nEl('button', 'ow-btn ow-btn--secondary', 'core.license.cancel');
    cancel.type = 'button';
    const ok = i18nEl('button', 'ow-btn', 'core.license.unlock');
    ok.type = 'submit';
    if (purchaseUrl) createUpgradeButton({ url: purchaseUrl, label: t('core.license.buy') }, actions).dataset.i18n = 'core.license.buy';
    actions.append(cancel, ok);

    const heading = el('h2');
    heading.append(createIcon('key'), ' ', i18nEl('span', '', 'core.license.title'));
    form.append(heading, field, actions);
    dialog.append(form);

    let result = false;
    cancel.addEventListener('click', () => dialog.close());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (unlockPremium(toolSlug, input.value)) {
        result = true;
        dialog.close();
        onUnlock?.();
      } else {
        input.classList.add('ow-input--error');
        error.textContent = t('core.license.invalid');
        input.focus();
      }
    });
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });

    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}
