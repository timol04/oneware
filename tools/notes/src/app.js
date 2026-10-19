import { isPremiumUnlocked } from '../../../core/license.js';
import { saveItem, getAllItems, updateItem, deleteItem } from '../../../core/storage.js';
import { registerMessages, t, getLang, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import { createIcon } from '../../../core/icons.js';
import { renderMarkdown } from './markdown.js';
import { applyFormat } from './format.js';
import { COLORS, FREE_LIMIT, newNote, displayTitle, snippet, normalizeTag, tagCounts, visibleNotes, atLimit } from './notes.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'notes';
const SAVE_DELAY = 400;
const TOOLBAR = [['bold', 'bold'], ['italic', 'italic'], ['heading', 'heading'], ['ul', 'list'], ['ol', 'list-ordered'], ['quote', 'quote'], ['code', 'code'], ['link', 'link']];
const FLOATING = ['bold', 'italic', 'heading', 'code', 'link'];
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: render });

let notes = [];
let selectedId = null;
let view = 'notes';
let tagFilter = null;
let query = '';
let mode = 'edit';
let saving = 0;
let saveTimer;
let deleteTimer;

const selected = () => notes.find((n) => n.id === selectedId) ?? null;
const premium = () => isPremiumUnlocked(SLUG);

function chip(label, pressed, attrs = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'nt-chip';
  b.textContent = label;
  b.setAttribute('aria-pressed', String(pressed));
  Object.assign(b.dataset, attrs);
  return b;
}

function iconButton(btn, icon, label) {
  btn.replaceChildren(createIcon(icon, { size: '1.15rem' }));
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

// --- Storage ---
async function load() {
  notes = await getAllItems(SLUG);
  if (selectedId && !selected()) selectedId = null;
}

async function persist(note) {
  saving++;
  try { await updateItem(SLUG, note.id, note); } finally { saving--; }
}

/** Saves the open note after a short pause in typing. */
function touch(note) {
  note.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(note), SAVE_DELAY);
  renderList();
  renderMeta(note);
}

async function flush() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const note = selected();
  if (note) await persist(note);
}

// --- List ---
const dateFmt = () => new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeStyle: 'short' });
const shortDate = () => new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'short' });

function renderViews() {
  const archived = notes.filter((n) => n.archived).length;
  $('views').replaceChildren(
    chip(t('nt.view.notes'), view === 'notes', { view: 'notes' }),
    chip(`${t('nt.view.archive')}${archived ? ` (${archived})` : ''}`, view === 'archive', { view: 'archive' }),
  );
}

function renderTags() {
  const counts = view === 'notes' ? tagCounts(notes) : [];
  if (tagFilter && !counts.some(([tag]) => tag === tagFilter)) tagFilter = null;
  $('tags').hidden = !counts.length;
  $('tags').replaceChildren(...counts.map(([tag, n]) => chip(`${tag} ${n}`, tag === tagFilter, { tag })));
}

function renderList() {
  const shown = visibleNotes(notes, { view, tag: tagFilter, query });
  $('list').replaceChildren(...shown.map((n) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-item';
    b.dataset.id = n.id;
    b.setAttribute('aria-current', String(n.id === selectedId));
    if (n.color) b.dataset.color = n.color;
    const head = document.createElement('span');
    head.className = 'nt-item__head';
    const title = document.createElement('span');
    title.className = 'nt-item__title';
    title.textContent = displayTitle(n) || t('nt.untitled');
    head.append(title);
    if (n.pinned) {
      const pin = createIcon('pin', { size: '.95rem', label: t('nt.pinned') });
      pin.classList.add('nt-item__pin');
      head.append(pin);
    }
    const text = document.createElement('span');
    text.className = 'nt-item__text';
    text.textContent = snippet(n);
    const foot = document.createElement('span');
    foot.className = 'nt-item__foot';
    foot.textContent = [shortDate().format(n.updated), ...n.tags.map((tag) => `#${tag}`)].join(' · ');
    b.append(head, text, foot);
    li.append(b);
    return li;
  }));
  const empty = $('empty');
  empty.hidden = shown.length > 0;
  if (!shown.length) empty.textContent = t(query || tagFilter ? 'nt.noMatch' : view === 'archive' ? 'nt.emptyArchive' : 'nt.empty');
}

// --- Editor ---
function renderColors(note) {
  const none = document.createElement('button');
  none.type = 'button';
  none.className = 'nt-color nt-color--none';
  none.dataset.color = '';
  none.title = t('nt.color.none');
  none.setAttribute('aria-label', t('nt.color.none'));
  none.setAttribute('aria-pressed', String(!note.color));
  $('colors').replaceChildren(none, ...COLORS.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-color';
    b.dataset.color = c;
    b.title = t(`nt.color.${c}`);
    b.setAttribute('aria-label', t(`nt.color.${c}`));
    b.setAttribute('aria-pressed', String(note.color === c));
    return b;
  }));
}

