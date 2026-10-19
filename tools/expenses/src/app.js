import { isPremiumUnlocked } from '../../../core/license.js';
import { saveItem, getAllItems, updateItem, deleteItem } from '../../../core/storage.js';
import { registerMessages, t, getLang, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import { createIcon } from '../../../core/icons.js';
import { monthsChart, categoryChart } from './charts.js';
import {
  FREE_LIMIT, TYPES, CATEGORIES, CURRENCIES, newEntry, todayISO, isISODate, parseAmount, categoryFor, atLimit,
  monthOf, shiftMonth, listMonth, groupByDay, monthTotals, byCategory, monthlySeries, averages,
} from './expenses.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'expenses';
const CURRENCY_KEY = `${SLUG}:currency`;
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: render });

let entries = [];
let month = monthOf(todayISO());
let view = 'all';
let query = '';
let editing = null; // the booking open in the sheet; null for a new one
let formType = 'expense';
let currency = readCurrency();
let saving = 0;
let deleteTimer;

const premium = () => isPremiumUnlocked(SLUG);

function readCurrency() {
  try { const c = localStorage.getItem(CURRENCY_KEY); if (CURRENCIES.includes(c)) return c; } catch { /* storage blocked: use the default */ }
  return CURRENCIES[0];
}

const money = (n) => new Intl.NumberFormat(getLang(), { style: 'currency', currency }).format(n);
const at = (iso) => new Date(`${iso}T12:00:00`);
const dayFmt = () => new Intl.DateTimeFormat(getLang(), { weekday: 'long', day: 'numeric', month: 'long' });
const monthFmt = () => new Intl.DateTimeFormat(getLang(), { month: 'long', year: 'numeric' });
const catLabel = (c) => t(`ex.cat.${c}`);

function chip(label, pressed, attrs = {}, cls = 'ex-chip') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.setAttribute('aria-pressed', String(pressed));
  Object.assign(b.dataset, attrs);
  return b;
}

function span(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

const note = (key) => Object.assign(document.createElement('p'), { className: 'ow-muted', textContent: t(key) });

// --- Storage ---
async function load() {
  entries = await getAllItems(SLUG);
}

// --- Rendering ---
function renderSummary() {
  $('h-sum').textContent = monthFmt().format(at(`${month}-01`));
  for (const [id, key, delta] of [['prev', 'ex.prev', -1], ['next', 'ex.next', 1]]) {
    const b = $(id);
    b.replaceChildren(createIcon(delta < 0 ? 'arrow-left' : 'arrow-right', { size: '1.1rem' }));
    b.title = t(key);
    b.setAttribute('aria-label', t(key));
  }
  const sum = monthTotals(entries, month);
  const stats = [['ex.balance', sum.balance, true], ['ex.income', sum.income, false], ['ex.expenses', sum.expense, false]];
  $('stats').replaceChildren(...stats.map(([key, value, main]) => {
    const box = document.createElement('div');
    box.className = `ex-stat${main ? ' ex-stat--main' : ''}`;
    const dt = document.createElement('dt');
    dt.textContent = t(key);
    const dd = document.createElement('dd');
    dd.textContent = money(value);
    if (main && value < 0) dd.dataset.neg = 'true';
    box.append(dt, dd);
    return box;
  }));
}

function renderViews() {
  $('views').replaceChildren(...['all', 'expense', 'income'].map((v) => chip(t(`ex.view.${v}`), view === v, { view: v })));
}

function renderList() {
  const shown = listMonth(entries, month, { type: view, query, label: catLabel });
  const days = groupByDay(shown);
  $('list').replaceChildren(...days.map((day) => {
    const section = document.createElement('section');
    section.className = 'ex-day';
    const head = document.createElement('h3');
    head.className = 'ex-day__head';
    head.append(span('', dayFmt().format(at(day.date))), span('', money(day.net)));
    const ul = document.createElement('ul');
    ul.className = 'ex-list';
    for (const e of day.entries) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ex-item';
      b.dataset.id = e.id;
      const amount = span('ex-item__amount', `${e.type === 'income' ? '+' : '-'}${money(e.amount)}`);
      amount.dataset.type = e.type;
      b.append(span('ex-item__name', catLabel(e.category)), amount, span('ex-item__note', e.note || t('ex.untitled')));
      li.append(b);
      ul.append(li);
    }
    section.append(head, ul);
    return section;
  }));
  const empty = $('empty');
  empty.hidden = shown.length > 0;
  if (!shown.length) empty.textContent = t(entries.some((e) => monthOf(e.date) === month) ? 'ex.emptyFiltered' : 'ex.empty');
}

function block(title, hint, content) {
  const wrap = document.createElement('div');
  wrap.className = 'ex-block';
  const h = document.createElement('h3');
  h.textContent = title;
  const p = document.createElement('p');
  p.className = 'ex-block__hint ow-muted';
  p.textContent = hint;
  wrap.append(h, p, content);
  return wrap;
}

function renderCategories() {
  const rows = byCategory(entries, [month], 'expense');
  $('cats-body').replaceChildren(rows.length ? categoryChart(rows, money) : note('ex.categoriesNone'));
}

function renderAnalysis() {
  const body = $('analysis-body');
  if (!premium()) {
    const box = document.createElement('div');
    box.className = 'ex-locked';
    const text = document.createElement('p');
    text.textContent = t('ex.locked');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ow-btn';
    btn.textContent = t('ex.unlock');
    btn.addEventListener('click', () => shell.openLicense('buy'));
    box.append(createIcon('lock', { size: '1.6rem' }), text, btn);
    body.replaceChildren(box);
    return;
  }
  const series = monthlySeries(entries, month);
  const year = byCategory(entries, series.map((m) => m.month), 'expense');
  body.replaceChildren(
    block(t('ex.chart.months'), t('ex.chart.monthsHint'), monthsChart(series, averages(series), money)),
    block(t('ex.chart.categories'), t('ex.chart.categoriesHint'), year.length ? categoryChart(year, money) : note('ex.chart.noData')),
  );
}

