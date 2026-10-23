import { isPremiumUnlocked } from '../../../core/license.js';
import { saveItem, getAllItems, updateItem, deleteItem } from '../../../core/storage.js';
import { registerMessages, t, getLang, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import { createIcon } from '../../../core/icons.js';
import { showToast } from '../../../core/ui-components.js';
import { mountRichEditor } from '../../../core/rich-editor.js';
import { COLORS, FREE_LIMIT, newNote, displayTitle, snippet, normalizeTag, tagCounts, visibleNotes, atLimit } from './notes.js';
import { sendToTool } from '../../../core/handoff.js';
import { hasText, noteFile } from './export.js';
import { extractTasks, checklistTitle, createChecklistFromNote, CHECKLISTS } from './tasks.js';
import { FREE_LIMIT as CHECKLIST_LIMIT } from '../../checklists/src/checklists.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'notes';
const SAVE_DELAY = 400;
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: render });

const editor = mountRichEditor({
  body: $('body'),
  bar: $('fmt'),
  float: $('float'),
  onInput(markdown) {
    const n = selected();
    if (!n) return;
    n.body = markdown;
    touch(n);
    renderConvert(n);
  },
});

let notes = [];
let selectedId = null;
let view = 'notes';
let tagFilter = null;
let query = '';
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
  $('tags').replaceChildren(...counts.map(([tag, n]) => chip(`${tag} (${n})`, tag === tagFilter, { tag })));
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

function renderMeta(note) {
  $('meta').textContent = t('nt.updated', { date: dateFmt().format(note.updated) });
}

// --- Tasks to checklist ---
/** The button shows only while the open note contains at least one task. */
function renderConvert(note) {
  $('convert').hidden = !note || !extractTasks(note.body).length;
  $('export').hidden = !hasText(note);
}

/** Opens the Converter with this note as a Markdown file, set to the wanted format. */
async function sendNote(target) {
  await flush();
  const note = selected();
  if (!note || !hasText(note)) return;
  if (!(await sendToTool('converter', [noteFile(note, t('nt.untitled'))], { target }))) showToast(t('core.handoff.failed'));
}
$('to-pdf').addEventListener('click', () => sendNote('pdf'));
$('to-word').addEventListener('click', () => sendNote('docx'));

function openDialog({ title, text, actions }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'ow-dialog';
  dialog.setAttribute('aria-labelledby', 'nt-dialog-title');
  const h = document.createElement('h2');
  h.id = 'nt-dialog-title';
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = text;
  const bar = document.createElement('div');
  bar.className = 'ow-dialog__actions';
  const result = new Promise((resolve) => {
    for (const [label, value, primary] of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'ow-btn' : 'ow-btn ow-btn--secondary';
      b.textContent = label;
      b.addEventListener('click', () => { dialog.dataset.result = value; dialog.close(); });
      bar.append(b);
    }
    dialog.addEventListener('close', () => { const v = dialog.dataset.result ?? null; dialog.remove(); resolve(v); });
  });
  dialog.append(h, p, bar);
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector('.ow-btn:last-child').focus();
  return result;
}

const checklistsUrl = (id) => `../checklists/${id ? `?list=${encodeURIComponent(id)}` : ''}`;

async function convertToChecklist() {
  await flush();
  const note = selected();
  if (!note) return;
  const tasks = extractTasks(note.body);
  if (!tasks.length) { renderConvert(note); return; }
  const checklistsPremium = isPremiumUnlocked(CHECKLISTS);
  const fallbackTitle = t('nt.toChecklist.fallback');
  const title = checklistTitle(note, fallbackTitle);
  const done = tasks.filter((x) => x.done).length;
  try {
    const existing = (await getAllItems(CHECKLISTS)).length;
    if (!checklistsPremium && existing >= CHECKLIST_LIMIT) {
      const open = await openDialog({
        title: t('nt.toChecklist.limitTitle'),
        text: t('nt.toChecklist.limitText', { limit: CHECKLIST_LIMIT }),
        actions: [[t('nt.toChecklist.cancel'), 'cancel'], [t('nt.toChecklist.openChecklists'), 'open', true]],
      });
      if (open === 'open') location.href = checklistsUrl();
      return;
    }
    const ok = await openDialog({
      title: t('nt.toChecklist.title'),
      text: t(tasks.length === 1 ? 'nt.toChecklist.text.one' : 'nt.toChecklist.text', { title, count: tasks.length, done }),
      actions: [[t('nt.toChecklist.cancel'), 'cancel'], [t('nt.toChecklist.create'), 'create', true]],
    });
    if (ok !== 'create') return;
    const result = await createChecklistFromNote(note, { premium: checklistsPremium, fallbackTitle });
    if (result.status !== 'created') { showToast(t('nt.toChecklist.failed')); return; }
    location.href = checklistsUrl(result.list.id);
  } catch {
    showToast(t('nt.toChecklist.failed'));
  }
}
$('to-checklist').addEventListener('click', convertToChecklist);

function renderEditor() {
  const note = selected();
  $('app').classList.toggle('is-editing', !!note);
  $('form').hidden = !note;
  renderConvert(note);
  $('placeholder').hidden = !!note;
  if (!note) return;
  $('title').value = note.title;
  editor.setMarkdown(note.body);
  $('editor').dataset.color = note.color ?? '';
  renderTools(note);
  renderColors(note);
  renderNoteTags(note);
  renderMeta(note);
}

function render() {
  applyTranslations();
  editor.renderBars();
  $('new').replaceChildren(createIcon('plus', { size: '1.1rem' }), ` ${t('nt.new')}`);
  $('to-pdf').replaceChildren(createIcon('arrow-right', { size: '1.05rem' }), ` ${t('nt.toPdf')}`);
  $('to-word').replaceChildren(createIcon('arrow-right', { size: '1.05rem' }), ` ${t('nt.toWord')}`);
  $('to-checklist').replaceChildren(createIcon('check-circle', { size: '1.05rem' }), ` ${t('nt.toChecklist')}`);
  shell.setPremiumLimit(t('nt.limitLabel', { limit: FREE_LIMIT }), t('nt.usage', { count: notes.length, limit: FREE_LIMIT }));
  renderViews();
  renderTags();
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

async function createNote() {
  await flush();
  if (atLimit(notes.length, premium())) { shell.showLimit(); return; }
  view = 'notes';
  saving++;
  let stored;
  try { stored = await saveItem(SLUG, newNote()); } finally { saving--; }
  notes.push(stored);
  selectedId = stored.id;
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
