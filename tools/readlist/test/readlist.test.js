import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newEntry, setStatus, percent, setProgress, parseTags, allTags, visibleEntries, yearStats, counts, safeLink, atLimit, FREE_LIMIT, displayTitle,
} from '../src/readlist.js';

const TODAY = '2026-10-19';
const make = (over) => ({ ...newEntry('book', 1), ...over });

test('status keeps dates and progress consistent', () => {
  const e = make({ total: 300, current: 120 });
  setStatus(e, 'doing', TODAY);
  assert.deepEqual([e.status, e.started, e.finished], ['doing', TODAY, null]);
  setStatus(e, 'done', '2026-10-25');
  assert.deepEqual([e.started, e.finished, e.current], [TODAY, '2026-10-25', 300]);
  setStatus(e, 'todo', TODAY);
  assert.equal(e.finished, null);
  setStatus(e, 'bogus', TODAY);
  assert.equal(e.status, 'todo');
});

test('progress is clamped', () => {
  const e = make();
  setProgress(e, 50, 200);
  assert.equal(percent(e), 25);
  setProgress(e, 999);
  assert.equal(e.current, 200);
  setProgress(e, -4, 0);
  assert.equal(e.current, 0);
  assert.equal(percent(e), null);
  assert.equal(percent(make({ status: 'done' })), 100);
});

test('tags are split and de-duplicated', () => {
  assert.deepEqual(parseTags('Krimi, #krimi; Sci-Fi ,, '), ['Krimi', 'Sci-Fi']);
  assert.deepEqual(parseTags(''), []);
  const list = [make({ tags: ['Krimi'] }), make({ tags: ['krimi', 'Reise'] }), make({ tags: ['Alt'], archived: true })];
  assert.deepEqual(allTags(list).map((t) => [t.tag.toLowerCase(), t.count]), [['krimi', 2], ['reise', 1]]);
});

test('filtering and ordering', () => {
  const a = make({ title: 'Dune', status: 'done', updated: 5, tags: ['SciFi'], creator: 'Herbert' });
  const b = make({ title: 'Heat', type: 'film', status: 'todo', updated: 3 });
  const c = make({ title: 'Ulysses', status: 'doing', updated: 1, note: 'long' });
  const d = make({ title: 'Old', archived: true });
  const all = [a, b, c, d];
  assert.deepEqual(visibleEntries(all).map((e) => e.title), ['Ulysses', 'Heat', 'Dune']);
  assert.deepEqual(visibleEntries(all, { view: 'archive' }).map((e) => e.title), ['Old']);
  assert.deepEqual(visibleEntries(all, { type: 'film' }).map((e) => e.title), ['Heat']);
  assert.deepEqual(visibleEntries(all, { status: 'done' }).map((e) => e.title), ['Dune']);
  assert.deepEqual(visibleEntries(all, { tag: 'scifi' }).map((e) => e.title), ['Dune']);
  assert.deepEqual(visibleEntries(all, { query: 'herbert' }).map((e) => e.title), ['Dune']);
  assert.deepEqual(visibleEntries(all, { query: 'LONG' }).map((e) => e.title), ['Ulysses']);
  assert.deepEqual(counts(all), { todo: 1, doing: 1, done: 1 });
  assert.equal(displayTitle(make({ creator: 'X' })), 'X');
});

test('year statistics', () => {
  const list = [
    make({ status: 'done', finished: '2026-03-01', rating: 5 }),
    make({ status: 'done', finished: '2026-05-01', type: 'film', rating: 4 }),
    make({ status: 'done', finished: '2025-12-31', rating: 1 }),
    make({ status: 'doing', finished: null }),
  ];
  const s = yearStats(list, 2026);
  assert.equal(s.total, 2);
  assert.equal(s.byType.book, 1);
  assert.equal(s.byType.film, 1);
  assert.equal(s.average, 4.5);
  assert.equal(yearStats([], 2026).average, null);
});

test('links allow only http(s)', () => {
  assert.equal(safeLink('example.com/a'), 'https://example.com/a');
  assert.equal(safeLink('http://x.org'), 'http://x.org/');
  assert.equal(safeLink('javascript:alert(1)'), '');
  assert.equal(safeLink('  '), '');
});

test('free limit', () => {
  assert.equal(atLimit(FREE_LIMIT, false), true);
  assert.equal(atLimit(FREE_LIMIT - 1, false), false);
  assert.equal(atLimit(500, true), false);
});
