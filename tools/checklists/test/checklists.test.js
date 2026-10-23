import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newList, newItem, newSubItem, nextDue, dueState, toggleItem, toggleSub, progress, overdueCount, clearCompleted,
  moveItem, displayTitle, visibleLists,
} from '../src/checklists.js';

const TODAY = '2026-10-19';

test('next due date of repeats', () => {
  assert.equal(nextDue('2026-10-19', 'daily', TODAY), '2026-10-20');
  assert.equal(nextDue('2026-10-19', 'weekly', TODAY), '2026-10-26');
  assert.equal(nextDue('2026-01-31', 'monthly', '2026-01-31'), '2026-02-28');
  assert.equal(nextDue('2026-10-01', 'daily', TODAY), '2026-10-20'); // skips past dates
  assert.equal(nextDue(null, 'weekly', TODAY), '2026-10-26');
});

test('due state', () => {
  const at = (due, done = false) => ({ due, done });
  assert.equal(dueState(at('2026-10-18'), TODAY), 'overdue');
  assert.equal(dueState(at('2026-10-19'), TODAY), 'today');
  assert.equal(dueState(at('2026-10-21'), TODAY), 'soon');
  assert.equal(dueState(at('2026-10-30'), TODAY), 'later');
  assert.equal(dueState(at('2026-10-18', true), TODAY), null);
  assert.equal(dueState(at(null), TODAY), null);
});

test('checking and repeating', () => {
  const plain = { ...newItem('a'), sub: [newSubItem('x'), newSubItem('y')] };
  assert.equal(toggleItem(plain, TODAY), false);
  assert.ok(plain.done && plain.sub.every((s) => s.done));
  toggleItem(plain, TODAY);
  assert.ok(!plain.done && plain.sub.every((s) => !s.done));

  const rep = { ...newItem('b'), due: '2026-10-19', repeat: 'weekly', sub: [{ ...newSubItem('z'), done: true }] };
  assert.equal(toggleItem(rep, TODAY), true);
  assert.equal(rep.done, false);
  assert.equal(rep.due, '2026-10-26');
  assert.equal(rep.sub[0].done, false);
});

test('sub-items drive the parent', () => {
  const it = { ...newItem('a'), sub: [newSubItem('x'), newSubItem('y')] };
  toggleSub(it, it.sub[0].id);
  assert.equal(it.done, false);
  toggleSub(it, it.sub[1].id);
  assert.equal(it.done, true);
  toggleSub(it, it.sub[0].id);
  assert.equal(it.done, false);
});

test('progress counts leaf tasks', () => {
  const list = newList();
  const a = newItem('a');
  const b = { ...newItem('b'), sub: [{ ...newSubItem('x'), done: true }, newSubItem('y')] };
  const c = { ...newItem('c'), done: true };
  list.items.push(a, b, c);
  assert.deepEqual(progress(list), { done: 2, total: 4, percent: 50 });
  assert.deepEqual(progress(newList()), { done: 0, total: 0, percent: 0 });
});

test('overdue, clear completed and moving', () => {
  const list = newList();
  list.items.push({ ...newItem('a'), due: '2026-10-01' }, { ...newItem('b'), done: true }, newItem('c'));
  assert.equal(overdueCount(list, TODAY), 1);
  assert.equal(clearCompleted(list), 1);
  assert.deepEqual(list.items.map((i) => i.text), ['a', 'c']);
  assert.equal(moveItem(list.items, 0, 1), true);
  assert.deepEqual(list.items.map((i) => i.text), ['c', 'a']);
  assert.equal(moveItem(list.items, 0, -1), false);
});

test('titles, filtering and limit', () => {
  const a = { ...newList(1), title: 'Groceries', items: [{ ...newItem('milk'), sub: [newSubItem('oat')] }], updated: 1 };
  const b = { ...newList(2), title: '', items: [newItem('Call dentist')], updated: 2, pinned: true };
  const c = { ...newList(3), title: 'Old', archived: true, updated: 3 };
  assert.equal(displayTitle(b), 'Call dentist');
  assert.deepEqual(visibleLists([a, b, c]).map(displayTitle), ['Call dentist', 'Groceries']);
  assert.deepEqual(visibleLists([a, b, c], { view: 'archive' }).map(displayTitle), ['Old']);
  assert.deepEqual(visibleLists([a, b, c], { query: 'oat' }).map(displayTitle), ['Groceries']);
});
