import { saveItem, getAllItems, updateItem, deleteItem } from '../../../core/storage.js';
import { registerMessages, t, getLang, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import { createIcon } from '../../../core/icons.js';
import {
  REPEATS, newList, newItem, newSubItem, isoDate, dueState, toggleItem, toggleSub, progress, overdueCount,
  clearCompleted, moveItem, displayTitle, visibleLists,
} from './checklists.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'checklists';
const SAVE_DELAY = 400;
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: render });

let lists = [];
let selectedId = null;
let view = 'lists';
let query = '';
let saving = 0;
let saveTimer;
let deleteTimer;
const collapsed = new Set(); // item ids whose details are folded away (details are open by default)

const selected = () => lists.find((l) => l.id === selectedId) ?? null;

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
  lists = await getAllItems(SLUG);
  for (const l of lists) l.items ??= [];
  for (const l of lists) for (const i of l.items) i.sub ??= [];
  if (selectedId && !selected()) selectedId = null;
}

async function persist(list) {
  saving++;
  try { await updateItem(SLUG, list.id, list); } finally { saving--; }
}

/** Saves the open checklist after a short pause. */
function touch(list) {
  list.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(list), SAVE_DELAY);
  renderList();
  renderProgress(list);
  renderMeta(list);
}

async function flush() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const list = selected();
  if (list) await persist(list);
}

// --- Dates ---
const dateFmt = () => new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeStyle: 'short' });
const dayFmt = () => new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'short' });
const formatDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return dayFmt().format(new Date(y, m - 1, d)); };

function dueLabel(item, state) {
  if (state === 'today') return t('cl.due.today');
  if (state === 'overdue') return t('cl.due.overdue', { date: formatDay(item.due) });
  return t('cl.due.other', { date: formatDay(item.due) });
}

// --- List ---
function renderViews() {
  const archived = lists.filter((l) => l.archived).length;
  const chip = (label, pressed, v) => el('button', 'cl-chip', { type: 'button', text: label, 'aria-pressed': String(pressed), 'data-view': v });
  $('views').replaceChildren(
    chip(t('cl.view.lists'), view === 'lists', 'lists'),
    chip(`${t('cl.view.archive')}${archived ? ` (${archived})` : ''}`, view === 'archive', 'archive'),
  );
}

function renderList() {
  const shown = visibleLists(lists, { view, query });
  $('list').replaceChildren(...shown.map((l) => {
    const p = progress(l);
    const late = overdueCount(l);
    const li = el('li', 'cl-card');
    const b = el('button', 'cl-item-card', { type: 'button', 'data-id': l.id, 'aria-current': String(l.id === selectedId) });
    const head = el('span', 'cl-card__head');
    head.append(el('span', 'cl-card__title', { text: displayTitle(l) || t('cl.untitled') }));
    if (l.pinned) {
      const pin = createIcon('pin', { size: '.95rem', label: t('cl.pinned') });
      pin.classList.add('cl-card__pin');
      head.append(pin);
    }
    const meter = el('span', 'cl-meter');
    const fill = el('i');
    fill.style.width = `${p.percent}%`;
    meter.append(fill);
    const foot = el('span', 'cl-card__foot');
    foot.append(el('span', '', { text: p.total ? t('cl.progress', { done: p.done, total: p.total }) : t('cl.progressNone') }));
    if (late) foot.append(el('span', 'cl-card__late', { text: t('cl.overdue', { count: late }) }));
    b.append(head, meter, foot);
    li.append(b);
    return li;
  }));
  const empty = $('empty');
  empty.hidden = shown.length > 0;
  if (!shown.length) empty.textContent = t(query ? 'cl.noMatch' : view === 'archive' ? 'cl.emptyArchive' : 'cl.empty');
}

// --- Editor ---
function renderTools(list) {
  iconButton($('pin'), 'pin', t(list.pinned ? 'cl.unpin' : 'cl.pin'));
  $('pin').setAttribute('aria-pressed', String(list.pinned));
  iconButton($('archive'), 'archive', t(list.archived ? 'cl.unarchive' : 'cl.archive'));
  iconButton($('delete'), 'trash', t('cl.delete'));
  $('delete').classList.remove('is-armed');
  $('back').replaceChildren(createIcon('arrow-left', { size: '1rem' }), ` ${t('cl.back')}`);
  $('add-btn').replaceChildren(createIcon('plus', { size: '1.1rem' }), ` ${t('cl.add')}`);
  $('clear').textContent = t('cl.clear');
}

function renderProgress(list) {
  const p = progress(list);
  $('meter-fill').style.width = `${p.percent}%`;
  $('meter').setAttribute('aria-valuenow', String(p.percent));
  $('meter').setAttribute('aria-label', p.total ? t('cl.progress', { done: p.done, total: p.total }) : t('cl.progressNone'));
  $('progress-text').textContent = p.total ? t('cl.progress', { done: p.done, total: p.total }) : t('cl.progressNone');
  $('clear').hidden = !list.items.some((i) => i.done);
}

