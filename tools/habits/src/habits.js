// Pure habit logic: schedules, streaks, pauses, rates, filtering. No DOM, no storage.
// Weekdays count from Monday (0) to Sunday (6). Dates are local YYYY-MM-DD strings.

export const FREE_LIMIT = 5;
export const SCHEDULES = ['daily', 'days', 'weekly'];
export const PAUSE_DAYS = [3, 7, 14, 30];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function newHabit(now = Date.now()) {
  return {
    title: '',
    schedule: { type: 'daily', days: [0, 1, 2, 3, 4], perWeek: 3 },
    done: {}, // 'YYYY-MM-DD' -> true
    notes: {}, // 'YYYY-MM-DD' -> text
    pauses: [], // [{ from, to }] inclusive
    archived: false,
    created: now,
    updated: now,
  };
}

/** Local date as YYYY-MM-DD. */
export function isoDate(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export const parseDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

export function addDays(iso, n) {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** 0 = Monday ... 6 = Sunday. */
export const weekday = (iso) => (parseDay(iso).getDay() + 6) % 7;

export const weekStart = (iso) => addDays(iso, -weekday(iso));

export const isPaused = (habit, iso) => habit.pauses.some((p) => p.from <= iso && iso <= p.to);

/** Whether the habit is planned on this day (weekly habits can be done on any day). */
export function isScheduled(habit, iso) {
  const s = habit.schedule;
  return s.type === 'days' ? s.days.includes(weekday(iso)) : true;
}

/** Shown in "Today": planned today and not paused. */
export const isDue = (habit, iso) => isScheduled(habit, iso) && !isPaused(habit, iso);

/** Checks or unchecks a day; returns whether it is done afterwards. */
export function toggleDay(habit, iso) {
  if (habit.done[iso]) { delete habit.done[iso]; return false; }
  habit.done[iso] = true;
  return true;
}

export function setNote(habit, iso, text) {
  if (text.trim()) habit.notes[iso] = text;
  else delete habit.notes[iso];
}

/** Done days within the week (Monday to Sunday) that contains `iso`. */
export function weekCount(habit, iso) {
  const start = weekStart(iso);
  let n = 0;
  for (let i = 0; i < 7; i++) if (habit.done[addDays(start, i)]) n++;
  return n;
}

const earliestDone = (habit) => Object.keys(habit.done).sort()[0] ?? null;
const weekPaused = (habit, start) => [0, 1, 2, 3, 4, 5, 6].every((i) => isPaused(habit, addDays(start, i)));

/**
 * Streak of consecutive planned days (daily and weekday habits) or weeks (weekly habits) with the goal met.
 * Days and weeks that are paused or not planned are skipped. Today (or this week) never breaks a streak
 * while it is still open. Returns { current, best, unit: 'day' | 'week' }.
 */
export function streaks(habit, today = isoDate()) {
  const first = earliestDone(habit);
  const weekly = habit.schedule.type === 'weekly';
  const unit = weekly ? 'week' : 'day';
  if (!first) return { current: 0, best: 0, unit };

  if (weekly) {
    const goal = Math.max(1, habit.schedule.perWeek);
    const thisWeek = weekStart(today);
    const firstWeek = weekStart(first);
    let current = 0;
    for (let w = thisWeek; w >= firstWeek; w = addDays(w, -7)) {
      if (weekPaused(habit, w)) continue;
      if (weekCount(habit, w) >= goal) current++;
      else if (w !== thisWeek) break;
    }
    let best = 0;
    let run = 0;
    for (let w = firstWeek; w <= thisWeek; w = addDays(w, 7)) {
      if (weekPaused(habit, w)) continue;
      if (weekCount(habit, w) >= goal) { run++; best = Math.max(best, run); }
      else if (w !== thisWeek) run = 0;
    }
    return { current, best, unit };
  }

  let current = 0;
  for (let d = today; d >= first; d = addDays(d, -1)) {
    if (!isDue(habit, d)) continue;
    if (habit.done[d]) current++;
    else if (d !== today) break;
  }
  let best = 0;
  let run = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    if (!isDue(habit, d)) continue;
    if (habit.done[d]) { run++; best = Math.max(best, run); }
    else if (d !== today) run = 0;
  }
  return { current, best, unit };
}

/** Share (0..1) of planned days done over the last 30 days, or null when nothing was planned. */
export function rate30(habit, today = isoDate()) {
  const created = isoDate(new Date(habit.created));
  const first = earliestDone(habit);
  let start = addDays(today, -29);
  const origin = first && first < created ? first : created;
  if (start < origin) start = origin;
  if (start > today) return null;

  if (habit.schedule.type === 'weekly') {
    let days = 0;
    let done = 0;
    for (let d = start; d <= today; d = addDays(d, 1)) {
      if (isPaused(habit, d)) continue;
      days++;
      if (habit.done[d]) done++;
    }
    if (!days) return null;
    return Math.min(1, done / (Math.max(1, habit.schedule.perWeek) * (days / 7)));
  }

  let planned = 0;
  let done = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (!isDue(habit, d)) continue;
    if (habit.done[d]) { planned++; done++; }
    else if (d !== today) planned++;
  }
  return planned ? done / planned : null;
}

export const totalDone = (habit) => Object.keys(habit.done).length;

/** The pause that covers `iso`, if any. */
export const activePause = (habit, iso) => habit.pauses.find((p) => p.from <= iso && iso <= p.to) ?? null;

/** Pauses from `today` for `days` days. */
export function pauseFor(habit, days, today = isoDate()) {
  habit.pauses.push({ from: today, to: addDays(today, days - 1) });
}

/** Ends the pause that covers `today`; days from today on count again. */
export function resume(habit, today = isoDate()) {
  const p = activePause(habit, today);
  if (!p) return;
  p.to = addDays(today, -1);
  if (p.to < p.from) habit.pauses.splice(habit.pauses.indexOf(p), 1);
}

/** Month grid (Monday first): weeks of 7 ISO dates, with days outside the month included. */
export function monthGrid(year, month) {
  const first = isoDate(new Date(year, month, 1));
  let d = weekStart(first);
  const last = isoDate(new Date(year, month + 1, 0));
  const weeks = [];
  while (d <= last) {
    weeks.push([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(d, i)));
    d = addDays(d, 7);
  }
  return weeks;
}

/**
 * State of a calendar day: 'done' | 'missed' | 'paused' | 'off' (not planned) | 'open' (planned, not done yet,
 * today or the future).
 */
export function dayState(habit, iso, today = isoDate()) {
  if (habit.done[iso]) return 'done';
  if (isPaused(habit, iso)) return 'paused';
  if (habit.schedule.type === 'weekly') return iso < today ? 'off' : 'open';
  if (!isScheduled(habit, iso)) return 'off';
  return iso < today ? 'missed' : 'open';
}

export const displayTitle = (habit) => habit.title.trim();

/** Filters by view ('today' | 'all' | 'archive') and search; oldest habit first. */
export function visibleHabits(habits, { view = 'today', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return habits
    .filter((h) => (view === 'archive') === !!h.archived)
    .filter((h) => !q || h.title.toLowerCase().includes(q))
    .sort((a, b) => a.created - b.created);
}

export const atLimit = (count, premium) => !premium && count >= FREE_LIMIT;