function renderNoteTags(note) {
  $('note-tags').replaceChildren(...note.tags.map((tag) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-chip nt-chip--tag';
    b.dataset.removeTag = tag;
    b.setAttribute('aria-label', t('nt.removeTag', { tag }));
    b.append(`#${tag} `, createIcon('x', { size: '.85rem' }));
    li.append(b);
    return li;
  }));
  const known = tagCounts(notes).map(([tag]) => tag).filter((tag) => !note.tags.includes(tag));
  $('tag-suggestions').replaceChildren(...known.map((tag) => new Option(tag)));
}

function renderTools(note) {
  iconButton($('pin'), 'pin', t(note.pinned ? 'nt.unpin' : 'nt.pin'));
  $('pin').setAttribute('aria-pressed', String(note.pinned));
  iconButton($('archive'), 'archive', t(note.archived ? 'nt.unarchive' : 'nt.archive'));
  iconButton($('delete'), 'trash', t('nt.delete'));
  $('delete').classList.remove('is-armed');
  $('back').replaceChildren(createIcon('arrow-left', { size: '1rem' }), ` ${t('nt.back')}`);
}

function renderModes() {
  $('modes').replaceChildren(
    chip(t('nt.mode.edit'), mode === 'edit', { mode: 'edit' }),
    chip(t('nt.mode.preview'), mode === 'preview', { mode: 'preview' }),
  );
  const preview = mode === 'preview';
  $('body').hidden = preview;
  $('fmt').hidden = preview;
  hideFloat();
  $('preview').hidden = !preview;
  if (preview) {
    const note = selected();
    $('preview').innerHTML = note?.body.trim() ? renderMarkdown(note.body) : `<p class="ow-muted">${t('nt.noPreview')}</p>`;
  }
}

// --- Formatting toolbar and selection bar ---
function formatButtons(kinds) {
  return kinds.map((kind) => {
    const icon = TOOLBAR.find(([k]) => k === kind)[1];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-fmt__btn';
    b.dataset.format = kind;
    b.title = t(`nt.fmt.${kind}`);
    b.setAttribute('aria-label', t(`nt.fmt.${kind}`));
    b.append(createIcon(icon, { size: '1.1rem' }));
    return b;
  });
}

function renderFormatBars() {
  $('fmt').replaceChildren(...formatButtons(TOOLBAR.map(([k]) => k)));
  $('float').replaceChildren(...formatButtons(FLOATING));
}

function format(kind) {
  const note = selected();
  const area = $('body');
  if (!note || mode !== 'edit') return;
  const r = applyFormat(area.value, area.selectionStart, area.selectionEnd, kind);
  area.value = r.text;
  area.focus();
  area.setSelectionRange(r.start, r.end);
  note.body = r.text;
  touch(note);
  updateFloat();
}

/** Pixel position of a character in the textarea, measured with a hidden copy of it. */
function caretPosition(area, index) {
  const style = getComputedStyle(area);
  const mirror = document.createElement('div');
  for (const prop of ['boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'padding', 'border', 'tabSize']) mirror.style[prop] = style[prop];
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '0' });
  mirror.textContent = area.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = area.value.slice(index) || '.';
  mirror.append(marker);
  document.body.append(mirror);
  const pos = { x: marker.offsetLeft, y: marker.offsetTop, h: parseFloat(style.lineHeight) || 24 };
  mirror.remove();
  return pos;
}

function hideFloat() { $('float').hidden = true; }

function updateFloat() {
  const area = $('body');
  const bar = $('float');
  if (mode !== 'edit' || document.activeElement !== area || area.selectionStart === area.selectionEnd) { hideFloat(); return; }
  bar.hidden = false;
  const { x, y, h } = caretPosition(area, area.selectionStart);
  const top = y - area.scrollTop;
  const above = top - bar.offsetHeight - 6;
  bar.style.top = `${above >= 0 ? above : top + h + 6}px`;
  bar.style.left = `${Math.max(0, Math.min(x, area.clientWidth - bar.offsetWidth))}px`;
}

document.addEventListener('mousedown', (e) => { if (e.target.closest('#fmt, #float')) e.preventDefault(); });
for (const id of ['fmt', 'float']) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-format]');
    if (b) format(b.dataset.format);
  });
}
for (const ev of ['select', 'keyup', 'mouseup', 'input', 'blur', 'scroll']) $('body').addEventListener(ev, () => setTimeout(updateFloat));
document.addEventListener('selectionchange', () => { if (document.activeElement === $('body')) updateFloat(); });
$('body').addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const kind = { b: 'bold', i: 'italic', k: 'link' }[e.key.toLowerCase()];
  if (kind) { e.preventDefault(); format(kind); }
});

function renderMeta(note) {
  $('meta').textContent = t('nt.updated', { date: dateFmt().format(note.updated) });
}

