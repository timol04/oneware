/**
 * ui-components.js – reusable UI snippets (requires ui-components.css).
 * All functions build DOM elements; text is never inserted as HTML.
 * Texts go through i18n (data-i18n) so they follow language changes.
 */
import { unlockPremium, licenseOwner, normalizeKey } from './license.js';
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

/** Short confirmation message (role=status), disappears after 4 seconds. */
export function showToast(text) {
  document.querySelector('.ow-toast')?.remove();
  const toast = el('div', 'ow-toast', text);
  toast.setAttribute('role', 'status');
  document.body.append(toast);
  setTimeout(() => toast.remove(), 4000);
}

/** Formats input as XXXX-XXXX-XXXX-XXXX while typing. */
function formatKey(value) {
  return normalizeKey(value).slice(0, 16).match(/.{1,4}/g)?.join('-') ?? '';
}

/**
 * License dialog with two ways: buy, or enter a key.
 * Options: toolSlug, purchaseUrl, price, description (text), mode ('buy' | 'key'),
 * otherSlugs (slugs of other tools, to give a precise "wrong tool" message), onUnlock.
 * Returns Promise<boolean> (true = unlocked, false = closed).
 */
export function showLicenseDialog({ toolSlug, purchaseUrl, price, description, mode = 'buy', otherSlugs = [], onUnlock } = {}) {
  if (!toolSlug) throw new Error('toolSlug is required');
  return new Promise((resolve) => {
    const dialog = el('dialog', 'ow-dialog');
    dialog.setAttribute('aria-labelledby', 'ow-license-title');
    const form = el('form');
    form.method = 'dialog';

    const head = el('div', 'ow-row');
    head.style.justifyContent = 'space-between';
    const heading = el('h2');
    heading.id = 'ow-license-title';
    heading.append(createIcon('key'), ' ', i18nEl('span', '', 'core.license.title'));
    const close = el('button', 'ow-iconbtn');
    close.type = 'button';
    close.append(createIcon('x', { size: '1.1rem' }));
    close.title = t('core.license.close');
    close.setAttribute('aria-label', t('core.license.close'));
    close.addEventListener('click', () => dialog.close());
    head.append(heading, close);

    const intro = description ? el('p', 'ow-muted', description) : null;

    // buy section
    let buy = null;
    if (purchaseUrl) {
      buy = el('div', 'ow-field');
      const link = el('a', mode === 'buy' ? 'ow-btn' : 'ow-btn ow-btn--secondary', price ? t('core.license.buyFor', { price }) : t('core.license.buyShort'));
      link.href = purchaseUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      buy.append(link);
    }

    // key section
    const keySection = el('div', 'ow-field');
    const label = i18nEl('label', 'ow-label', 'core.license.haveKey');
    const input = el('input', 'ow-input ow-key');
    input.id = `ow-license-${toolSlug}`;
    input.placeholder = 'XXXX-XXXX-XXXX-XXXX';
    input.autocomplete = 'off';
    input.autocapitalize = 'characters';
    input.spellcheck = false;
    input.maxLength = 19;
    input.setAttribute('aria-describedby', 'ow-license-msg');
    label.htmlFor = input.id;
    const ok = i18nEl('button', 'ow-btn', 'core.license.unlock');
    ok.type = 'submit';
    const inputRow = el('div', 'ow-row');
    input.style.flex = '1 1 12rem';
    input.style.width = 'auto';
    inputRow.append(input, ok);
    const msg = el('p', 'ow-error');
    msg.id = 'ow-license-msg';
    msg.setAttribute('role', 'alert');
    const help = i18nEl('p', 'ow-muted', 'core.license.help');
    help.style.margin = '0';
    help.style.fontSize = 'var(--fs-small)';
    keySection.append(label, inputRow, msg, help);

    const divider = el('p', 'ow-muted', t('core.license.or'));
    divider.dataset.i18n = 'core.license.or';
    divider.style.textAlign = 'center';
    const parts = mode === 'key' ? [keySection, buy && divider, buy] : [buy, buy && divider, keySection];
    form.append(head, ...(intro ? [intro] : []), ...parts.filter(Boolean));
    dialog.append(form);

    let result = false;
    input.addEventListener('input', () => {
      const formatted = formatKey(input.value);
      if (formatted !== input.value) input.value = formatted;
      input.classList.remove('ow-input--error');
      msg.textContent = '';
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (unlockPremium(toolSlug, input.value)) {
        result = true;
        dialog.close();
        showToast(t('core.license.success'));
        onUnlock?.();
        return;
      }
      const owner = licenseOwner(input.value, otherSlugs.filter((x) => x !== toolSlug));
      input.classList.add('ow-input--error');
      msg.textContent = owner ? t('core.license.otherTool', { tool: owner }) : t('core.license.invalidHint');
      input.focus();
    });
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });

    document.body.append(dialog);
    dialog.showModal();
    (mode === 'key' ? input : (dialog.querySelector('a.ow-btn') ?? input)).focus();
  });
}
