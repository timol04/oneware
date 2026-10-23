import { isPremiumUnlocked } from '../../../core/license.js';
import { saveItem, getAllItems, updateItem, deleteItem } from '../../../core/storage.js';
import { registerMessages, t, getLang, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import { createIcon } from '../../../core/icons.js';
import { monthsChart, categoryChart, priceList } from './charts.js';
import {
  CYCLES, CATEGORIES, CURRENCIES, newSub, todayISO, isISODate, parsePrice, currentPrice, nextCharge, daysBetween,
  applyPrice, applyStart, normalizeUrl, setStatus, totals, dueWithin, monthlySeries, byCategory, priceChanges, visibleSubs, upcoming, isActive,
} from './subs.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'abo-tracker';
const CURRENCY_KEY = `${SLUG}:currency`;
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: render });

let subs = [];
let view = 'active';
let editing = null; // the subscription open in the sheet; null for a new one
let currency = readCurrency();
let saving = 0;
let deleteTimer;

const premium = () => isPremiumUnlocked(SLUG);

function readCurrency() {
  try { const c = localStorage.getItem(CURRENCY_KEY); if (CURRENCIES.includes(c)) return c; } catch { /* storage blocked: use the default */ }
  return CURRENCIES[0];
}

const money = (n) => new Intl.NumberFormat(getLang(), { style: 'currency', currency }).format(n);
const dateFmt = () => new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDate = (iso) => dateFmt().format(new Date(`${iso}T12:00:00`));

function when(iso, today) {
  const n = daysBetween(today, iso);
  if (n === 0) return t('ab.today');
  if (n === 1) return t('ab.tomorrow');
  return n <= 30 ? t('ab.inDays', { n }) : fmtDate(iso);
}

