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

const YOUTUBE_URL = 'https://www.youtube.com/channel/UClksNKTpR_8o3jnoHvX71jQ';

/** Plain link to the YouTube channel (no embed, no request until clicked) with an inline SVG icon. */
function youtubeLink() {
  const a = el('a', 'ow-sitefoot__social');
  a.href = YOUTUBE_URL;
  a.target = '_blank';
  a.rel = 'noopener';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', 'M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.27 5 12 5 12 5s-6.27 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2C2 8.78 2 12 2 12s0 3.22.4 4.8a2.5 2.5 0 0 0 1.76 1.77C5.73 19 12 19 12 19s6.27 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77C22 15.22 22 12 22 12s0-3.22-.4-4.8ZM10 15V9l5.2 3L10 15Z');
  svg.append(path);
  const label = el('span', '', 'shell.footer.youtube');
  a.append(svg, label);
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
  const product = column('shell.footer.product', link(siteUrl('#tools'), 'shell.footer.tools'), link(siteUrl('how-it-works/'), 'shell.footer.how'), youtubeLink());
  const legal = column('shell.footer.legal', link(siteUrl('legal/imprint/'), 'shell.footer.imprint'), link(siteUrl('legal/privacy/'), 'shell.footer.privacy'), link(siteUrl('legal/terms/'), 'shell.footer.terms'), link(siteUrl('legal/refund/'), 'shell.footer.refund'), link(siteUrl('legal/licenses/'), 'shell.footer.licenses'), link('mailto:oneware.contact@gmail.com', 'shell.footer.contact'));
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
