import { isPremiumUnlocked } from '../../../core/license.js';
import { saveItem, getAllItems, updateItem, deleteItem } from '../../../core/storage.js';
import { registerMessages, t, getLang, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import { createIcon } from '../../../core/icons.js';
import {
  FREE_LIMIT, MOODS, newEntry, isoDate, parseDay, addDays, displayTitle, snippet, parseTags, normalizeTag, tagCounts,
  entryOn, hasContent, visibleEntries, streaks, averageMood, monthGrid, atLimit,
} from './journal.js';
import { renderMarkdown } from './markdown.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'journal';
const SAVE_DELAY = 400;
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: render });

let entries = [];
let selectedId = null;
let view = 'list';
let tag = null;
let query = '';
let mode = 'write';
let month = { y: new Date().getFullYear(), m: new Date().getMonth() };
let saving = 0;
let saveTimer;
let deleteTimer;

const selected = () => entries.find((e) => e.id === selectedId) ?? null;
const premium = () => isPremiumUnlocked(SLUG);
const today = () => isoDate();

function el(tagName, className, attrs = {}) {
  const e = document.createElement(tagName);
  if (className) e.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k in e && k !== 'type' && k !== 'list') e[k] = v;
    else e.setAttribute(k, v);
  }
  return e;
}

function iconButton(btn, icon, label, rotate) {
  const svg = createIcon(icon, { size: '1.15rem' });
  if (rotate) svg.style.transform = `rotate(${rotate}deg)`;
  btn.replaceChildren(svg);
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

// --- Storage ---
async function load() {
  entries = await getAllItems(SLUG);
  for (const e of entries) { e.title ??= ''; e.body ??= ''; e.tags ??= []; e.mood ??= null; }
  if (selectedId && !selected()) selectedId = null;
}

async function persist(entry) {
  saving++;
  try { await updateItem(SLUG, entry.id, entry); } finally { saving--; }
}

function touch(entry) {
  entry.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(entry), SAVE_DELAY);
  renderSide();
  renderMeta(entry);
}

async function flush() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const entry = selected();
  if (entry) await persist(entry);
}

/** Leaves the open entry: saves it, or drops it when nothing was written. */
async function leave() {
  await flush();
  const entry = selected();
  if (entry && !hasContent(entry)) {
    saving++;
    try { await deleteItem(SLUG, entry.id); } finally { saving--; }
    entries = entries.filter((e) => e.id !== entry.id);
  }
}

