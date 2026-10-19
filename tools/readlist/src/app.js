import { isPremiumUnlocked } from '../../../core/license.js';
import { saveItem, getAllItems, updateItem, deleteItem } from '../../../core/storage.js';
import { registerMessages, t, getLang, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import { createIcon } from '../../../core/icons.js';
import {
  FREE_LIMIT, TYPES, STATUSES, TYPE_ICONS, newEntry, setStatus, setProgress, percent, progressUnit, parseTags, allTags,
  displayTitle, visibleEntries, yearStats, counts, safeLink, atLimit, isoDate,
} from './readlist.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'readlist';
const SAVE_DELAY = 400;
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: render });

let entries = [];
let selectedId = null;
let view = 'list';
let query = '';
let fStatus = '';
let fType = '';
let fTag = '';
let saving = 0;
let saveTimer;
let deleteTimer;

const selected = () => entries.find((e) => e.id === selectedId) ?? null;
const premium = () => isPremiumUnlocked(SLUG);

function el(tag, className, attrs = {}) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k in e && k !== 'type' && k !== 'list') e[k] = v;
    else e.setAttribute(k, v);
  }
  return e;
}

function iconButton(btn, icon, label) {
  btn.replaceChildren(createIcon(icon, { size: '1.15rem' }));
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

// --- Storage ---
async function load() {
  entries = await getAllItems(SLUG);
  for (const e of entries) {
    e.tags ??= [];
    e.rating ??= 0;
    e.current ??= 0;
    e.total ??= 0;
  }
  if (selectedId && !selected()) selectedId = null;
}

async function persist(entry) {
  saving++;
  try { await updateItem(SLUG, entry.id, entry); } finally { saving--; }
}

/** Saves the open entry after a short pause. */
function touch(entry) {
  entry.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(entry), SAVE_DELAY);
  renderList();
  renderProgress(entry);
  renderMeta(entry);
}

async function flush() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const entry = selected();
  if (entry) await persist(entry);
}

// --- Dates ---
const dateFmt = () => new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeStyle: 'short' });

// --- Filters and list ---
function chip(label, pressed, key, value) {
  return el('button', 'rl-chip', { type: 'button', text: label, 'aria-pressed': String(pressed), 'data-filter': key, 'data-value': value });
}

function renderFilters() {
  const live = entries.filter((e) => !e.archived);
  const archived = entries.length - live.length;
  $('views').replaceChildren(
    chip(t('rl.view.list'), view === 'list', 'view', 'list'),
    chip(`${t('rl.view.archive')}${archived ? ` (${archived})` : ''}`, view === 'archive', 'view', 'archive'),
  );
  const c = counts(entries);
  $('status-filter').replaceChildren(
    chip(t('rl.all'), !fStatus, 'status', ''),
    ...STATUSES.map((s) => chip(`${t(`rl.status.${s}`)} (${c[s]})`, fStatus === s, 'status', s)),
  );
  $('type-filter').replaceChildren(
    chip(t('rl.all'), !fType, 'type', ''),
    ...TYPES.map((x) => chip(t(`rl.type.${x}`), fType === x, 'type', x)),
  );
  const tags = allTags(entries);
  if (fTag && !tags.some((x) => x.tag.toLowerCase() === fTag.toLowerCase())) fTag = '';
  $('tag-filter').replaceChildren(...(tags.length ? [
    chip(t('rl.all'), !fTag, 'tag', ''),
    ...tags.map((x) => chip(`${x.tag} (${x.count})`, fTag.toLowerCase() === x.tag.toLowerCase(), 'tag', x.tag)),
  ] : []));
  const year = new Date().getFullYear();
  const s = yearStats(entries, year);
  $('stats').textContent = s.total
    ? `${t('rl.stats', { year })}: ${s.total}${s.average ? ` · ${t('rl.stats.average', { value: s.average.toLocaleString(getLang()) })}` : ''}`
    : t('rl.stats.none', { year });
}

function starRow(rating) {
  const row = el('span', 'rl-card__stars', { 'aria-label': t('rl.rate', { count: rating }) });
  for (let i = 0; i < rating; i++) {
    const s = createIcon('star', { size: '.8rem' });
    s.style.fill = 'currentColor';
    row.append(s);
  }
  return row;
}