function render() {
  applyTranslations();
  $('add').replaceChildren(createIcon('plus', { size: '1.1rem' }), ` ${t('ex.add')}`);
  $('currency').title = t('ex.currency');
  $('currency').replaceChildren(...CURRENCIES.map((c) => new Option(c, c, false, c === currency)));
  shell.setPremiumLimit(t('ex.limitLabel', { limit: FREE_LIMIT }), t('ex.usage', { count: entries.length, limit: FREE_LIMIT }));
  renderSummary();
  renderViews();
  renderList();
  renderCategories();
  renderAnalysis();
}

// --- Sheet (add / edit) ---
const sheet = $('sheet');

function showError(field, key) {
  const e = $(`e-${field}`);
  e.hidden = !key;
  e.textContent = key ? t(key) : '';
  $(`f-${field}`).classList.toggle('ow-input--error', !!key);
}

function setFormType(type, category) {
  formType = type;
  $('f-type').replaceChildren(...TYPES.map((v) => chip(t(`ex.type.${v}`), v === type, { type: v })));
  $('f-cat').replaceChildren(...CATEGORIES[type].map((c) => new Option(catLabel(c), c)));
  $('f-cat').value = categoryFor(type, category ?? $('f-cat').value);
}

function resetDelete() {
  const btn = $('delete');
  clearTimeout(deleteTimer);
  btn.classList.remove('is-armed');
  btn.textContent = t('ex.form.delete');
}

function openSheet(entry) {
  editing = entry;
  const draft = entry ?? newEntry();
  // A new booking defaults to the viewed month so it shows up in the list right away.
  if (!entry && monthOf(draft.date) !== month) draft.date = `${month}-01`;
  $('sheet-title').textContent = t(entry ? 'ex.form.edit' : 'ex.form.add');
  $('close').replaceChildren(createIcon('x', { size: '1.1rem' }));
  $('close').title = t('ex.form.cancel');
  $('close').setAttribute('aria-label', t('ex.form.cancel'));
  setFormType(draft.type, draft.category);
  $('f-amount').value = entry ? String(entry.amount).replace('.', getLang() === 'de' ? ',' : '.') : '';
  $('f-date').value = draft.date;
  $('f-note').value = draft.note;
  for (const f of ['amount', 'date']) showError(f, null);
  $('delete').hidden = !entry;
  resetDelete();
  applyTranslations(sheet);
  sheet.showModal();
  if (!entry) $('f-amount').focus();
}

async function submit(e) {
  e.preventDefault();
  const amount = parseAmount($('f-amount').value);
  const date = $('f-date').value;
  showError('amount', amount === null ? 'ex.error.amount' : null);
  showError('date', isISODate(date) ? null : 'ex.error.date');
  if (amount === null || !isISODate(date)) return;
  const entry = editing ?? newEntry();
  entry.type = formType;
  entry.amount = amount;
  entry.date = date;
  entry.category = $('f-cat').value;
  entry.note = $('f-note').value.trim();
  entry.updated = Date.now();
  saving++;
  try {
    if (editing) await updateItem(SLUG, entry.id, entry);
    else { const stored = await saveItem(SLUG, entry); entries.push(stored); }
  } finally { saving--; }
  month = monthOf(date);
  sheet.close();
  render();
}

$('add').addEventListener('click', () => {
  if (atLimit(entries.length, premium())) { shell.showLimit(); return; }
  openSheet(null);
});
$('form').addEventListener('submit', submit);
$('close').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
sheet.addEventListener('close', () => { editing = null; resetDelete(); });
$('f-type').addEventListener('click', (e) => {
  const b = e.target.closest('.ex-chip');
  if (b) setFormType(b.dataset.type);
});
$('delete').addEventListener('click', async () => {
  if (!editing) return;
  const btn = $('delete');
  if (!btn.classList.contains('is-armed')) {
    btn.classList.add('is-armed');
    btn.textContent = t('ex.form.confirmDelete');
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(resetDelete, 3000);
    return;
  }
  const { id } = editing;
  saving++;
  try { await deleteItem(SLUG, id); } finally { saving--; }
  entries = entries.filter((x) => x.id !== id);
  shell.clearLimit();
  sheet.close();
  render();
});

$('list').addEventListener('click', (e) => {
  const item = e.target.closest('.ex-item');
  if (item) openSheet(entries.find((x) => x.id === item.dataset.id) ?? null);
});
$('views').addEventListener('click', (e) => {
  const b = e.target.closest('.ex-chip');
  if (!b) return;
  view = b.dataset.view;
  render();
});
$('search').addEventListener('input', (e) => { query = e.target.value; renderList(); });
$('prev').addEventListener('click', () => { month = shiftMonth(month, -1); render(); });
$('next').addEventListener('click', () => { month = shiftMonth(month, 1); render(); });
$('currency').addEventListener('change', (e) => {
  currency = e.target.value;
  try { localStorage.setItem(CURRENCY_KEY, currency); } catch { /* storage blocked: keep it for this visit */ }
  render();
});

// Data changed elsewhere (import, cloud restore): reload
document.addEventListener('ow:datachange', async (e) => {
  if (e.detail?.tool !== SLUG || saving) return;
  await load();
  render();
});

onLangChange(() => { if (sheet.open) sheet.close(); render(); });
await load();
render();
