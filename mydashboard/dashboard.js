import { mountSiteShell, siteUrl } from '../core/site-shell.js';
import { createStatusBadge, showToast } from '../core/ui-components.js';
import { createIcon } from '../core/icons.js';
import { t, localize, onLangChange, applyTranslations, getLang } from '../core/i18n.js';
import { isPremiumUnlocked } from '../core/license.js';
import { getAllItems, exportAll, importAll } from '../core/storage.js';
import { getLastExport, BACKUP_INTERVAL_DAYS } from '../core/persistence.js';
import { getSharedCloud, getCloudSupport, connectCloudAll, syncCloudAll, restoreCloudAll, disconnectCloudAll } from '../core/cloud.js';
import { licensing } from '../core/site-config.js';
import { previewHtml } from '../hub/src/preview.js';
import { groupTools } from '../hub/src/groups.js';
import { collectToday, toggleToday } from '../core/today.js';

mountSiteShell();
for (const n of document.querySelectorAll('[data-icon]')) n.prepend(createIcon(n.dataset.icon, { size: n.dataset.iconSize || '1.25rem' }));

const toolsList = document.getElementById('dash-tools');
const dataList = document.getElementById('dash-data');
const editBtn = document.getElementById('dash-edit');
const dataSection = document.getElementById('dash-data').closest('aside');
const searchBar = document.getElementById('dash-searchbar');
const searchInput = document.getElementById('dash-search');
searchInput.addEventListener('input', () => { query = searchInput.value.trim().toLowerCase(); render(); });
let query = '';
const hint = document.getElementById('dash-hint');
editBtn.addEventListener('click', () => { editing = !editing; render(); });
let tools = null;
let rows = [];
let failed = false;
let editing = false;
let feed = [];
let shared = null;
const BASE = new URL(siteUrl('mydashboard/'), location.href).href;
const todayList = document.getElementById('dash-today');
const todaySection = document.getElementById('dash-today-section');
const isoToday = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

