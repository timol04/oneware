import { isPremiumUnlocked } from '../../../core/license.js';
import { saveItem, getAllItems, updateItem, deleteItem } from '../../../core/storage.js';
import { registerMessages, t, getLang, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import { createIcon } from '../../../core/icons.js';
import {
  FREE_LIMIT, SCHEDULES, PAUSE_DAYS, ALL_DAYS, newHabit, isoDate, parseDay, addDays, isDue, isPaused, activePause,
  toggleDay, setNote, weekCount, streaks, rate30, totalDone, pauseFor, resume, monthGrid, dayState, visibleHabits,
  displayTitle, atLimit,
} from './habits.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'habits';
const SAVE_DELAY = 400;
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: render });

let habits = [];
let selectedId = null;
let selectedDay = isoDate();
let month = { y: new Date().getFullYear(), m: new Date().getMonth() };
let view = 'today';
let query = '';
let saving = 0;
let saveTimer;
let deleteTimer;

const selected = () => habits.find((h) => h.id === selectedId) ?? null;
const premium = () => isPremiumUnlocked(SLUG);
const today = () => isoDate();

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

function iconButton(btn, icon, label, rotate) {
  const svg = createIcon(icon, { size: '1.15rem' });
  if (rotate) svg.style.transform = `rotate(${rotate}deg)`;
  btn.replaceChildren(svg);
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

// --- Storage ---
async function load() {
  habits = await getAllItems(SLUG);
  for (const h of habits) {
    h.done ??= {};
    h.notes ??= {};
    h.pauses ??= [];
    h.schedule ??= newHabit().schedule;
  }
  if (selectedId && !selected()) selectedId = null;
}

async function persist(habit) {
  saving++;
  try { await updateItem(SLUG, habit.id, habit); } finally { saving--; }
}

/** Saves the open habit after a short pause and refreshes everything that depends on it. */
function touch(habit) {
  habit.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(habit), SAVE_DELAY);
  renderList();
  if (habit.id === selectedId) { renderStats(habit); renderPause(habit); renderCal(habit); renderDay(habit); }
}

async function flush() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const habit = selected();
  if (habit) await persist(habit);
}

// --- Formatting ---
const dayFmt = () => new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'short' });
const longFmt = () => new Intl.DateTimeFormat(getLang(), { weekday: 'long', day: 'numeric', month: 'long' });
const formatDay = (iso) => dayFmt().format(parseDay(iso));
const unitText = (unit, count) => t(`hb.unit.${unit}${count === 1 ? '' : 's'}`, { count });
const weekdayName = (i, style) => new Intl.DateTimeFormat(getLang(), { weekday: style }).format(new Date(2024, 0, 1 + i));

// --- List ---
function renderViews() {
  const chip = (label, v) => el('button', 'hb-chip', { type: 'button', text: label, 'aria-pressed': String(view === v), 'data-view': v });
  $('views').replaceChildren(chip(t('hb.view.today'), 'today'), chip(t('hb.view.all'), 'all'), chip(t('hb.view.archive'), 'archive'));
}

function subline(h, now) {
  const sub = el('span', 'hb-card__sub');
  const pause = activePause(h, now);
  if (pause) { sub.append(createIcon('pause', { size: '.85rem' }), t('hb.sub.paused', { date: formatDay(addDays(pause.to, 1)) })); return sub; }
  if (h.schedule.type === 'weekly') {
    sub.append(createIcon('repeat', { size: '.85rem' }), t('hb.sub.week', { done: weekCount(h, now), goal: h.schedule.perWeek }));
    return sub;
  }
  const { current, unit } = streaks(h, now);
  if (current) sub.append(createIcon('flame', { size: '.85rem' }), t('hb.sub.streak', { count: unitText(unit, current) }));
  else sub.append(t('hb.sub.none'));
  return sub;
}

function card(h, now) {
  const done = !!h.done[now];
  const paused = isPaused(h, now);
  const row = el('div', `hb-card${isDue(h, now) || h.archived ? '' : ' is-muted'}`, { 'data-id': h.id, 'aria-current': String(h.id === selectedId) });
  const check = el('button', 'hb-check', {
    type: 'button', 'aria-pressed': String(done), 'aria-label': t('hb.check'), title: t('hb.check'), disabled: paused || !!h.archived,
  });
  check.append(createIcon('check', { size: '1rem' }), el('span', '', { text: t(done ? 'hb.checked' : 'hb.unchecked') }));
  const main = el('button', 'hb-main', { type: 'button' });
  main.append(el('span', 'hb-card__title', { text: displayTitle(h) || t('hb.untitled') }), subline(h, now));
  row.append(main, check);
  return row;
}

