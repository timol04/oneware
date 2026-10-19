import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as checklists from '../../tools/checklists/src/today.js';
import * as habits from '../../tools/habits/src/today.js';
import * as abo from '../../tools/abo-tracker/src/today.js';

const TODAY = '2026-10-19';

test('checklists: overdue and due-today open items, checkable, toggle returns the list', () => {
  const lists = [{ id: 'l', title: 'Home', archived: false, items: [
    { id: 'a', text: 'Rent', done: false, due: '2026-10-18', repeat: null, sub: [] },
    { id: 'b', text: 'Call', done: false, due: TODAY, repeat: null, sub: [] },
    { id: 'c', text: 'Later', done: false, due: '2026-12-01', repeat: null, sub: [] },
  ] }];
  const entries = checklists.todayEntries({ items: lists, today: TODAY, lang: 'en' });
  assert.deepEqual(entries.map((e) => [e.title, e.state]), [['Rent', 'overdue'], ['Call', 'due']]);
  assert.ok(entries.every((e) => e.checkable));
  const saved = checklists.toggleEntry({ items: lists, id: 'l:b', today: TODAY });
  assert.equal(saved.id, 'l');
  assert.equal(checklists.todayEntries({ items: lists, today: TODAY, lang: 'en' }).find((e) => e.title === 'Call').state, 'done');
});

test('habits: planned today, archived and paused left out, toggle marks the day', () => {
  const base = { schedule: { type: 'daily', days: [], perWeek: 3 }, done: {}, notes: {}, pauses: [], archived: false };
  const items = [
    { ...base, id: '1', title: 'Read' },
    { ...base, id: '2', title: 'Old', archived: true },
    { ...base, id: '3', title: 'Paused', pauses: [{ from: TODAY, to: TODAY }] },
  ];
  assert.deepEqual(habits.todayEntries({ items, today: TODAY }).map((e) => e.title), ['Read']);
  habits.toggleEntry({ items, id: '1', today: TODAY });
  assert.equal(habits.todayEntries({ items, today: TODAY })[0].state, 'done');
});

test('abo-tracker: charges within three days, not checkable', () => {
  const sub = (id, start) => ({ id, name: id, cycle: 'monthly', status: 'active', start, prices: [{ from: start, price: 10 }], periods: [{ from: start, to: null }] });
  const entries = abo.todayEntries({ items: [sub('today', '2026-09-19'), sub('soon', '2026-09-21'), sub('far', '2026-09-28')], today: TODAY, lang: 'en' });
  assert.deepEqual(entries.map((e) => [e.title, e.state]), [['today', 'due'], ['soon', 'soon']]);
  assert.equal(abo.toggleEntry(), null);
});
