import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRules, hasFindings, readGuideline } from '../src/guideline.js';
import { buildDocx, para } from './helpers.js';

const values = (f, k) => f[k].map((c) => c.value);

test('German guideline with clear values', () => {
  const f = extractRules([
    'Formale Vorgaben',
    'Schrift: Times New Roman, Schriftgrösse 12 pt im Fliesstext.',
    'Fussnoten werden in 10 pt gesetzt.',
    'Zeilenabstand: 1,5-zeilig.',
    'Seitenränder: oben 2,5 cm, unten 2 cm, links 3 cm, rechts 2.5 cm.',
    'Der Umfang beträgt 8\'000 bis 10\'000 Wörter.',
  ]);
  assert.deepEqual(values(f, 'font'), ['Times New Roman']);
  assert.deepEqual(values(f, 'size'), [12]); // the 10 pt footnote is ignored
  assert.deepEqual(values(f, 'lineSpacing'), [1.5]);
  assert.deepEqual([f.top, f.bottom, f.left, f.right].map((l) => l[0].value), [2.5, 2, 3, 2.5]);
  assert.deepEqual([values(f, 'minWords'), values(f, 'maxWords')], [[8000], [10000]]);
  assert.match(f.left[0].quote, /Seitenränder/);
});

test('English guideline, one margin for all sides, mm, double spacing', () => {
  const f = extractRules([
    'Use Arial, 11 pt font size.',
    'Double spacing throughout. Line spacing: 2.0',
    'All margins must be 25 mm.',
    'The thesis must not exceed 60 pages and at least 40 pages.',
  ]);
  assert.deepEqual(values(f, 'font'), ['Arial']);
  assert.deepEqual(values(f, 'size'), [11]);
  assert.deepEqual(values(f, 'lineSpacing'), [2]);
  assert.deepEqual([f.top, f.bottom, f.left, f.right].map((l) => l[0].value), [2.5, 2.5, 2.5, 2.5]);
  assert.deepEqual([values(f, 'minPages'), values(f, 'maxPages')], [[40], [60]]);
});

test('several fonts or sizes stay candidates for the user to choose', () => {
  const f = extractRules(['Schrift: Times New Roman 12 pt oder Arial 11 pt.']);
  assert.deepEqual(values(f, 'font').sort(), ['Arial', 'Times New Roman']);
  assert.deepEqual(values(f, 'size').sort(), [11, 12]);
});

test('ambiguous or unrelated text finds nothing', () => {
  const f = extractRules([
    'Die Arbeit umfasst ca. 10 000 Wörter.', // no min/max wording: not guessed
    'Der Rand ist ein Ort am Ende der Seite.',
    'Das Seminar findet 12 Wochen lang statt, mit 1,5 Stunden pro Woche.',
    'Fussnoten: 10 pt, Zeilenabstand 1.0',
  ]);
  assert.equal(hasFindings(f), false);
});

test('binding margin without a side is not applied to all sides', () => {
  const f = extractRules(['Korrekturrand: 3 cm.']);
  assert.equal(hasFindings(f), false);
});

test('reads Word and text guidelines', async () => {
  const docx = await buildDocx({ body: para('Schriftgrösse 12 pt.') + para('Zeilenabstand 1.5') });
  const lines = await readGuideline('richtlinie.docx', docx);
  assert.deepEqual(lines, ['Schriftgrösse 12 pt.', 'Zeilenabstand 1.5']);
  assert.deepEqual(await readGuideline('a.txt', new TextEncoder().encode('Zeile 1\n\nZeile 2')), ['Zeile 1', 'Zeile 2']);
  await assert.rejects(() => readGuideline('a.png', new Uint8Array(3)), /unsupported/);
  await assert.rejects(() => readGuideline('a.docx', new Uint8Array([1, 2, 3])), /unreadable/);
});