function renderList() {
  const now = today();
  const shown = visibleHabits(habits, { view, query });
  const nodes = [];
  if (view === 'today') {
    const due = shown.filter((h) => isDue(h, now));
    const other = shown.filter((h) => !isDue(h, now));
    if (due.length && other.length) nodes.push(el('p', 'hb-group-title', { text: t('hb.group.due') }));
    nodes.push(...due.map((h) => card(h, now)));
    if (other.length) {
      if (due.length) nodes.push(el('p', 'hb-group-title', { text: t('hb.group.other') }));
      nodes.push(...other.map((h) => card(h, now)));
    }
    const doneCount = due.filter((h) => h.done[now]).length;
    const percent = due.length ? Math.round((doneCount / due.length) * 100) : 0;
    $('today').hidden = !due.length;
    $('today-fill').style.width = `${percent}%`;
    $('today-meter').setAttribute('aria-valuenow', String(percent));
    $('today-text').textContent = t('hb.todayProgress', { done: doneCount, total: due.length });
    $('today-meter').setAttribute('aria-label', $('today-text').textContent);
  } else {
    $('today').hidden = true;
    nodes.push(...shown.map((h) => card(h, now)));
  }
  $('list').replaceChildren(...nodes);
  const empty = $('empty');
  const anyDue = shown.some((h) => isDue(h, now));
  empty.hidden = shown.length > 0 && (view !== 'today' || anyDue);
  if (!empty.hidden) {
    empty.textContent = t(!shown.length ? (query ? 'hb.noMatch' : view === 'archive' ? 'hb.emptyArchive' : 'hb.empty') : 'hb.emptyToday');
  }
}

// --- Editor ---
function renderTools(h) {
  iconButton($('archive'), 'archive', t(h.archived ? 'hb.unarchive' : 'hb.archive'));
  iconButton($('delete'), 'trash', t('hb.delete'));
  $('delete').classList.remove('is-armed');
  $('back').replaceChildren(createIcon('arrow-left', { size: '1rem' }), ` ${t('hb.back')}`);
  iconButton($('prev'), 'chevron-down', t('hb.prev'), 90);
  iconButton($('next'), 'chevron-down', t('hb.next'), -90);
}

function stat(label, ...content) {
  const wrap = el('div', 'hb-stat');
  const dd = el('dd');
  dd.append(...content);
  wrap.append(el('dt', '', { text: label }), dd);
  return wrap;
}

function renderStats(h) {
  const now = today();
  const { current, best, unit } = streaks(h, now);
  const none = t('hb.stat.none');
  const rate = rate30(h, now);
  const streakValue = (n, icon) => (n ? [...(icon ? [createIcon('flame', { size: '1.1rem' })] : []), unitText(unit, n)] : [none]);
  $('stats').replaceChildren(
    stat(t('hb.stat.current'), ...streakValue(current, true)),
    stat(t('hb.stat.best'), ...streakValue(best, false)),
    stat(t('hb.stat.rate'), rate === null ? '–' : `${Math.round(rate * 100)}%`),
    stat(t('hb.stat.total'), String(totalDone(h))),
  );
}

function renderSchedule(h) {
  const s = h.schedule;
  const type = $('sched-type');
  type.replaceChildren(...SCHEDULES.map((v) => new Option(t(`hb.schedule.${v}`), v)));
  type.value = s.type;
  const week = $('sched-week');
  week.replaceChildren(...[1, 2, 3, 4, 5, 6].map((n) => new Option(t('hb.perWeekOption', { count: n }), String(n))));
  week.value = String(s.perWeek);
  week.hidden = s.type !== 'weekly';
  const days = $('sched-days');
  days.hidden = s.type !== 'days';
  days.replaceChildren(...ALL_DAYS.map((i) => el('button', 'hb-chip', {
    type: 'button', text: weekdayName(i, 'short'), 'aria-pressed': String(s.days.includes(i)), 'data-day': String(i),
    title: weekdayName(i, 'long'),
  })));
}

