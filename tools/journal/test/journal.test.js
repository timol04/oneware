import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newEntry, addDays, displayTitle, snippet, parseTags, tagCounts, visibleEntries, streaks, averageMood, monthGrid,
} from '../src/journal.js';

const TODAY = '2026-10-19';
const make = (date, extra = {}) => ({ ...newEntry(date), body: 'text', ...extra });

test('title falls back to the first line, snippet skips it', () => {
  const e = make(TODAY, { body: '# Good day\nWent for a **walk**' });
  assert.equal(displayTitle(e), 'Good day');
  assert.equal(snippet(e), 'Went for a walk');
});

test('tags are normalized and counted', () => {
  assert.deepEqual(parseTags('#Work, deep focus, work'), ['work', 'deep-focus']);
  const counts = tagCounts([make('2026-10-18', { tags: ['work'] }), make(TODAY, { tags: ['work', 'run'] })]);
  assert.deepEqual(counts, [['work', 2], ['run', 1]]);
});

test('filter by tag and text, newest first', () => {
  const list = [make('2026-10-17', { body: 'rain', tags: ['a'] }), make(TODAY, { body: 'sun', tags: ['a'] }), make('2026-10-18', { body: 'sun' })];
  assert.deepEqual(visibleEntries(list, { tag: 'a' }).map((e) => e.date), [TODAY, '2026-10-17']);
  assert.deepEqual(visibleEntries(list, { query: 'SUN' }).map((e) => e.date), [TODAY, '2026-10-18']);
});

test('streak survives an open today and finds the best run', () => {
  const list = ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'].map((d) => make(d));
  assert.deepEqual(streaks(list, TODAY), { current: 4, best: 4 });
  list.push(make(TODAY));
  assert.equal(streaks(list, TODAY).current, 5);
  assert.deepEqual(streaks([make('2026-10-01'), make('2026-10-02'), make('2026-10-10')], TODAY), { current: 0, best: 2 });
  assert.deepEqual(streaks([newEntry('2026-10-18')], TODAY), { current: 0, best: 0 });
});

test('average mood over 30 days', () => {
  const list = [make(TODAY, { mood: 5 }), make('2026-10-18', { mood: 3 }), make('2026-08-01', { mood: 1 })];
  assert.equal(averageMood(list, TODAY), 4);
  assert.equal(averageMood([], TODAY), null);
});

test('month grid starts on Monday and covers the month', () => {
  const grid = monthGrid(2026, 9); // October 2026, 1st is a Thursday
  assert.equal(grid[0][0], '2026-09-28');
  assert.equal(grid[0][3], '2026-10-01');
  assert.ok(grid.flat().includes('2026-10-31'));
  assert.ok(grid.every((w) => w.length === 7));
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
});