function renderMeta(list) {
  $('meta').textContent = t('cl.updated', { date: dateFmt().format(list.updated) });
}

function checkButton(done, label) {
  const b = el('button', 'cl-check', { type: 'button', 'aria-pressed': String(done), 'aria-label': label, title: label });
  b.append(createIcon('check', { size: '.9rem' }));
  return b;
}

function iconAction(act, icon, label, extra = {}) {
  const b = el('button', 'cl-icon', { type: 'button', 'data-act': act, title: label, 'aria-label': label, ...extra });
  b.append(createIcon(icon, { size: '1.05rem' }));
  return b;
}

function renderItem(item, index, total) {
  const li = el('li', `cl-entry${item.done ? ' is-done' : ''}`, { 'data-id': item.id });
  const row = el('div', 'cl-row');
  const text = el('input', 'cl-text', { type: 'text', value: item.text, maxLength: 200, autocomplete: 'off', 'aria-label': t('cl.item.text') });
  row.append(checkButton(item.done, t('cl.item.check')), text);
  const state = dueState(item);
  if (item.due) {
    const chip = el('span', 'cl-due', { 'data-state': state ?? 'later' });
    if (item.repeat) chip.append(createIcon('repeat', { size: '.8rem' }));
    chip.append(item.done ? formatDay(item.due) : dueLabel(item, state));
    row.append(chip);
  } else if (item.repeat) {
    const chip = el('span', 'cl-due', { 'data-state': 'later' });
    chip.append(createIcon('repeat', { size: '.8rem' }), t(`cl.repeat.${item.repeat}`));
    row.append(chip);
  }
  const isOpen = !collapsed.has(item.id);
  row.append(iconAction('more', 'more', t('cl.item.more'), { 'aria-expanded': String(isOpen) }));
  li.append(row);

  if (item.sub.length) {
    const subs = el('ul', 'cl-subs');
    for (const s of item.sub) {
      const sli = el('li', `cl-sub${s.done ? ' is-done' : ''}`, { 'data-sub': s.id });
      sli.append(
        checkButton(s.done, t('cl.item.check')),
        el('input', 'cl-subtext', { type: 'text', value: s.text, maxLength: 200, autocomplete: 'off', 'aria-label': t('cl.sub.text') }),
        iconAction('remove-sub', 'x', t('cl.sub.remove')),
      );
      subs.append(sli);
    }
    li.append(subs);
  }

  if (isOpen) {
    const detail = el('div', 'cl-detail');
    const date = el('input', 'ow-input', { type: 'date', value: item.due ?? '', 'data-field': 'due', 'aria-label': t('cl.item.due') });
    const repeat = el('select', 'ow-input', { 'data-field': 'repeat', 'aria-label': t('cl.item.repeat') });
    repeat.append(new Option(t('cl.repeat.none'), ''), ...REPEATS.map((r) => new Option(t(`cl.repeat.${r}`), r)));
    repeat.value = item.repeat ?? '';
    const addSub = el('button', 'ow-btn ow-btn--secondary ow-btn--small', { type: 'button', 'data-act': 'add-sub' });
    addSub.append(createIcon('plus', { size: '.95rem' }), ` ${t('cl.item.addSub')}`);
    const up = iconAction('up', 'chevron-down', t('cl.item.up'), { disabled: index === 0 });
    up.firstChild.style.transform = 'rotate(180deg)';
    detail.append(date, repeat, addSub, el('span', 'cl-detail__spacer'), up,
      iconAction('down', 'chevron-down', t('cl.item.down'), { disabled: index === total - 1 }),
      iconAction('remove', 'trash', t('cl.item.remove')));
    li.append(detail);
  }
  return li;
}

function renderItems(list) {
  $('items').replaceChildren(...list.items.map((it, i) => renderItem(it, i, list.items.length)));
  if (!list.items.length) $('items').replaceChildren(el('li', 'cl-empty ow-muted', { text: t('cl.noItems') }));
}

function renderEditor() {
  const list = selected();
  $('app').classList.toggle('is-editing', !!list);
  $('form').hidden = !list;
  $('placeholder').hidden = !!list;
  if (!list) return;
  $('title').value = list.title;
  renderTools(list);
  renderProgress(list);
  renderItems(list);
  renderMeta(list);
}

