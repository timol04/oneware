import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newEntry, parseAmount, isISODate, shiftMonth, monthOf, categoryFor, listMonth, groupByDay,
  monthTotals, byCategory, monthlySeries, averages, latestMonth, todayISO,
} from '../src/expenses.js';

const e = (date, amount, type = 'expense', category = 'other', note = '', created = 0) => ({ ...newEntry(0, date), date, amount, type, category, note, created });
const SAMPLE = [
  e('2026-10-02', 100, 'income', 'salary', 'Pay'),
  e('2026-10-03', 40.5, 'expense', 'groceries', 'Market', 1),
  e('2026-10-03', 9.5, 'expense', 'eating', 'Lunch', 2),
  e('2026-09-30', 20, 'expense', 'groceries', 'Old'),
  e('2026-10-15', 30, 'expense', 'groceries', 'Market again'),
];

test('amount parsing accepts comma and dot, rejects zero, negatives and junk', () => {
  assert.equal(parseAmount('12,90'), 12.9);
  assert.equal(parseAmount(' 3.456 '), 3.46);
  for (const bad of ['', '0', '-4', 'abc', '1,2,3']) assert.equal(parseAmount(bad), null);
});

test('dates and months', () => {
  assert.ok(isISODate('2026-02-28'));
  assert.ok(!isISODate('2026-02-30'));
  assert.equal(monthOf('2026-10-19'), '2026-10');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-11', 3), '2027-02');
  assert.equal(todayISO(new Date(2026, 0, 5)), '2026-01-05');
});

test('category follows the type', () => {
  assert.equal(categoryFor('income', 'groceries'), 'otherIn');
  assert.equal(categoryFor('expense', 'salary'), 'other');
  assert.equal(categoryFor('expense', 'eating'), 'eating');
});

test('month totals and balance', () => {
  assert.deepEqual(monthTotals(SAMPLE, '2026-10'), { income: 100, expense: 80, balance: 20 });
  assert.deepEqual(monthTotals(SAMPLE, '2026-08'), { income: 0, expense: 0, balance: 0 });
});

test('month list: newest first, filter by type, search by note and category label', () => {
  assert.deepEqual(listMonth(SAMPLE, '2026-10').map((x) => x.note), ['Market again', 'Lunch', 'Market', 'Pay']);
  assert.deepEqual(listMonth(SAMPLE, '2026-10', { type: 'income' }).map((x) => x.note), ['Pay']);
  assert.deepEqual(listMonth(SAMPLE, '2026-10', { query: 'MARKET' }).length, 2);
  const label = (c) => (c === 'eating' ? 'Restaurants' : c);
  assert.deepEqual(listMonth(SAMPLE, '2026-10', { query: 'restaur', label }).map((x) => x.note), ['Lunch']);
});

test('group by day sums the net per day', () => {
  const days = groupByDay(listMonth(SAMPLE, '2026-10'));
  assert.deepEqual(days.map((d) => [d.date, d.entries.length, d.net]), [['2026-10-15', 1, -30], ['2026-10-03', 2, -50], ['2026-10-02', 1, 100]]);
});

test('category split: biggest first, shares add up, months combine', () => {
  const oct = byCategory(SAMPLE, ['2026-10']);
  assert.deepEqual(oct.map((r) => [r.category, r.amount]), [['groceries', 70.5], ['eating', 9.5]]);
  assert.ok(Math.abs(oct.reduce((s, r) => s + r.share, 0) - 1) < 1e-9);
  assert.equal(byCategory(SAMPLE, ['2026-09', '2026-10'])[0].amount, 90.5);
  assert.deepEqual(byCategory(SAMPLE, ['2026-10'], 'income').map((r) => r.category), ['salary']);
  assert.deepEqual(byCategory([], ['2026-10']), []);
});

test('12-month series ends at the given month and spans a year change', () => {
  const s = monthlySeries(SAMPLE, '2026-10');
  assert.equal(s.length, 12);
  assert.equal(s[0].month, '2025-11');
  assert.equal(s[11].month, '2026-10');
  assert.equal(s[10].expense, 20);
  assert.equal(s[11].balance, 20);
});

test('averages count only months with bookings', () => {
  assert.deepEqual(averages(monthlySeries(SAMPLE, '2026-10')), { months: 2, income: 50, expense: 50 });
  assert.deepEqual(averages(monthlySeries([], '2026-10')), { months: 0, income: 0, expense: 0 });
});

test('latest month falls back when empty', () => {
  assert.equal(latestMonth(SAMPLE, '2026-01'), '2026-10');
  assert.equal(latestMonth([], '2026-01'), '2026-01');
});
