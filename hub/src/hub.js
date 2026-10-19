import { mountSiteShell, siteUrl } from '../../core/site-shell.js';
import { createStatusBadge } from '../../core/ui-components.js';
import { createIcon } from '../../core/icons.js';
import { previewHtml } from './preview.js';
import { groupTools } from './groups.js';
import { cloudBrowserLine } from '../../core/cloud-ui.js';
import { t, localize, onLangChange, applyTranslations } from '../../core/i18n.js';

mountSiteShell({ active: 'tools' });
for (const n of document.querySelectorAll('[data-icon]')) n.prepend(createIcon(n.dataset.icon, { size: n.dataset.iconSize || '1.25rem' }));

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function renderRow(tool) {
  const live = tool.status === 'live';
  const row = el('li', `tool-card${live ? '' : ' tool-card--soon'}`);
  row.dataset.category = tool.category;
  if (tool.accent) { row.style.setProperty('--accent-l', tool.accent.light); row.style.setProperty('--accent-d', tool.accent.dark); }
  const link = el(live ? 'a' : 'div', 'tool-card__link');
  if (live) link.href = siteUrl(tool.path);

  const preview = el('span', 'tool-card__preview');
  preview.innerHTML = previewHtml(tool.preview); // static markup from preview.js, no user data
  const icon = el('span', 'tool-card__icon');
  icon.append(createIcon(tool.icon, { size: '1.4rem' }));
  const top = el('span', 'tool-card__top');
  top.append(icon, el('h3', 'tool-card__name', localize(tool.name)));
  const meta = el('span', 'tool-card__meta');
  meta.append(el('span', 'tool-card__price', localize(tool.price)), createStatusBadge(live ? 'green' : 'yellow', t(live ? 'hub.live' : 'hub.soon')));
  const body = el('span', 'tool-card__body');
  body.append(top, el('p', 'tool-card__desc', localize(tool.shortDescription)), meta);
  link.append(preview, body);
  row.append(link);
  return row;
}

function renderGroup({ kind, items }) {
  const section = el('section', 'group');
  const head = el('div', 'group__head');
  head.append(el('h3', 'group__title', t(`hub.group.${kind}`)), el('p', 'group__desc', t(`hub.group.${kind}.desc`)));
  const ul = el('ul', 'catalog');
  ul.append(...items.map(renderRow));
  section.append(head, ul);
  return section;
}

const catalog = document.getElementById('catalog');
const filterBox = document.getElementById('filter');
let tools = null;
let failed = false;
let category = new URLSearchParams(location.search).get('category');

const categoryLabel = (c) => {
  const label = t(`category.${c}`);
  return label === `category.${c}` ? c.charAt(0).toUpperCase() + c.slice(1) : label;
};

function renderFilter() {
  const cats = [...new Set((tools ?? []).filter((x) => x.status === 'live').map((x) => x.category))];
  filterBox.hidden = cats.length < 2;
  if (cats.length < 2) { category = null; return; }
  const mk = (value, label) => {
    const b = el('button', '', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String((category ?? '') === value));
    b.addEventListener('click', () => {
      category = value || null;
      const url = new URL(location.href);
      category ? url.searchParams.set('category', category) : url.searchParams.delete('category');
      history.replaceState(null, '', url);
      render();
    });
    return b;
  };
  filterBox.setAttribute('aria-label', t('hub.tools'));
  filterBox.replaceChildren(mk('', t('hub.filter.all')), ...cats.map((c) => mk(c, categoryLabel(c))));
}

function render() {
  if (failed) {
    const retry = el('button', 'ow-btn ow-btn--secondary', t('hub.retry'));
    retry.type = 'button';
    retry.addEventListener('click', load);
    const msg = el('div', 'catalog__msg');
    msg.append(el('span', 'ow-error', t('hub.error')), retry);
    catalog.replaceChildren(msg);
    return;
  }
  if (!tools) return; // keep the pre-rendered list / skeleton until data arrives
  renderFilter();
  const shown = tools.filter((x) => !category || x.category === category || x.status !== 'live');
  catalog.replaceChildren(...(shown.length ? groupTools(shown).map(renderGroup) : [el('p', 'catalog__msg ow-muted', t('hub.empty'))]));
}
onLangChange(() => { render(); });

async function load() {
  failed = false;
  try {
    const res = await fetch(siteUrl('hub/tool-registry.json'));
    if (!res.ok) throw new Error(res.status);
    tools = await res.json();
  } catch {
    failed = true;
  }
  render();
}
const showBrowserLine = () => { const n = document.getElementById('cloud-check'); if (n) n.textContent = `${t('cloud.browsers.yes')} ${t('cloud.browsers.no')} ${cloudBrowserLine()}`; };
onLangChange(showBrowserLine);
showBrowserLine();
await load();
applyTranslations();