function renderEditor() {
  const note = selected();
  $('app').classList.toggle('is-editing', !!note);
  $('form').hidden = !note;
  $('placeholder').hidden = !!note;
  if (!note) return;
  $('title').value = note.title;
  $('body').value = note.body;
  $('editor').dataset.color = note.color ?? '';
  renderTools(note);
  renderColors(note);
  renderNoteTags(note);
  renderModes();
  renderMeta(note);
}

function render() {
  applyTranslations();
  renderFormatBars();
  $('new').replaceChildren(createIcon('plus', { size: '1.1rem' }), ` ${t('nt.new')}`);
  shell.setUsage(premium() ? '' : t('nt.usage', { count: notes.length, limit: FREE_LIMIT }));
  renderViews();
  renderTags();
  renderList();
  renderEditor();
}

// --- Actions ---
async function select(id) {
  await flush();
  selectedId = id;
  mode = 'edit';
  renderList();
  renderEditor();
}

async function createNote() {
  await flush();
  if (atLimit(notes.length, premium())) { shell.showLimit(); return; }
  view = 'notes';
  saving++;
  let stored;
  try { stored = await saveItem(SLUG, newNote()); } finally { saving--; }
  notes.push(stored);
  selectedId = stored.id;
  mode = 'edit';
  render();
  $('title').focus();
}

$('new').addEventListener('click', createNote);
$('search').addEventListener('input', (e) => { query = e.target.value; renderList(); });
$('list').addEventListener('click', (e) => {
  const item = e.target.closest('.nt-item');
  if (item) select(item.dataset.id);
});
$('views').addEventListener('click', async (e) => {
  const b = e.target.closest('.nt-chip');
  if (!b) return;
  await flush();
  view = b.dataset.view;
  tagFilter = null;
  if (selected() && !!selected().archived !== (view === 'archive')) selectedId = null;
  render();
});
$('tags').addEventListener('click', (e) => {
  const b = e.target.closest('.nt-chip');
  if (!b) return;
  tagFilter = tagFilter === b.dataset.tag ? null : b.dataset.tag;
  renderTags();
  renderList();
});
$('back').addEventListener('click', async () => { await flush(); selectedId = null; renderList(); renderEditor(); });

$('title').addEventListener('input', (e) => { const n = selected(); if (n) { n.title = e.target.value; touch(n); } });
$('body').addEventListener('input', (e) => { const n = selected(); if (n) { n.body = e.target.value; touch(n); } });
$('modes').addEventListener('click', (e) => {
  const b = e.target.closest('.nt-chip');
  if (!b) return;
  mode = b.dataset.mode;
  renderModes();
});
$('colors').addEventListener('click', async (e) => {
  const b = e.target.closest('.nt-color');
  const note = selected();
  if (!b || !note) return;
  note.color = b.dataset.color || null;
  $('editor').dataset.color = note.color ?? '';
  renderColors(note);
  touch(note);
});

function addTag(raw) {
  const note = selected();
  const tag = normalizeTag(raw);
  if (!note || !tag || note.tags.includes(tag)) return;
  note.tags.push(tag);
  renderNoteTags(note);
  renderTags();
  touch(note);
}
$('tag-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(e.target.value);
    e.target.value = '';
  } else if (e.key === 'Backspace' && !e.target.value) {
    const note = selected();
    if (note?.tags.length) { note.tags.pop(); renderNoteTags(note); renderTags(); touch(note); }
  }
});
$('tag-input').addEventListener('change', (e) => { addTag(e.target.value); e.target.value = ''; });
$('tag-input').addEventListener('blur', (e) => { addTag(e.target.value); e.target.value = ''; });
$('note-tags').addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove-tag]');
  const note = selected();
  if (!b || !note) return;
  note.tags = note.tags.filter((tag) => tag !== b.dataset.removeTag);
  renderNoteTags(note);
  renderTags();
  touch(note);
});

$('pin').addEventListener('click', () => {
  const note = selected();
  if (!note) return;
  note.pinned = !note.pinned;
  renderTools(note);
  touch(note);
});
$('archive').addEventListener('click', async () => {
  const note = selected();
  if (!note) return;
  note.archived = !note.archived;
  note.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = undefined;
  await persist(note);
  selectedId = null;
  render();
});
$('delete').addEventListener('click', async () => {
  const note = selected();
  if (!note) return;
  const btn = $('delete');
  if (!btn.classList.contains('is-armed')) {
    btn.classList.add('is-armed');
    btn.title = t('nt.confirmDelete');
    btn.setAttribute('aria-label', t('nt.confirmDelete'));
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => { if (selected()) renderTools(selected()); }, 3000);
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = undefined;
  saving++;
  try { await deleteItem(SLUG, note.id); } finally { saving--; }
  notes = notes.filter((n) => n.id !== note.id);
  selectedId = null;
  render();
});

// Data changed elsewhere (import, cloud restore): reload, keep the open note if it still exists
document.addEventListener('ow:datachange', async (e) => {
  if (e.detail?.tool !== SLUG || saving) return;
  await load();
  render();
});
addEventListener('pagehide', () => { flush(); });

onLangChange(render);
await load();
render();
