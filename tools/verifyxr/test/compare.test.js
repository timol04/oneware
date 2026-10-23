import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDocx } from '../src/docx.js';
import { fixDocx } from '../src/fixer.js';
import { compareDocs } from '../src/compare.js';
import { PRESETS } from '../src/presets.js';

const original = await readFile(new URL('../fixtures/beispiel.docx', import.meta.url));
const rules = PRESETS.standard;
const before = await parseDocx(original);
const fixed = await fixDocx(original, rules);
const changes = compareDocs(before, await parseDocx(fixed.bytes));
const row = (kind, side) => changes.rows.filter((r) => r.kind === kind && r.side === side);

test('before/after lists font, size, spacing and margin changes with old and new values', () => {
  assert.deepEqual(row('font').map((r) => [r.before, r.after]), [[['Courier New'], ['Times New Roman']]]);
  const pt = (list) => list.map((v) => v.p.n);
  assert.deepEqual(row('size').map((r) => [pt(r.before), pt(r.after)]), [[[10], [12]], [[12, 14], [12]]]); // a mixed paragraph lists both old sizes
  assert.equal(row('spacing').length, 3); // 2x, 1x, exact 18 pt
  assert.deepEqual(row('margin', 'left').map((r) => [r.before[0].p.n, r.after[0].p.n]), [[3, 2.5]]);
  assert.deepEqual(row('margin', 'right').map((r) => [r.before[0].p.n, r.after[0].p.n]), [[3, 2.5]]);
  assert.equal(row('margin', 'top').length, 0);
});

test('every row names the places it changed', () => {
  for (const r of changes.rows) { assert.equal(r.places.length, r.count); assert.ok(r.count > 0); }
  assert.ok(changes.paragraphs > 0);
  assert.equal(changes.sections, 1);
});

test('comparing a corrected copy with itself finds nothing', async () => {
  const again = await parseDocx(fixed.bytes);
  const none = compareDocs(again, await parseDocx((await fixDocx(fixed.bytes, rules)).bytes));
  assert.deepEqual(none, { rows: [], paragraphs: 0, sections: 0 });
});