// --- Formatting ---
const longFmt = () => new Intl.DateTimeFormat(getLang(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthFmt = () => new Intl.DateTimeFormat(getLang(), { month: 'long', year: 'numeric' });
const monthHead = (iso) => monthFmt().format(parseDay(iso));
const weekdayName = (i) => new Intl.DateTimeFormat(getLang(), { weekday: 'short' }).format(new Date(2024, 0, 1 + i));
const unitText = (n) => t(`jr.unit.day${n === 1 ? '' : 's'}`, { count: n });
const moodLabel = (m) => t(`jr.mood.${m}`);

// --- Side: stats, views, tags, list, calendar ---
function renderStats() {
  const { current } = streaks(entries, today());
  const avg = averageMood(entries, today());
  const stat = (icon, label, value) => {
    const wrap = el('div');
    wrap.append(createIcon(icon, { size: '1rem' }), el('dt', '', { text: `${label}:` }), el('dd', '', { text: value }));
    return wrap;
  };
  $('stats').replaceChildren(
    stat('flame', t('jr.stat.streak'), unitText(current)),
    stat('note', t('jr.stat.count'), String(entries.filter(hasContent).length)),
    ...(avg ? [stat(`mood-${Math.round(avg)}`, t('jr.stat.mood'), avg.toFixed(1))] : []),
  );
}

function renderViews() {
  const chip = (label, v) => el('button', 'jr-chip', { type: 'button', text: label, 'aria-pressed': String(view === v), 'data-view': v });
  $('views').replaceChildren(chip(t('jr.view.list'), 'list'), chip(t('jr.view.calendar'), 'calendar'));
}

function renderTags() {
  const counts = tagCounts(entries);
  if (tag && !counts.some(([name]) => name === tag)) tag = null;
  $('tags').replaceChildren(...counts.map(([name, n]) => el('button', 'jr-chip', {
    type: 'button', text: `#${name} ${n}`, 'data-tag': name, 'aria-pressed': String(tag === name),
  })));
  $('tag-suggestions').replaceChildren(...counts.map(([name]) => new Option(name)));
}

function item(e) {
  const d = parseDay(e.date);
  const btn = el('button', 'jr-item', { type: 'button', 'data-id': e.id, 'aria-current': String(e.id === selectedId) });
  const day = el('span', 'jr-item__day');
  day.append(el('b', '', { text: String(d.getDate()) }), el('small', '', { text: new Intl.DateTimeFormat(getLang(), { weekday: 'short' }).format(d) }));
  const main = el('span', 'jr-item__main');
  main.append(el('span', 'jr-item__title', { text: displayTitle(e) || t('jr.untitled') }));
  const sub = snippet(e);
  if (sub) main.append(el('span', 'jr-item__sub', { text: sub }));
  if (e.tags.length) main.append(el('span', 'jr-item__tags', { text: e.tags.map((x) => `#${x}`).join(' ') }));
  btn.append(day, main);
  if (e.mood) { const icon = createIcon(`mood-${e.mood}`, { size: '1.4rem' }); icon.setAttribute('role', 'img'); icon.setAttribute('aria-label', moodLabel(e.mood)); btn.append(icon); }
  return btn;
}

function renderList() {
  const shown = visibleEntries(entries.filter((e) => hasContent(e) || e.id === selectedId), { tag, query });
  const nodes = [];
  let group = '';
  for (const e of shown) {
    const head = monthHead(e.date);
    if (head !== group) { group = head; nodes.push(el('li', 'jr-group-title', { text: head })); }
    const li = el('li');
    li.append(item(e));
    nodes.push(li);
  }
  $('list').replaceChildren(...nodes);
  $('empty').hidden = shown.length > 0;
  if (!shown.length) $('empty').textContent = t(query || tag ? 'jr.noMatch' : 'jr.empty');
}

function renderCal() {
  $('h-cal').textContent = monthFmt().format(new Date(month.y, month.m, 1));
  const now = today();
  const nodes = [0, 1, 2, 3, 4, 5, 6].map((i) => el('span', 'jr-cal__dow', { text: weekdayName(i), 'aria-hidden': 'true' }));
  const open = selected()?.date;
  for (const week of monthGrid(month.y, month.m)) {
    for (const iso of week) {
      const d = parseDay(iso);
      const e = entryOn(entries, iso);
      const filled = e && hasContent(e);
      const classes = ['jr-dayb'];
      if (d.getMonth() !== month.m) classes.push('is-outside');
      if (iso === now) classes.push('is-today');
      if (filled) classes.push('has-entry');
      const b = el('button', classes.join(' '), {
        type: 'button', 'data-day': iso, disabled: iso > now,
        'aria-label': `${longFmt().format(d)}${filled ? `, ${t('jr.stat.count').toLowerCase()}` : ''}`,
      });
      b.append(String(d.getDate()));
      if (filled && e.mood) b.append(createIcon(`mood-${e.mood}`, { size: '.9rem' }));
      if (iso === open) b.setAttribute('aria-current', 'date');
      nodes.push(b);
    }
  }
  $('cal').replaceChildren(...nodes);
}

function renderSide() {
  renderStats();
  renderTags();
  $('side-cal').hidden = view !== 'calendar';
  $('list').hidden = view === 'calendar' && !query && !tag;
  if (view === 'calendar') renderCal();
  renderList();
  if (view === 'calendar' && !query && !tag) $('empty').hidden = true;
}

// --- Editor ---
function renderTools() {
  iconButton($('delete'), 'trash', t('jr.delete'));
  $('delete').classList.remove('is-armed');
  iconButton($('day-prev'), 'chevron-down', t('jr.prevDay'), 90);
  iconButton($('day-next'), 'chevron-down', t('jr.nextDay'), -90);
  iconButton($('prev'), 'chevron-down', t('jr.prevMonth'), 90);
  iconButton($('next'), 'chevron-down', t('jr.nextMonth'), -90);
  $('back').replaceChildren(createIcon('arrow-left', { size: '1rem' }), ` ${t('jr.back')}`);
}

function renderMoods(e) {
  $('moods').replaceChildren(...MOODS.map((m) => {
    const b = el('button', 'jr-mood', { type: 'button', role: 'radio', 'aria-checked': String(e.mood === m), 'data-mood': String(m), title: moodLabel(m) });
    b.append(createIcon(`mood-${m}`, { size: '1.6rem' }), moodLabel(m));
    return b;
  }));
}

function renderEntryTags(e) {
  $('entry-tags').replaceChildren(...e.tags.map((name) => {
    const li = el('li');
    const b = el('button', 'jr-chip jr-chip-x', { type: 'button', 'data-remove': name, title: t('jr.removeTag', { tag: name }), 'aria-label': t('jr.removeTag', { tag: name }) });
    b.append(`#${name}`, createIcon('x', { size: '.8rem' }));
    li.append(b);
    return li;
  }));
}

function renderModes() {
  const chip = (label, m, icon) => {
    const b = el('button', 'jr-chip', { type: 'button', 'aria-pressed': String(mode === m), 'data-mode': m });
    b.append(createIcon(icon, { size: '.95rem' }), ` ${label}`);
    return b;
  };
  $('modes').replaceChildren(chip(t('jr.mode.write'), 'write', 'edit'), chip(t('jr.mode.preview'), 'preview', 'eye'));
  const e = selected();
  $('write').hidden = mode !== 'write';
  $('preview').hidden = mode !== 'preview';
  if (e && mode === 'preview') {
    $('preview').innerHTML = e.body.trim() ? renderMarkdown(e.body) : '';
    if (!e.body.trim()) $('preview').textContent = t('jr.previewEmpty');
  }
}

function renderMeta(e) {
  $('meta').textContent = t('jr.meta', { date: new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(e.updated)) });
}

function renderEditor() {
  const e = selected();
  $('app').classList.toggle('is-editing', !!e);
  $('form').hidden = !e;
  $('placeholder').hidden = !!e;
  if (!e) return;
  $('date').textContent = longFmt().format(parseDay(e.date));
  $('day-next').disabled = e.date >= today();
  if (document.activeElement !== $('title')) $('title').value = e.title;
  if (document.activeElement !== $('body')) $('body').value = e.body;
  renderTools();
  renderMoods(e);
  renderEntryTags(e);
  renderModes();
  renderMeta(e);
}

function render() {
  applyTranslations();
  $('new').replaceChildren(createIcon('plus', { size: '1.1rem' }), ` ${t('jr.new')}`);
  shell.setPremiumLimit(t('jr.limitLabel', { limit: FREE_LIMIT }), t('jr.usage', { count: entries.filter(hasContent).length, limit: FREE_LIMIT }));
  renderViews();
  renderSide();
  renderEditor();
}

// --- Actions ---
/** Opens the entry of a day; creates it if the day is empty (respecting the free limit). */
async function openDay(date) {
  await leave();
  let entry = entryOn(entries, date);
  if (!entry) {
    if (atLimit(entries.filter(hasContent).length, premium())) { selectedId = null; render(); shell.showLimit(); return; }
    saving++;
    try { entry = await saveItem(SLUG, newEntry(date)); } finally { saving--; }
    entries.push(entry);
  }
  selectedId = entry.id;
  const d = parseDay(date);
  month = { y: d.getFullYear(), m: d.getMonth() };
  mode = entry.body.trim() ? 'preview' : 'write';
  render();
  if (mode === 'write') $('body').focus();
}

$('new').addEventListener('click', () => openDay(today()));
$('search').addEventListener('input', (e) => { query = e.target.value; renderSide(); });

$('views').addEventListener('click', (e) => {
  const b = e.target.closest('.jr-chip');
  if (!b) return;
  view = b.dataset.view;
  render();
});
$('tags').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tag]');
  if (!b) return;
  tag = tag === b.dataset.tag ? null : b.dataset.tag;
  renderSide();
});
$('list').addEventListener('click', async (e) => {
  const b = e.target.closest('.jr-item');
  if (!b) return;
  await leave();
  selectedId = b.dataset.id;
  const entry = selected();
  const d = parseDay(entry.date);
  month = { y: d.getFullYear(), m: d.getMonth() };
  mode = entry.body.trim() ? 'preview' : 'write';
  render();
});
$('cal').addEventListener('click', (e) => {
  const b = e.target.closest('.jr-dayb');
  if (b && !b.disabled) openDay(b.dataset.day);
});
$('prev').addEventListener('click', () => { const d = new Date(month.y, month.m - 1, 1); month = { y: d.getFullYear(), m: d.getMonth() }; renderCal(); });
$('next').addEventListener('click', () => { const d = new Date(month.y, month.m + 1, 1); month = { y: d.getFullYear(), m: d.getMonth() }; renderCal(); });