function renderList() {
  const shown = visibleEntries(entries, { view, query, status: fStatus, type: fType, tag: fTag });
  $('list').replaceChildren(...shown.map((e) => {
    const li = el('li');
    const b = el('button', 'rl-card', { type: 'button', 'data-id': e.id, 'data-status': e.status, 'aria-current': String(e.id === selectedId) });
    const head = el('span', 'rl-card__head');
    head.append(
      createIcon(TYPE_ICONS[e.type], { size: '1rem' }),
      el('span', 'rl-card__title', { text: displayTitle(e) || t('rl.untitled') }),
      el('span', 'rl-badge', { text: t(`rl.status.${e.status}`), 'data-status': e.status }),
    );
    b.append(head);
    const p = e.status === 'doing' ? percent(e) : null;
    if (p !== null) {
      const meter = el('span', 'rl-meter');
      const fill = el('i');
      fill.style.width = `${p}%`;
      meter.append(fill);
      b.append(meter);
    }
    const foot = el('span', 'rl-card__foot');
    foot.append(el('span', '', { text: [t(`rl.type.${e.type}`), e.creator.trim()].filter(Boolean).join(' · ') }));
    if (e.rating) foot.append(starRow(e.rating));
    b.append(foot);
    li.append(b);
    return li;
  }));
  const empty = $('empty');
  const filtered = query || fStatus || fType || fTag;
  empty.hidden = shown.length > 0;
  if (!shown.length) empty.textContent = t(filtered ? 'rl.noMatch' : view === 'archive' ? 'rl.emptyArchive' : 'rl.empty');
}

// --- Editor ---
function segButton(label, pressed, attrs, icon) {
  const b = el('button', 'rl-segbtn', { type: 'button', 'aria-pressed': String(pressed), ...attrs });
  if (icon) b.append(createIcon(icon, { size: '1rem' }));
  b.append(label);
  return b;
}

function renderTools(entry) {
  iconButton($('archive'), 'archive', t(entry.archived ? 'rl.unarchive' : 'rl.archive'));
  iconButton($('delete'), 'trash', t('rl.delete'));
  $('delete').classList.remove('is-armed');
  $('back').replaceChildren(createIcon('arrow-left', { size: '1rem' }), ` ${t('rl.back')}`);
}

function renderSegments(entry) {
  $('types').replaceChildren(...TYPES.map((x) => segButton(t(`rl.type.${x}`), entry.type === x, { 'data-type': x }, TYPE_ICONS[x])));
  $('statuses').replaceChildren(...STATUSES.map((s) => segButton(t(`rl.status.${s}`), entry.status === s, { 'data-set-status': s })));
}

function renderStars(entry) {
  $('stars').replaceChildren(...[1, 2, 3, 4, 5].map((n) => {
    const b = el('button', 'rl-star', { type: 'button', 'data-rating': n, 'aria-pressed': String(entry.rating >= n), 'aria-label': t('rl.rate', { count: n }), title: t('rl.rate', { count: n }) });
    b.append(createIcon('star', { size: '1.5rem' }));
    return b;
  }));
}

function renderProgress(entry) {
  const p = percent(entry);
  $('meter-fill').style.width = `${p ?? 0}%`;
  $('meter').setAttribute('aria-valuenow', String(p ?? 0));
  $('meter').hidden = p === null;
  const unit = t(`rl.unit.${progressUnit(entry.type)}`);
  $('unit').textContent = unit;
  if (p !== null) $('meter').setAttribute('aria-label', t('rl.progressText', { current: entry.current, total: entry.total, unit }));
}

function renderLink(entry) {
  const href = safeLink(entry.link);
  const a = $('open');
  a.hidden = !href;
  if (href) { a.href = href; iconButton(a, 'link', t('rl.open')); }
}

function renderMeta(entry) {
  $('meta').textContent = t('rl.updated', { date: dateFmt().format(entry.updated) });
}

function fillFields(entry) {
  $('title').value = entry.title;
  $('creator').value = entry.creator;
  $('creator-label').textContent = t(`rl.creator.${entry.type}`);
  $('link').value = entry.link;
  $('current').value = entry.current || '';
  $('total').value = entry.total || '';
  $('started').value = entry.started ?? '';
  $('finished').value = entry.finished ?? '';
  $('tags').value = entry.tags.join(', ');
  $('note').value = entry.note;
}

function renderEditor() {
  const entry = selected();
  $('app').classList.toggle('is-editing', !!entry);
  $('form').hidden = !entry;
  $('placeholder').hidden = !!entry;
  if (!entry) return;
  fillFields(entry);
  renderTools(entry);
  renderSegments(entry);
  renderStars(entry);
  renderProgress(entry);
  renderLink(entry);
  renderMeta(entry);
}

function render() {
  applyTranslations();
  $('new').replaceChildren(createIcon('plus', { size: '1.1rem' }), ` ${t('rl.new')}`);
  shell.setPremiumLimit(t('rl.limitLabel', { limit: FREE_LIMIT }), t('rl.usage', { count: entries.length, limit: FREE_LIMIT }));
  renderFilters();
  renderList();
  renderEditor();
}

