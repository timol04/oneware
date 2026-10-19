import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDocx } from '../src/docx.js';
import { checkDocument } from '../src/checker.js';
import { fixDocx } from '../src/fixer.js';
import { PRESETS } from '../src/presets.js';

const original = await readFile(new URL('../fixtures/beispiel.docx', import.meta.url));
const rules = PRESETS.standard;
const byId = (r, id) => r.criteria.find((c) => c.id === id);

test('fixed copy passes the format checks', async () => {
  const before = checkDocument(await parseDocx(original), rules);
  assert.notEqual(byId(before, 'font').status, 'ok');
  const { bytes, stats } = await fixDocx(original, rules);
  assert.ok(stats.paragraphs > 0 && stats.sections > 0);
  const after = checkDocument(await parseDocx(bytes), rules);
  for (const id of ['font', 'size', 'spacing', 'margins']) assert.equal(byId(after, id).status, 'ok', id);
});

test('text is unchanged and headings are left alone', async () => {
  const a = await parseDocx(original);
  const b = await parseDocx((await fixDocx(original, rules)).bytes);
  assert.deepEqual(b.paragraphs.map((p) => p.text), a.paragraphs.map((p) => p.text));
  assert.equal(b.wordCount, a.wordCount);
  assert.equal(b.paragraphs[0].special, true);
  assert.deepEqual(b.paragraphs[0].lineSpacing, a.paragraphs[0].lineSpacing);
});

test('fixing twice changes nothing more', async () => {
  const once = (await fixDocx(original, rules)).bytes;
  const twice = await fixDocx(once, rules);
  assert.equal(twice.stats.sections, 0);
});

test('a broken file is rejected', async () => {
  await assert.rejects(() => fixDocx(new Uint8Array([1, 2, 3]), rules));
});