$('back').addEventListener('click', async () => { await leave(); selectedId = null; render(); });
$('day-prev').addEventListener('click', () => { const e = selected(); if (e) openDay(addDays(e.date, -1)); });
$('day-next').addEventListener('click', () => { const e = selected(); if (e && e.date < today()) openDay(addDays(e.date, 1)); });

$('moods').addEventListener('click', (ev) => {
  const e = selected();
  const b = ev.target.closest('[data-mood]');
  if (!e || !b) return;
  const m = Number(b.dataset.mood);
  e.mood = e.mood === m ? null : m;
  renderMoods(e);
  touch(e);
});
$('title').addEventListener('input', (ev) => { const e = selected(); if (e) { e.title = ev.target.value; touch(e); } });
$('body').addEventListener('input', (ev) => { const e = selected(); if (e) { e.body = ev.target.value; touch(e); } });

$('modes').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-mode]');
  if (!b) return;
  mode = b.dataset.mode;
  renderModes();
  if (mode === 'write') $('body').focus();
});

// Tags
function addTags(text) {
  const e = selected();
  if (!e) return;
  const next = parseTags(text).filter((x) => !e.tags.includes(x));
  if (!next.length) return;
  e.tags = [...e.tags, ...next];
  renderEntryTags(e);
  touch(e);
}
$('tag-input').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' || ev.key === ',') {
    ev.preventDefault();
    addTags(ev.target.value);
    ev.target.value = '';
  } else if (ev.key === 'Backspace' && !ev.target.value) {
    const e = selected();
    if (e?.tags.length) { e.tags = e.tags.slice(0, -1); renderEntryTags(e); touch(e); }
  }
});
$('tag-input').addEventListener('change', (ev) => { if (normalizeTag(ev.target.value)) { addTags(ev.target.value); ev.target.value = ''; } });
$('entry-tags').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-remove]');
  const e = selected();
  if (!b || !e) return;
  e.tags = e.tags.filter((x) => x !== b.dataset.remove);
  renderEntryTags(e);
  touch(e);
});

$('delete').addEventListener('click', async () => {
  const e = selected();
  if (!e) return;
  const btn = $('delete');
  if (!btn.classList.contains('is-armed')) {
    btn.classList.add('is-armed');
    btn.title = t('jr.confirmDelete');
    btn.setAttribute('aria-label', t('jr.confirmDelete'));
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => { if (selected()) renderTools(); }, 3000);
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = undefined;
  saving++;
  try { await deleteItem(SLUG, e.id); } finally { saving--; }
  entries = entries.filter((x) => x.id !== e.id);
  selectedId = null;
  render();
});

// Data changed elsewhere (import, cloud restore): reload
document.addEventListener('ow:datachange', async (ev) => {
  if (ev.detail?.tool !== SLUG || saving) return;
  await load();
  render();
});
// A new day may have started while the page stayed open
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
addEventListener('pagehide', () => { flush(); });

onLangChange(render);
await load();
render();