// Which tools are on the dashboard: a list of slugs, empty until the user adds some.
const KEY = 'ow_dashboard';
let selected = [];
try { const v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) selected = v; } catch { /* storage blocked or invalid */ }
const isOn = (slug) => selected.includes(slug);
function setOn(slug, on) {
  const all = tools.map((x) => x.slug);
  const next = new Set(selected);
  on ? next.add(slug) : next.delete(slug);
  selected = all.filter((x) => next.has(x));
  try { localStorage.setItem(KEY, JSON.stringify(selected)); } catch { /* keep in memory */ }
  render();
  loadFeed().then(render);
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
function button(label, onClick, className = 'ow-btn ow-btn--secondary ow-btn--small') {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
const days = (ms) => (Date.now() - ms) / 86400000;

async function collect() {
  try { shared = await getSharedCloud(); } catch { shared = null; }
  rows = await Promise.all(tools.map(async (tool) => {
    const live = tool.status === 'live';
    let count = 0;
    if (live && tool.stores !== false) {
      try { count = (await getAllItems(tool.slug)).length; } catch { /* storage blocked */ }
    }
    return { tool, live, count, premium: isPremiumUnlocked(tool.slug), backup: getLastExport(tool.slug) };
  }));
}
async function loadFeed() {
  const sources = tools.filter((x) => x.today && x.status === 'live' && isOn(x.slug));
  feed = await collectToday(sources, { today: isoToday(), lang: getLang(), base: BASE });
}
async function refresh() { await collect(); await loadFeed(); render(); }

function todayRow(entry) {
  const li = el('li', `today__row today__row--${entry.state}`);
  const body = el('span', 'today__body');
  body.append(el('span', 'today__title', entry.title));
  if (entry.detail) body.append(el('span', 'today__detail', entry.detail));
  let lead;
  if (entry.checkable) {
    lead = el('button', 'today__check');
    lead.type = 'button';
    lead.setAttribute('role', 'checkbox');
    lead.setAttribute('aria-checked', String(entry.state === 'done'));
    lead.setAttribute('aria-label', `${t('dash.todayCheck')}: ${entry.title}`);
    lead.append(createIcon('check', { size: '.95rem' }));
    lead.addEventListener('click', async () => {
      lead.disabled = true;
      try { await toggleToday(entry, { today: isoToday(), base: BASE }); } catch { showToast(t('dash.todayFailed')); }
      await refresh();
    });
  } else {
    lead = el('span', 'today__dot');
    lead.setAttribute('aria-hidden', 'true');
  }
  li.append(lead, body);
  return li;
}
function todayCard(tool, entries) {
  const card = el('li', 'today__card');
  setup(card, tool);
  const checkable = entries.filter((e) => e.checkable);
  const done = checkable.filter((e) => e.state === 'done').length;
  const head = el('div', 'today__head');
  const icon = el('span', 'today__icon');
  icon.append(createIcon(tool.icon, { size: '1.15rem' }));
  const open = el('a', 'today__name', localize(tool.name));
  open.href = siteUrl(tool.path);
  head.append(icon, open);
  if (checkable.length) head.append(el('span', 'today__count', `${done}/${checkable.length}`));
  card.append(head);
  if (checkable.length) {
    const bar = el('span', 'today__bar');
    const fill = el('span', 'today__fill');
    fill.style.width = `${Math.round((done / checkable.length) * 100)}%`;
    bar.append(fill);
    card.append(bar);
  }
  const rows = el('ul', 'today__rows');
  rows.append(...entries.map(todayRow));
  card.append(rows);
  return card;
}
function renderToday() {
  const sources = tools ? tools.filter((x) => x.today && x.status === 'live' && isOn(x.slug)) : [];
  todaySection.hidden = editing || !sources.length;
  if (todaySection.hidden) return;
  const cards = sources.map((tool) => [tool, feed.filter((e) => e.tool.slug === tool.slug)]).filter(([, entries]) => entries.length);
  todayList.replaceChildren(...(cards.length ? cards.map(([tool, entries]) => todayCard(tool, entries)) : [el('li', 'today__empty', t('dash.todayEmpty'))]));
}

function setup(li, tool) {
  if (tool.accent) { li.style.setProperty('--accent-l', tool.accent.light); li.style.setProperty('--accent-d', tool.accent.dark); }
}
function head(tool, ...extra) {
  const h = el('div', 'dash__head');
  const icon = el('span', 'dash__icon');
  icon.append(createIcon(tool.icon, { size: '1.4rem' }));
  const text = el('div', 'dash__text');
  text.append(el('h3', 'dash__name', localize(tool.name)), ...extra);
  h.append(icon, text);
  return h;
}

function toolRow({ tool, live, count, premium }) {
  const on = isOn(tool.slug);
  const li = el('li', `tool-card${live ? '' : ' tool-card--soon'}${editing ? '' : ' tool-card--compact'}${editing && !on ? ' tool-card--off' : ''}`);
  setup(li, tool);
  const link = el(live && !editing ? 'a' : 'div', 'tool-card__link');
  if (live && !editing) link.href = siteUrl(tool.path);
  const preview = el('div', 'tool-card__preview');
  preview.innerHTML = previewHtml(tool.preview); // static markup from preview.js, no user data
  const icon = el('span', 'tool-card__icon');
  icon.append(createIcon(tool.icon, { size: '1.4rem' }));
  const top = el('div', 'tool-card__top');
  top.append(icon, el('h3', 'tool-card__name', localize(tool.name)));
  const meta = el('div', 'tool-card__meta');
  if (!live) meta.append(createStatusBadge('yellow', t('dash.soon')));
  else {
    meta.append(el('span', 'ow-muted', tool.stores !== false ? (count === 1 ? t('dash.entriesOne') : t('dash.entries', { count })) : ''));
    meta.append(tool.hasPremium && licensing.enabled ? createStatusBadge(premium ? 'green' : 'yellow', t(premium ? 'dash.premium' : 'dash.free')) : '');
  }
  const body = el('div', 'tool-card__body');
  body.append(top, el('p', 'tool-card__desc', localize(tool.shortDescription)), meta);
  if (editing) {
    const b = button(t(on ? 'dash.remove' : 'dash.add'), () => setOn(tool.slug, !on), on ? 'ow-btn ow-btn--secondary dash__cta' : 'ow-btn dash__cta');
    b.setAttribute('aria-pressed', String(on));
    body.append(b);
  } else if (live && licensing.enabled && tool.hasPremium && !premium) body.append(el('span', 'ow-btn ow-btn--secondary dash__cta', t('dash.unlock')));
  if (editing) link.append(preview);
  link.append(body);
  li.append(link);
  return li;
}

function render() {
  renderToday();
  if (failed) { toolsList.replaceChildren(el('p', 'ow-error', t('dash.error'))); return; }
  if (!rows.length) { toolsList.replaceChildren(el('p', 'ow-muted', t('dash.empty'))); return; }
  const chosen = rows.filter((r) => editing || isOn(r.tool.slug));
  const matches = (r) => !query || `${localize(r.tool.name)} ${localize(r.tool.shortDescription)}`.toLowerCase().includes(query);
  const visible = editing ? chosen : chosen.filter(matches);
  searchBar.hidden = editing || chosen.length < 2;
  editBtn.replaceChildren(createIcon(editing ? 'check' : 'grid', { size: '1.1rem' }), t(editing ? 'dash.done' : 'dash.customize'));
  editBtn.hidden = false;
  editBtn.setAttribute('aria-pressed', String(editing));
  hint.hidden = !editing;
  hint.textContent = t('dash.customizeHint');
  dataSection.hidden = !chosen.length;
  if (!visible.length && chosen.length) {
    toolsList.replaceChildren(el('p', 'ow-muted dash__nomatch', t('dash.noMatch', { query: searchInput.value.trim() })));
    renderData();
    return;
  }
  if (!visible.length) {
    const empty = el('div', 'dash__empty');
    empty.append(el('p', 'dash__empty-title', t('dash.emptySelection')), el('p', 'dash__empty-help', t('dash.emptyHelp')), button(t('dash.start'), () => { editing = true; render(); }, 'ow-btn'));
    toolsList.replaceChildren(empty);
    renderData();
    return;
  }
  toolsList.replaceChildren(...groupTools(visible.map((r) => ({ ...r.tool, row: r }))).map(({ kind, items }) => {
    const section = el('section', 'group');
    const head = el('div', 'group__head');
    head.append(el('h3', 'group__title', t(`hub.group.${kind}`)), el('p', 'group__desc', t(`hub.group.${kind}.desc`)));
    const ul = el('ul', 'catalog');
    ul.append(...items.map((x) => toolRow(x.row)));
    section.append(head, ul);
    return section;
  }));
  renderData();
}
function renderData() {
  const stores = rows.filter((r) => r.live && r.tool.stores !== false);
  const slugs = stores.map((r) => r.tool.slug);
  const total = stores.reduce((sum, r) => sum + r.count, 0);
  const last = stores.filter((r) => r.count).map((r) => r.backup || 0);
  const oldest = last.length ? Math.min(...last) : null;
  const stale = total > 0 && (!oldest || days(oldest) > BACKUP_INTERVAL_DAYS);
  const parts = [];

  const status = el('div', 'dash__meta');
  if (!total) status.append(el('span', 'ow-muted', t('dash.noData')));
  else {
    status.append(el('span', '', oldest ? t('dash.lastBackup', { date: new Date(oldest).toLocaleDateString(getLang()) }) : t('dash.neverBackup')));
    if (stale) status.append(createStatusBadge('yellow', t('dash.stale')));
  }
  parts.push(status);

  const file = el('input');
  file.type = 'file'; file.accept = 'application/json'; file.hidden = true;
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = '';
    if (!f) return;
    try { showToast(t('shell.imported', { count: await importAll(slugs, f) })); refresh(); }
    catch (e) { showToast(t('shell.importFailed', { reason: e.message })); }
  });
  const actions = el('div', 'dash__actions');
  actions.append(
    button(t('dash.exportAll'), async () => { await exportAll(slugs); showToast(t('shell.exported')); refresh(); }),
    button(t('dash.importAll'), () => file.click()),
    file,
  );
  parts.push(actions);

  const support = getCloudSupport();
  const cloud = el('div', 'dash__cloud');
  if (!support.supported) cloud.append(el('p', 'ow-muted dash__cloud-note', t('cloud.all.unsupported', { browser: support.browser.name })));
  else if (!shared) {
    cloud.append(el('p', 'ow-muted dash__cloud-note', t('cloud.all.help')));
    cloud.append(button(t('cloud.all.connect'), async () => {
      try { await connectCloudAll(slugs); showToast(t('cloud.all.saved', { count: slugs.length })); await refresh(); }
      catch (e) { if (e?.name !== 'AbortError') showToast(t('cloud.connectFailed', { reason: e?.message || String(e) })); }
    }, 'ow-btn dash__cloud-btn'));
  } else {
    const head = el('div', 'dash__cloud-head');
    head.append(createIcon('cloud', { size: '1.1rem' }), el('strong', '', t('cloud.all.linked', { name: shared.name })));
    const row = el('div', 'dash__actions');
    row.append(
      button(t('cloud.all.saveAll'), async () => {
        try { const r = await syncCloudAll(slugs, { interactive: true }); showToast(r.needsAccess ? t('cloud.needsAccess') : t('cloud.all.saved', { count: r.ok })); await refresh(); }
        catch (e) { showToast(t('cloud.connectFailed', { reason: e?.message || String(e) })); }
      }),
      button(t('cloud.all.restoreAll'), async () => {
        try { showToast(t('cloud.all.restored', { count: await restoreCloudAll(slugs) })); await refresh(); }
        catch (e) { showToast(t('cloud.restoreFailed', { reason: e?.message || String(e) })); }
      }),
      button(t('cloud.all.disconnect'), async () => { await disconnectCloudAll(); await refresh(); }),
    );
    cloud.append(head, row);
  }
  parts.push(cloud);
  dataList.replaceChildren(...parts);
}

onLangChange(() => { loadFeed().then(render); });
try {
  const res = await fetch(siteUrl('hub/tool-registry.json'));
  if (!res.ok) throw new Error(res.status);
  tools = await res.json();
  await collect();
  await loadFeed();
} catch { failed = true; }
render();
applyTranslations();
document.addEventListener('ow:datachange', () => { if (tools) refresh(); });
document.addEventListener('visibilitychange', () => { if (tools && !document.hidden) refresh(); });