// --- Actions ---
async function select(id) {
  await flush();
  selectedId = id === selectedId ? null : id;
  renderList();
  renderEditor();
}

async function createEntry() {
  await flush();
  if (atLimit(entries.length, premium())) { shell.showLimit(); return; }
  view = 'list';
  saving++;
  let stored;
  try { stored = await saveItem(SLUG, newEntry(TYPES.includes(fType) ? fType : 'book')); } finally { saving--; }
  entries.push(stored);
  selectedId = stored.id;
  render();
  $('title').focus();
}

$('new').addEventListener('click', createEntry);
$('search').addEventListener('input', (e) => { query = e.target.value; renderList(); });
$('list').addEventListener('click', (e) => {
  const card = e.target.closest('.rl-card');
  if (card) select(card.dataset.id);
});

document.querySelector('.rl__side').addEventListener('click', async (e) => {
  const b = e.target.closest('.rl-chip');
  if (!b) return;
  await flush();
  const { filter, value } = b.dataset;
  if (filter === 'view') {
    view = value;
    if (selected() && !!selected().archived !== (view === 'archive')) selectedId = null;
  } else if (filter === 'status') fStatus = fStatus === value ? '' : value;
  else if (filter === 'type') fType = fType === value ? '' : value;
  else fTag = fTag.toLowerCase() === value.toLowerCase() ? '' : value;
  render();
});

$('back').addEventListener('click', async () => { await flush(); selectedId = null; renderList(); renderEditor(); });

// Field editing. Typing updates the data in place so the field keeps focus.
const text = (id, apply) => $(id).addEventListener('input', (e) => { const x = selected(); if (x) { apply(x, e.target.value); touch(x); } });
text('title', (x, v) => { x.title = v; });
text('creator', (x, v) => { x.creator = v; });
text('link', (x, v) => { x.link = v.trim(); renderLink(x); });
text('note', (x, v) => { x.note = v; });
$('tags').addEventListener('change', (e) => {
  const x = selected();
  if (!x) return;
  x.tags = parseTags(e.target.value);
  e.target.value = x.tags.join(', ');
  touch(x);
  renderFilters();
});
for (const id of ['current', 'total']) {
  $(id).addEventListener('input', () => {
    const x = selected();
    if (!x) return;
    setProgress(x, $('current').value, $('total').value);
    touch(x);
  });
  $(id).addEventListener('change', () => { const x = selected(); if (x) { $('current').value = x.current || ''; $('total').value = x.total || ''; } });
}
for (const id of ['started', 'finished']) {
  $(id).addEventListener('change', (e) => {
    const x = selected();
    if (!x) return;
    x[id] = e.target.value || null;
    touch(x);
    renderFilters();
  });
}

$('types').addEventListener('click', (e) => {
  const b = e.target.closest('[data-type]');
  const x = selected();
  if (!b || !x) return;
  x.type = b.dataset.type;
  renderSegments(x);
  $('creator-label').textContent = t(`rl.creator.${x.type}`);
  touch(x);
});

$('statuses').addEventListener('click', (e) => {
  const b = e.target.closest('[data-set-status]');
  const x = selected();
  if (!b || !x) return;
  setStatus(x, b.dataset.setStatus, isoDate());
  $('current').value = x.current || '';
  $('started').value = x.started ?? '';
  $('finished').value = x.finished ?? '';
  renderSegments(x);
  touch(x);
  renderFilters();
});

$('stars').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rating]');
  const x = selected();
  if (!b || !x) return;
  const n = Number(b.dataset.rating);
  x.rating = x.rating === n ? 0 : n;
  renderStars(x);
  touch(x);
});

$('archive').addEventListener('click', async () => {
  const x = selected();
  if (!x) return;
  x.archived = !x.archived;
  x.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = undefined;
  await persist(x);
  selectedId = null;
  render();
});

$('delete').addEventListener('click', async () => {
  const x = selected();
  if (!x) return;
  const btn = $('delete');
  if (!btn.classList.contains('is-armed')) {
    btn.classList.add('is-armed');
    btn.title = t('rl.confirmDelete');
    btn.setAttribute('aria-label', t('rl.confirmDelete'));
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => { if (selected()) renderTools(selected()); }, 3000);
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = undefined;
  saving++;
  try { await deleteItem(SLUG, x.id); } finally { saving--; }
  entries = entries.filter((e) => e.id !== x.id);
  selectedId = null;
  render();
});

// Data changed elsewhere (import, cloud restore): reload
document.addEventListener('ow:datachange', async (e) => {
  if (e.detail?.tool !== SLUG || saving) return;
  await load();
  render();
});
addEventListener('pagehide', () => { flush(); });

onLangChange(render);
await load();
render();