function render() {
  applyTranslations();
  $('new').replaceChildren(createIcon('plus', { size: '1.1rem' }), ` ${t('cl.new')}`);
  renderViews();
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

async function createList() {
  await flush();
  view = 'lists';
  saving++;
  let stored;
  try { stored = await saveItem(SLUG, newList()); } finally { saving--; }
  lists.push(stored);
  selectedId = stored.id;
  render();
  $('title').focus();
}

$('new').addEventListener('click', createList);
$('search').addEventListener('input', (e) => { query = e.target.value; renderList(); });
$('list').addEventListener('click', (e) => {
  const card = e.target.closest('.cl-item-card');
  if (card) select(card.dataset.id);
});
$('views').addEventListener('click', async (e) => {
  const b = e.target.closest('.cl-chip');
  if (!b) return;
  await flush();
  view = b.dataset.view;
  if (selected() && !!selected().archived !== (view === 'archive')) selectedId = null;
  render();
});
$('back').addEventListener('click', async () => { await flush(); selectedId = null; renderList(); renderEditor(); });
$('title').addEventListener('input', (e) => { const l = selected(); if (l) { l.title = e.target.value; touch(l); } });

$('add').addEventListener('submit', (e) => {
  e.preventDefault();
  const list = selected();
  const text = $('add-input').value.trim();
  if (!list || !text) return;
  list.items.push(newItem(text));
  $('add-input').value = '';
  renderItems(list);
  touch(list);
  $('add-input').focus();
});

// Item editing by delegation. Typing updates the data in place so the field keeps focus.
const found = (target) => {
  const list = selected();
  const entry = target.closest('.cl-entry');
  const item = list?.items.find((i) => i.id === entry?.dataset.id);
  return { list, entry, item, sub: item?.sub.find((s) => s.id === target.closest('.cl-sub')?.dataset.sub) };
};

$('items').addEventListener('input', (e) => {
  const { list, item, sub } = found(e.target);
  if (!item) return;
  if (e.target.matches('.cl-subtext') && sub) sub.text = e.target.value;
  else if (e.target.matches('.cl-text')) item.text = e.target.value;
  else return;
  touch(list);
});

$('items').addEventListener('change', (e) => {
  const { list, item } = found(e.target);
  const field = e.target.dataset.field;
  if (!item || !field) return;
  if (field === 'due') item.due = e.target.value || null;
  else item.repeat = e.target.value || null;
  if (item.repeat && !item.due) item.due = isoDate();
  renderItems(list);
  touch(list);
});

$('items').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.matches('.cl-text, .cl-subtext')) return;
  e.preventDefault();
  $('add-input').focus();
});

$('items').addEventListener('click', (e) => {
  const { list, item, sub } = found(e.target);
  if (!item) return;
  const check = e.target.closest('.cl-check');
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (check) {
    if (sub) toggleSub(item, sub.id); else toggleItem(item);
  } else if (act === 'more') {
    if (collapsed.has(item.id)) collapsed.delete(item.id); else collapsed.add(item.id);
  } else if (act === 'add-sub') {
    const s = newSubItem('');
    item.sub.push(s);
    item.done = false;
    renderItems(list);
    touch(list);
    document.querySelector(`[data-sub="${s.id}"] .cl-subtext`)?.focus();
    return;
  } else if (act === 'remove-sub') {
    item.sub = item.sub.filter((s) => s.id !== sub.id);
  } else if (act === 'remove') {
    list.items = list.items.filter((i) => i !== item);
    collapsed.delete(item.id);
  } else if (act === 'up' || act === 'down') {
    moveItem(list.items, list.items.indexOf(item), act === 'up' ? -1 : 1);
  } else return;
  renderItems(list);
  touch(list);
});

$('clear').addEventListener('click', () => {
  const list = selected();
  if (!list || !clearCompleted(list)) return;
  renderItems(list);
  touch(list);
});

$('pin').addEventListener('click', () => {
  const list = selected();
  if (!list) return;
  list.pinned = !list.pinned;
  renderTools(list);
  touch(list);
});
$('archive').addEventListener('click', async () => {
  const list = selected();
  if (!list) return;
  list.archived = !list.archived;
  list.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = undefined;
  await persist(list);
  selectedId = null;
  render();
});
$('delete').addEventListener('click', async () => {
  const list = selected();
  if (!list) return;
  const btn = $('delete');
  if (!btn.classList.contains('is-armed')) {
    btn.classList.add('is-armed');
    btn.title = t('cl.confirmDelete');
    btn.setAttribute('aria-label', t('cl.confirmDelete'));
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => { if (selected()) renderTools(selected()); }, 3000);
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = undefined;
  saving++;
  try { await deleteItem(SLUG, list.id); } finally { saving--; }
  lists = lists.filter((l) => l.id !== list.id);
  selectedId = null;
  render();
});

// Data changed elsewhere (import, cloud restore): reload, keep the open checklist if it still exists
document.addEventListener('ow:datachange', async (e) => {
  if (e.detail?.tool !== SLUG || saving) return;
  await load();
  render();
});
addEventListener('pagehide', () => { flush(); });

onLangChange(render);
await load();
// Deep link used by Notes ("?list=<id>"): open that checklist right away
{
  const params = new URLSearchParams(location.search);
  const wanted = params.get('list');
  if (wanted) {
    const target = lists.find((l) => l.id === wanted);
    if (target) { view = target.archived ? 'archive' : 'lists'; selectedId = target.id; }
    params.delete('list');
    history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
  }
}
render();