function chip(label, pressed, attrs = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ab-chip';
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

// --- Storage ---
async function load() {
  subs = await getAllItems(SLUG);
}

async function persist(sub) {
  saving++;
  try { await updateItem(SLUG, sub.id, sub); } finally { saving--; }
}

// --- Rendering ---
function renderSummary(today) {
  const sum = totals(subs, today);
  const stats = [
    ['ab.perMonth', money(sum.monthly), true],
    ['ab.perYear', money(sum.yearly), false],
    ['ab.activeCount', String(sum.active), false],
  ];
  $('stats').replaceChildren(...stats.map(([key, value, main]) => {
    const box = document.createElement('div');
    box.className = `ab-stat${main ? ' ab-stat--main' : ''}`;
    const dt = document.createElement('dt');
    dt.textContent = t(key);
    const dd = document.createElement('dd');
    dd.textContent = value;
    box.append(dt, dd);
    return box;
  }));
  const due = dueWithin(subs, today, 30);
  $('due').textContent = sum.active ? `${t('ab.dueSoon')}: ${money(due)}` : '';
}

function renderViews() {
  const off = subs.filter((s) => !isActive(s)).length;
  $('views').replaceChildren(
    chip(t('ab.view.active'), view === 'active', { view: 'active' }),
    chip(`${t('ab.view.inactive')}${off ? ` (${off})` : ''}`, view === 'inactive', { view: 'inactive' }),
  );
}

function renderList(today) {
  const shown = view === 'active'
    ? upcoming(subs, today).map((u) => u.sub)
    : visibleSubs(subs, 'inactive').sort((a, b) => b.updated - a.updated);
  $('list').replaceChildren(...shown.map((sub) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ab-item${isActive(sub) ? '' : ' ab-item--off'}`;
    b.dataset.id = sub.id;
    const price = currentPrice(sub, today);
    let meta = `${t(`ab.cat.${sub.category}`)} · ${t(`ab.every.${sub.cycle}`)}`;
    let whenText = '';
    let soon = false;
    if (isActive(sub)) {
      const next = nextCharge(sub, today);
      whenText = `${t('ab.next')}: ${when(next.date, today)}`;
      soon = daysBetween(today, next.date) <= 3;
    } else {
      whenText = t(`ab.status.${sub.status}`);
    }
    const when$ = span('ab-item__when', whenText);
    when$.dataset.soon = String(soon);
    b.append(span('ab-item__name', sub.name || t('ab.untitled')), span('ab-item__price', money(price)), span('ab-item__meta', meta), when$);
    li.append(b);
    if (sub.url) {
      const a = document.createElement('a');
      a.className = 'ab-item__link';
      a.href = sub.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = t('ab.form.openUrl');
      a.setAttribute('aria-label', `${t('ab.form.openUrl')}: ${sub.name}`);
      a.append(createIcon('link', { size: '1.1rem' }));
      li.append(a);
      li.classList.add('ab-row');
    }
    return li;
  }));
  const empty = $('empty');
  empty.hidden = shown.length > 0;
  if (!shown.length) empty.textContent = t(view === 'active' ? 'ab.empty' : 'ab.emptyInactive');
}

function block(title, hint, content) {
  const wrap = document.createElement('div');
  wrap.className = 'ab-block';
  const h = document.createElement('h3');
  h.textContent = title;
  const p = document.createElement('p');
  p.className = 'ab-block__hint ow-muted';
  p.textContent = hint;
  wrap.append(h, p, content);
  return wrap;
}

function renderAnalysis(today) {
  const body = $('analysis-body');
  if (!premium()) {
    const box = document.createElement('div');
    box.className = 'ab-locked';
    const icon = createIcon('lock', { size: '1.6rem' });
    const text = document.createElement('p');
    text.textContent = t('ab.locked');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ow-btn';
    btn.textContent = t('ab.unlock');
    btn.addEventListener('click', () => shell.openLicense('buy'));
    box.append(icon, text, btn);
    body.replaceChildren(box);
    return;
  }
  const changes = priceChanges(subs, today);
  const cats = byCategory(subs, today);
  body.replaceChildren(
    block(t('ab.chart.months'), t('ab.chart.monthsHint'), monthsChart(monthlySeries(subs, today), money)),
    block(t('ab.chart.categories'), t('ab.chart.categoriesHint'), cats.length ? categoryChart(cats, money) : Object.assign(document.createElement('p'), { className: 'ow-muted', textContent: t('ab.chart.noData') })),
    block(t('ab.chart.prices'), t('ab.chart.pricesHint'), changes.length ? priceList(changes, money) : Object.assign(document.createElement('p'), { className: 'ow-muted', textContent: t('ab.chart.noPrices') })),
  );
}

function renderCurrency() {
  $('currency').replaceChildren(...CURRENCIES.map((c) => new Option(c, c, false, c === currency)));
}

function render() {
  const today = todayISO();
  applyTranslations();
  $('add').replaceChildren(createIcon('plus', { size: '1.1rem' }), ` ${t('ab.add')}`);
  $('currency').title = t('ab.currency');
  renderCurrency();
  shell.setUsage('');
  renderSummary(today);
  renderViews();
  renderList(today);
  renderAnalysis(today);
}

// --- Sheet (add / edit) ---
const sheet = $('sheet');
const FIELD_ERRORS = ['name', 'price', 'start', 'url'];

function fillSelects() {
  $('f-cycle').replaceChildren(...CYCLES.map((c) => new Option(t(`ab.cycle.${c}`), c)));
  $('f-cat').replaceChildren(...CATEGORIES.map((c) => new Option(t(`ab.cat.${c}`), c)));
}

function showError(field, key) {
  const e = $(`e-${field}`);
  e.hidden = !key;
  e.textContent = key ? t(key) : '';
  $(`f-${field}`).classList.toggle('ow-input--error', !!key);
}

function renderStateActions() {
  const box = $('state-actions');
  box.hidden = !editing;
  if (!editing) return;
  const running = isActive(editing);
  const pause = $('toggle-pause');
  pause.replaceChildren(createIcon(running ? 'pause' : 'play', { size: '1rem' }), ` ${t(running ? 'ab.form.pause' : 'ab.form.resume')}`);
  const end = $('cancel-sub');
  end.textContent = t('ab.form.endSub');
  end.hidden = editing.status === 'cancelled';
}

function updateOpenLink() {
  const link = $('open-url');
  const qr = $('qr-url');
  const url = normalizeUrl($('f-url').value);
  link.hidden = !url;
  qr.hidden = !url;
  if (!url) return;
  qr.href = `../qr-pro-studio/?url=${encodeURIComponent(url)}`;
  qr.replaceChildren(createIcon('grid', { size: '1rem' }), ` ${t('ab.form.qr')}`);
  link.href = url;
  link.replaceChildren(createIcon('link', { size: '1rem' }), ` ${t('ab.form.openUrl')}`);
}

function resetDelete() {
  const btn = $('delete');
  clearTimeout(deleteTimer);
  btn.classList.remove('is-armed');
  btn.textContent = t('ab.form.delete');
}

function openSheet(sub) {
  editing = sub;
  const draft = sub ?? newSub();
  fillSelects();
  $('sheet-title').textContent = t(sub ? 'ab.form.edit' : 'ab.form.add');
  $('close').replaceChildren(createIcon('x', { size: '1.1rem' }));
  $('close').title = t('ab.form.cancel');
  $('close').setAttribute('aria-label', t('ab.form.cancel'));
  $('f-name').value = draft.name;
  $('f-price').value = sub ? String(currentPrice(sub, todayISO())).replace('.', getLang() === 'de' ? ',' : '.') : '';
  $('f-cycle').value = draft.cycle;
  $('f-cat').value = draft.category;
  $('f-start').value = draft.start;
  $('f-note').value = draft.note;
  $('f-url').value = draft.url ?? '';
  updateOpenLink();
  $('price-hint').hidden = !sub;
  for (const f of FIELD_ERRORS) showError(f, null);
  $('delete').hidden = !sub;
  resetDelete();
  renderStateActions();
  applyTranslations(sheet);
  sheet.showModal();
  if (!sub) $('f-name').focus();
}

async function submit(e) {
  e.preventDefault();
  const name = $('f-name').value.trim();
  const price = parsePrice($('f-price').value);
  const start = $('f-start').value;
  showError('name', name ? null : 'ab.error.name');
  showError('price', price === null ? 'ab.error.price' : null);
  showError('start', isISODate(start) ? null : 'ab.error.start');
  const url = normalizeUrl($('f-url').value);
  showError('url', url === null ? 'ab.error.url' : null);
  if (!name || price === null || !isISODate(start) || url === null) return;
  const today = todayISO();
  const sub = editing ?? newSub();
  sub.name = name;
  sub.cycle = $('f-cycle').value;
  sub.category = $('f-cat').value;
  sub.note = $('f-note').value.trim();
  sub.url = url;
  if (!editing) sub.prices = [{ from: start, price }];
  if (editing) applyPrice(sub, price, today);
  applyStart(sub, start);
  sub.updated = Date.now();
  saving++;
  try {
    if (editing) await updateItem(SLUG, sub.id, sub);
    else { const stored = await saveItem(SLUG, sub); subs.push(stored); }
  } finally { saving--; }
  view = isActive(sub) ? 'active' : view;
  sheet.close();
  render();
}

async function changeStatus(status) {
  if (!editing) return;
  setStatus(editing, status, todayISO());
  editing.updated = Date.now();
  await persist(editing);
  sheet.close();
  view = isActive(editing) ? 'active' : 'inactive';
  render();
}

$('add').addEventListener('click', () => openSheet(null));
$('form').addEventListener('submit', submit);
$('close').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
sheet.addEventListener('close', () => { editing = null; resetDelete(); });
$('f-url').addEventListener('input', updateOpenLink);
$('toggle-pause').addEventListener('click', () => changeStatus(isActive(editing) ? 'paused' : 'active'));
$('cancel-sub').addEventListener('click', () => changeStatus('cancelled'));
$('delete').addEventListener('click', async () => {
  if (!editing) return;
  const btn = $('delete');
  if (!btn.classList.contains('is-armed')) {
    btn.classList.add('is-armed');
    btn.textContent = t('ab.form.confirmDelete');
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(resetDelete, 3000);
    return;
  }
  const { id } = editing;
  saving++;
  try { await deleteItem(SLUG, id); } finally { saving--; }
  subs = subs.filter((s) => s.id !== id);
  sheet.close();
  render();
});

$('list').addEventListener('click', (e) => {
  const item = e.target.closest('.ab-item');
  if (item) openSheet(subs.find((s) => s.id === item.dataset.id) ?? null);
});
$('views').addEventListener('click', (e) => {
  const b = e.target.closest('.ab-chip');
  if (!b) return;
  view = b.dataset.view;
  render();
});
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