function renderPause(h) {
  const now = today();
  const p = activePause(h, now);
  $('pause-text').textContent = p ? t('hb.pauseOn', { date: formatDay(addDays(p.to, 1)) }) : t('hb.pauseOff');
  $('pause-for').hidden = !!p;
  $('pause-btn').textContent = t(p ? 'hb.resumeBtn' : 'hb.pauseBtn');
}

function renderPauseOptions() {
  const sel = $('pause-for');
  const value = sel.value;
  sel.replaceChildren(...PAUSE_DAYS.map((d) => new Option(t('hb.pauseOption', { days: d }), String(d))));
  sel.value = value || String(PAUSE_DAYS[1]);
}

function renderCal(h) {
  const now = today();
  const label = new Intl.DateTimeFormat(getLang(), { month: 'long', year: 'numeric' }).format(new Date(month.y, month.m, 1));
  $('h-cal').textContent = label;
  const nodes = ALL_DAYS.map((i) => el('span', 'hb-cal__dow', { text: weekdayName(i, 'short'), 'aria-hidden': 'true' }));
  for (const week of monthGrid(month.y, month.m)) {
    for (const iso of week) {
      const d = parseDay(iso);
      const state = dayState(h, iso, now);
      const classes = ['hb-dayb'];
      if (d.getMonth() !== month.m) classes.push('is-outside');
      if (iso === now) classes.push('is-today');
      if (h.notes[iso]) classes.push('has-note');
      const b = el('button', classes.join(' '), {
        type: 'button', text: String(d.getDate()), 'data-day': iso, 'data-state': state, disabled: iso > now,
        'aria-label': `${longFmt().format(d)}${state === 'open' || state === 'off' ? '' : `, ${t(`hb.key.${state}`).toLowerCase()}`}`,
      });
      if (iso === selectedDay) b.setAttribute('aria-current', 'date');
      nodes.push(b);
    }
  }
  $('cal').replaceChildren(...nodes);
}

function renderDay(h) {
  const now = today();
  const future = selectedDay > now;
  $('h-day').textContent = longFmt().format(parseDay(selectedDay));
  const done = !!h.done[selectedDay];
  const btn = $('day-toggle');
  btn.setAttribute('aria-pressed', String(done));
  btn.replaceChildren(createIcon('check', { size: '1rem' }), ` ${t(done ? 'hb.dayDone' : 'hb.dayMark')}`);
  btn.disabled = future;
  const note = $('day-note');
  if (document.activeElement !== note) note.value = h.notes[selectedDay] ?? '';
  note.disabled = future;
}

function renderMeta(h) {
  $('meta').textContent = t('hb.created', { date: formatDay(isoDate(new Date(h.created))) });
}

function renderEditor() {
  const h = selected();
  $('app').classList.toggle('is-editing', !!h);
  $('form').hidden = !h;
  $('placeholder').hidden = !!h;
  if (!h) return;
  $('title').value = h.title;
  renderTools(h);
  renderStats(h);
  renderSchedule(h);
  renderPauseOptions();
  renderPause(h);
  renderCal(h);
  renderDay(h);
  renderMeta(h);
}

function render() {
  applyTranslations();
  $('new').replaceChildren(createIcon('plus', { size: '1.1rem' }), ` ${t('hb.new')}`);
  shell.setPremiumLimit(t('hb.limitLabel', { limit: FREE_LIMIT }), t('hb.usage', { count: habits.length, limit: FREE_LIMIT }));
  renderViews();
  renderList();
  renderEditor();
}

// --- Actions ---
function openDay(iso) {
  selectedDay = iso;
  const d = parseDay(iso);
  month = { y: d.getFullYear(), m: d.getMonth() };
}

async function select(id) {
  await flush();
  selectedId = id === selectedId ? null : id;
  openDay(today());
  renderList();
  renderEditor();
}

async function createHabit() {
  await flush();
  if (atLimit(habits.length, premium())) { shell.showLimit(); return; }
  view = view === 'archive' ? 'all' : view;
  saving++;
  let stored;
  try { stored = await saveItem(SLUG, newHabit()); } finally { saving--; }
  habits.push(stored);
  selectedId = stored.id;
  openDay(today());
  render();
  $('title').focus();
}

