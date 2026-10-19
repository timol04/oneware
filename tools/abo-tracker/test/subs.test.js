import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSub, chargeDate, nextCharge, chargesBetween, monthlyCost, applyPrice, applyStart, setStatus, totals,
  upcoming, monthlySeries, normalizeUrl, byCategory, priceChanges, parsePrice, isISODate, currentPrice, dueWithin,
} from '../src/subs.js';

const make = (over = {}) => ({ ...newSub(0, '2026-01-31'), name: 'x', ...over });

test('charge dates clamp to the end of short months without drifting', () => {
  const s = make();
  assert.equal(chargeDate(s, 0), '2026-01-31');
  assert.equal(chargeDate(s, 1), '2026-02-28');
  assert.equal(chargeDate(s, 2), '2026-03-31');
  assert.equal(chargeDate(make({ cycle: 'yearly', start: '2024-02-29' }), 1), '2025-02-28');
  assert.equal(chargeDate(make({ cycle: 'weekly', start: '2026-03-01' }), 2), '2026-03-15');
  assert.equal(chargeDate(make({ cycle: 'quarterly', start: '2026-01-15' }), 1), '2026-04-15');
});

test('next charge: on a charge day it is today, later it is the following date, none when not active', () => {
  const s = make({ start: '2026-01-10' });
  assert.equal(nextCharge(s, '2026-05-10').date, '2026-05-10');
  assert.equal(nextCharge(s, '2026-05-11').date, '2026-06-10');
  assert.equal(nextCharge(s, '2025-12-01').date, '2026-01-10');
  assert.equal(nextCharge({ ...s, status: 'paused' }, '2026-05-11'), null);
});

test('monthly cost per cycle', () => {
  assert.equal(monthlyCost(12, 'monthly'), 12);
  assert.equal(monthlyCost(120, 'yearly'), 10);
  assert.equal(monthlyCost(30, 'quarterly'), 10);
  assert.ok(Math.abs(monthlyCost(10, 'weekly') - 43.3333) < 0.001);
});

test('price changes keep the history and apply from today', () => {
  const s = make({ start: '2026-01-10', prices: [{ from: '2026-01-10', price: 10 }] });
  applyPrice(s, 10, '2026-03-01');
  assert.equal(s.prices.length, 1);
  applyPrice(s, 12, '2026-03-01');
  assert.deepEqual(s.prices.map((p) => p.price), [10, 12]);
  assert.deepEqual(chargesBetween(s, '2026-02-01', '2026-04-30').map((c) => c.price), [10, 12, 12]);
  applyPrice(s, 13, '2026-03-01');
  assert.equal(s.prices.length, 2);
  assert.equal(currentPrice(s, '2026-03-01'), 13);
  assert.deepEqual(priceChanges([s], '2026-03-01').map((c) => [c.first, c.last]), [[10, 13]]);
});

test('correcting the price before the start replaces it', () => {
  const s = make({ start: '2026-06-01', prices: [{ from: '2026-06-01', price: 5 }] });
  applyPrice(s, 7, '2026-05-01');
  assert.deepEqual(s.prices, [{ from: '2026-06-01', price: 7 }]);
});

test('paused periods are not charged and resuming opens a new one', () => {
  const s = make({ start: '2026-01-10', prices: [{ from: '2026-01-10', price: 10 }], periods: [{ from: '2026-01-10', to: null }] });
  setStatus(s, 'paused', '2026-02-20');
  setStatus(s, 'active', '2026-04-15');
  assert.deepEqual(chargesBetween(s, '2026-01-01', '2026-06-30').map((c) => c.date), ['2026-01-10', '2026-02-10', '2026-05-10', '2026-06-10']);
  setStatus(s, 'cancelled', '2026-05-12');
  assert.equal(s.status, 'cancelled');
  assert.equal(s.periods.at(-1).to, '2026-05-12');
  assert.equal(nextCharge(s, '2026-05-13'), null);
});

test('moving the start date moves the first price and period', () => {
  const s = make({ start: '2026-01-10', prices: [{ from: '2026-01-10', price: 10 }], periods: [{ from: '2026-01-10', to: null }] });
  applyStart(s, '2026-02-01');
  assert.equal(s.prices[0].from, '2026-02-01');
  assert.equal(s.periods[0].from, '2026-02-01');
});

test('totals only count active subscriptions', () => {
  const a = make({ prices: [{ from: '2026-01-31', price: 10 }] });
  const b = make({ cycle: 'yearly', prices: [{ from: '2026-01-31', price: 120 }] });
  const c = make({ status: 'paused', prices: [{ from: '2026-01-31', price: 99 }] });
  const t = totals([a, b, c], '2026-03-01');
  assert.equal(t.monthly, 20);
  assert.equal(t.yearly, 240);
  assert.deepEqual([t.active, t.inactive], [2, 1]);
});

test('upcoming is sorted by date', () => {
  const a = make({ name: 'a', start: '2026-01-20' });
  const b = make({ name: 'b', start: '2026-01-05' });
  assert.deepEqual(upcoming([a, b], '2026-03-01').map((u) => u.sub.name), ['b', 'a']);
});

test('due within counts every charge in the window', () => {
  const w = make({ cycle: 'weekly', start: '2026-03-01', prices: [{ from: '2026-03-01', price: 2 }] });
  assert.equal(dueWithin([w], '2026-03-01', 14), 6);
});

test('monthly series covers twelve months and sums charges', () => {
  const a = make({ start: '2026-01-10', prices: [{ from: '2026-01-10', price: 10 }], periods: [{ from: '2026-01-10', to: null }] });
  const series = monthlySeries([a], '2026-03-15');
  assert.equal(series.length, 12);
  assert.equal(series.at(-1).month, '2026-03');
  assert.deepEqual(series.slice(-4).map((m) => m.total), [0, 10, 10, 10]);
});

test('category shares add up to one, biggest first', () => {
  const a = make({ category: 'music', prices: [{ from: '2026-01-31', price: 30 }] });
  const b = make({ category: 'cloud', prices: [{ from: '2026-01-31', price: 10 }] });
  const r = byCategory([a, b], '2026-03-01');
  assert.deepEqual(r.map((c) => c.category), ['music', 'cloud']);
  assert.equal(r[0].share, 0.75);
});

test('price and date input parsing', () => {
  assert.equal(parsePrice('12,90'), 12.9);
  assert.equal(parsePrice('0'), 0);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('-1'), null);
  assert.equal(parsePrice('abc'), null);
  assert.ok(isISODate('2026-02-28'));
  assert.ok(!isISODate('2026-02-30'));
});

test('account links get https and only allow web addresses', () => {
  assert.equal(normalizeUrl(''), '');
  assert.equal(normalizeUrl('  netflix.com/account '), 'https://netflix.com/account');
  assert.equal(normalizeUrl('http://example.com/a'), 'http://example.com/a');
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
  assert.equal(normalizeUrl('ftp://example.com'), null);
  assert.equal(normalizeUrl('not a link'), null);
});
