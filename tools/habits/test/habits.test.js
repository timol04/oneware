import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newHabit, addDays, weekday, weekStart, isDue, toggleDay, setNote, weekCount, streaks, rate30, pauseFor, resume,
  monthGrid, dayState, visibleHabits,
} from '../src/habits.js';

const TODAY = '2026-10-19'; // a Monday
const make = (schedule = {}, done = [], created = new Date(2026, 8, 1).getTime()) => {
  const h = newHabit(created);
  h.schedule = { ...h.schedule, ...schedule };
  for (const d of done) h.done[d] = true;
  return h;
};
const run = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));

test('date helpers', () => {
  assert.equal(weekday('2026-10-19'), 0);
  assert.equal(weekday('2026-10-25'), 6);
  assert.equal(weekStart('2026-10-22'), '2026-10-19');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
});

test('daily streak survives an open today', () => {
  const h = make({ type: 'daily' }, run('2026-10-15', 4)); // 15..18
  assert.deepEqual(streaks(h, TODAY), { current: 4, best: 4, unit: 'day' });
  toggleDay(h, TODAY);
  assert.equal(streaks(h, TODAY).current, 5);
});

test('a missed day breaks the streak, best is kept', () => {
  const h = make({ type: 'daily' }, [...run('2026-10-01', 6), '2026-10-18']);
  assert.deepEqual(streaks(h, TODAY), { current: 1, best: 6, unit: 'day' });
});

test('weekday habits skip days that are not planned', () => {
  const h = make({ type: 'days', days: [0, 2, 4] }, ['2026-10-12', '2026-10-14', '2026-10-16']); // Mon Wed Fri
  assert.equal(isDue(h, '2026-10-17'), false);
  assert.equal(streaks(h, TODAY).current, 3); // open Monday does not break it
  assert.equal(streaks(h, '2026-10-17').current, 3); // Saturday is not planned
});

test('weekly goal counts weeks', () => {
  const h = make({ type: 'weekly', perWeek: 2 }, ['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-15']);
  assert.deepEqual(streaks(h, TODAY), { current: 2, best: 2, unit: 'week' });
  assert.equal(weekCount(h, '2026-10-14'), 2);
  const miss = make({ type: 'weekly', perWeek: 3 }, ['2026-10-05', '2026-10-07', '2026-10-12']);
  assert.equal(streaks(miss, TODAY).current, 0);
});

test('pausing keeps the streak alive and resume ends it', () => {
  const h = make({ type: 'daily' }, run('2026-10-10', 4)); // 10..13
  h.pauses.push({ from: '2026-10-14', to: '2026-10-18' });
  assert.equal(streaks(h, TODAY).current, 4);
  assert.equal(isDue(h, '2026-10-16'), false);

  const p = make({ type: 'daily' });
  pauseFor(p, 7, TODAY);
  assert.deepEqual(p.pauses, [{ from: TODAY, to: '2026-10-25' }]);
  resume(p, TODAY);
  assert.deepEqual(p.pauses, []);
  pauseFor(p, 7, '2026-10-15');
  resume(p, TODAY);
  assert.deepEqual(p.pauses, [{ from: '2026-10-15', to: '2026-10-18' }]);
});

test('30 day rate', () => {
  const h = make({ type: 'daily' }, run('2026-10-10', 5), new Date(2026, 9, 10).getTime()); // created 10th, done 10..14
  // planned 10..18 = 9 days (today open and not done is left out), done 5
  assert.equal(rate30(h, TODAY), 5 / 9);
  assert.equal(rate30(make({}, [], new Date(2026, 9, 19).getTime()), TODAY), null);
});

test('notes and toggling', () => {
  const h = make();
  assert.equal(toggleDay(h, TODAY), true);
  assert.equal(toggleDay(h, TODAY), false);
  setNote(h, TODAY, 'ran 5 km');
  assert.equal(h.notes[TODAY], 'ran 5 km');
  setNote(h, TODAY, '  ');
  assert.equal(h.notes[TODAY], undefined);
});

test('month grid starts on Monday and covers the month', () => {
  const weeks = monthGrid(2026, 9); // October 2026
  assert.equal(weeks[0][0], '2026-09-28');
  assert.equal(weeks.at(-1).at(-1), '2026-11-01');
  assert.ok(weeks.every((w) => w.length === 7));
});

test('day state', () => {
  const h = make({ type: 'days', days: [0] }, ['2026-10-12']);
  assert.equal(dayState(h, '2026-10-12', TODAY), 'done');
  assert.equal(dayState(h, '2026-10-05', TODAY), 'missed');
  assert.equal(dayState(h, '2026-10-14', TODAY), 'off');
  assert.equal(dayState(h, '2026-10-26', TODAY), 'open');
  h.pauses.push({ from: '2026-10-05', to: '2026-10-06' });
  assert.equal(dayState(h, '2026-10-05', TODAY), 'paused');
});

test('views and limit', () => {
  const a = { ...newHabit(1), title: 'Read' };
  const b = { ...newHabit(2), title: 'Run', archived: true };
  assert.deepEqual(visibleHabits([b, a]).map((h) => h.title), ['Read']);
  assert.deepEqual(visibleHabits([a, b], { view: 'archive' }).map((h) => h.title), ['Run']);
  assert.deepEqual(visibleHabits([a, b], { query: 'ru' }).map((h) => h.title), []);
});
