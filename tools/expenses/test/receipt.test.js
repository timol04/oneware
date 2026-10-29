import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, findAmount, findDate, findMerchant, findCurrency } from '../src/receipt.js';

const TODAY = '2026-10-29';
const MIGROS = `Migros Wettingen
Zentralstrasse 12
5430 Wettingen
Datum: 27.10.2026 18:42
Brot 3.40
Käse 8.90
Zwischensumme 12.30
Total CHF 54.75
MWST 8.1% 4.10
Bar 60.00
Rückgeld 5.25`;

test('swiss receipt: total, date, merchant, category and currency', () => {
  const r = parseReceipt(MIGROS, TODAY);
  assert.deepEqual(r, { amount: 54.75, date: '2026-10-27', merchant: 'Migros Wettingen', category: 'groceries', currency: 'CHF' });
});

test('amount: thousands separators, total on the next line, fallback to the biggest amount', () => {
  assert.equal(findAmount(['Rechnungsbetrag 1\'234.50']), 1234.5);
  assert.equal(findAmount(['Total', '19,90']), 19.9);
  assert.equal(findAmount(['Kaffee 4.50', 'Kuchen 6.20', 'MwSt 0.80']), 6.2);
  assert.equal(findAmount(['no numbers here']), null);
  assert.equal(findAmount(['Summe 12 .90']), 12.9);
});

test('date: formats, two-digit years, month names, US order, rejects the future and nonsense', () => {
  assert.equal(findDate('am 05.03.26 um 12:00', TODAY), '2026-03-05');
  assert.equal(findDate('2026-10-01', TODAY), '2026-10-01');
  assert.equal(findDate('14 Okt 2026', TODAY), '2026-10-14');
  assert.equal(findDate('10/25/2026', TODAY), '2026-10-25');
  assert.equal(findDate('31.02.2026', TODAY), null);
  assert.equal(findDate('01.01.2030', TODAY), null);
  assert.equal(findDate('Kasse 4 Beleg 17', TODAY), null);
});

test('merchant skips address, keyword and number lines', () => {
  assert.equal(findMerchant(['Kassenbon', '12345', 'Pizzeria Roma', 'Bahnhofstrasse 4']), 'Pizzeria Roma');
  assert.equal(findMerchant(['--- ===', '12.10.2026']), null);
});

test('currency detection', () => {
  assert.equal(findCurrency('Total 12.00 EUR'), 'EUR');
  assert.equal(findCurrency('Total € 12.00'), 'EUR');
  assert.equal(findCurrency('12.00'), null);
});

test('garbage and empty input give empty suggestions, never throw', () => {
  assert.deepEqual(parseReceipt('', TODAY), { amount: null, date: null, merchant: null, category: null, currency: null });
  assert.deepEqual(parseReceipt(undefined, TODAY).amount, null);
});
