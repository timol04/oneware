/**
 * site-shell.js – header and footer of the website pages (home, how it works, legal, 404).
 * Pages provide <main id="main" class="ow-container">; the shell adds the rest.
 */
import { t, applyTranslations } from './i18n.js';
import { initTheme } from './theme.js';
import { createThemeToggle, createLanguageSwitcher } from './ui-components.js';

/** Root URL of the site (the folder that contains core/), independent of the hosting path. */
export const ROOT = new URL('../', import.meta.url);
export const siteUrl = (path = '') => new URL(path, ROOT).href;

function el(tag, className, key) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (key) { n.dataset.i18n = key; n.textContent = t(key); }
  return n;
}
function link(href, key, className) {
  const a = el('a', className, key);
  a.href = href;
  return a;
}

const isDev = () => ['localhost', '127.0.0.1'].includes(location.hostname) || new URLSearchParams(location.search).has('dev');

/** Footer shared by website pages and tools. */
export function createSiteFooter() {
  const footer = el('footer', 'ow-sitefoot');
  const inner = el('div', 'ow-container ow-sitefoot__in');

  const brand = el('div', 'ow-sitefoot__brand');
  const mark = el('a', 'ow-wordmark');
  mark.href = siteUrl();
  mark.textContent = 'oneware';
  brand.append(mark, el('p', '', 'shell.footer.tagline'));

  const column = (headingKey, ...links) => {
    const nav = el('nav', 'ow-sitefoot__col');
    nav.setAttribute('aria-labelledby', headingKey.replace(/\./g, '-'));
    const h = el('h2', '', headingKey);
    h.id = headingKey.replace(/\./g, '-');
    nav.append(h, ...links);
    return nav;
  };
  const product = column('shell.footer.product', link(siteUrl('#tools'), 'shell.footer.tools'), link(siteUrl('how-it-works/'), 'shell.footer.how'));
  const legal = column('shell.footer.legal', link(siteUrl('legal/imprint/'), 'shell.footer.imprint'), link(siteUrl('legal/privacy/'), 'shell.footer.privacy'), link(siteUrl('legal/terms/'), 'shell.footer.terms'), link(siteUrl('legal/licenses/'), 'shell.footer.licenses'), link('mailto:oneware.contact@gmail.com', 'shell.footer.contact'));
  if (isDev()) {
    const demo = el('a'); demo.href = siteUrl('tools/_demo/'); demo.textContent = 'Demo tool (dev)';
    const ui = el('a'); ui.href = siteUrl('core/test/ui-demo.html'); ui.textContent = 'UI components (dev)';
    product.append(demo, ui);
  }

  const base = el('div', 'ow-sitefoot__base');
  base.append(el('p', 'ow-sitefoot__license', 'shell.footer.license'));
  const sw = createLanguageSwitcher();
  if (sw) base.append(sw);
  base.append(el('span', '', 'shell.footer.copy'));

  inner.append(brand, product, legal, base);
  footer.append(inner);
  return footer;
}

/** Mounts skip link, header and footer. `active`: 'tools' | 'how' | undefined. */
export function mountSiteShell({ active } = {}) {
  initTheme();

  const skip = el('a', 'ow-skip', 'shell.skip');
  skip.href = '#main';

  const header = el('header', 'ow-sitehead');
  const inner = el('div', 'ow-container ow-sitehead__in');
  const mark = el('a', 'ow-wordmark');
  mark.href = siteUrl();
  mark.textContent = 'oneware';
  const nav = el('nav', 'ow-sitenav');
  nav.setAttribute('aria-label', 'Main');
  const tools = link(siteUrl('#tools'), 'shell.nav.tools');
  const how = link(siteUrl('how-it-works/'), 'shell.nav.how');
  if (active === 'how') how.setAttribute('aria-current', 'page');
  nav.append(tools, how);
  const bar = el('span', 'ow-toolbar ow-sitehead__bar');
  const sw = createLanguageSwitcher();
  if (sw) bar.append(sw);
  bar.append(createThemeToggle());
  inner.append(mark, nav, bar);
  header.append(inner);

  document.body.prepend(skip, header);
  document.body.append(createSiteFooter());
  applyTranslations();
}