$('new').addEventListener('click', createHabit);
$('search').addEventListener('input', (e) => { query = e.target.value; renderList(); });

$('list').addEventListener('click', (e) => {
  const row = e.target.closest('.hb-card');
  if (!row) return;
  if (e.target.closest('.hb-check')) {
    const h = habits.find((x) => x.id === row.dataset.id);
    if (!h) return;
    toggleDay(h, today());
    if (h.id === selectedId) touch(h);
    else { h.updated = Date.now(); persist(h); renderList(); }
  } else select(row.dataset.id);
});

$('views').addEventListener('click', async (e) => {
  const b = e.target.closest('.hb-chip');
  if (!b) return;
  await flush();
  view = b.dataset.view;
  if (selected() && !!selected().archived !== (view === 'archive')) selectedId = null;
  render();
});

$('back').addEventListener('click', async () => { await flush(); selectedId = null; renderList(); renderEditor(); });
$('title').addEventListener('input', (e) => { const h = selected(); if (h) { h.title = e.target.value; touch(h); } });

// Schedule
$('sched-type').addEventListener('change', (e) => {
  const h = selected();
  if (!h) return;
  h.schedule.type = e.target.value;
  renderSchedule(h);
  touch(h);
});
$('sched-week').addEventListener('change', (e) => {
  const h = selected();
  if (!h) return;
  h.schedule.perWeek = Number(e.target.value);
  touch(h);
});
$('sched-days').addEventListener('click', (e) => {
  const h = selected();
  const b = e.target.closest('[data-day]');
  if (!h || !b) return;
  const i = Number(b.dataset.day);
  const on = h.schedule.days.includes(i);
  if (on && h.schedule.days.length === 1) return; // keep at least one weekday
  h.schedule.days = on ? h.schedule.days.filter((d) => d !== i) : [...h.schedule.days, i].sort();
  renderSchedule(h);
  touch(h);
});

// Pause
$('pause-btn').addEventListener('click', () => {
  const h = selected();
  if (!h) return;
  if (activePause(h, today())) resume(h); else pauseFor(h, Number($('pause-for').value));
  touch(h);
});

// Calendar and day
$('prev').addEventListener('click', () => { const d = new Date(month.y, month.m - 1, 1); month = { y: d.getFullYear(), m: d.getMonth() }; const h = selected(); if (h) renderCal(h); });
$('next').addEventListener('click', () => { const d = new Date(month.y, month.m + 1, 1); month = { y: d.getFullYear(), m: d.getMonth() }; const h = selected(); if (h) renderCal(h); });
$('cal').addEventListener('click', (e) => {
  const b = e.target.closest('.hb-dayb');
  const h = selected();
  if (!b || !h) return;
  selectedDay = b.dataset.day;
  $('day-note').blur();
  renderCal(h);
  renderDay(h);
});
$('day-toggle').addEventListener('click', () => {
  const h = selected();
  if (!h || selectedDay > today()) return;
  toggleDay(h, selectedDay);
  touch(h);
});
$('day-note').addEventListener('input', (e) => {
  const h = selected();
  if (!h || selectedDay > today()) return;
  setNote(h, selectedDay, e.target.value);
  touch(h);
});

$('archive').addEventListener('click', async () => {
  const h = selected();
  if (!h) return;
  h.archived = !h.archived;
  h.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = undefined;
  await persist(h);
  selectedId = null;
  render();
});
$('delete').addEventListener('click', async () => {
  const h = selected();
  if (!h) return;
  const btn = $('delete');
  if (!btn.classList.contains('is-armed')) {
    btn.classList.add('is-armed');
    btn.title = t('hb.confirmDelete');
    btn.setAttribute('aria-label', t('hb.confirmDelete'));
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => { if (selected()) renderTools(selected()); }, 3000);
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = undefined;
  saving++;
  try { await deleteItem(SLUG, h.id); } finally { saving--; }
  habits = habits.filter((x) => x.id !== h.id);
  selectedId = null;
  render();
});

// Data changed elsewhere (import, cloud restore): reload
document.addEventListener('ow:datachange', async (e) => {
  if (e.detail?.tool !== SLUG || saving) return;
  await load();
  render();
});
// A new day may have started while the page stayed open
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
addEventListener('pagehide', () => { flush(); });

onLangChange(render);
await load();
render();
