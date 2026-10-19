// Tests for the APA module against fixtures/apa.docx and pure regex cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDocx } from '../src/docx.js';
import { checkApa, extractCitations, parseReference } from '../src/apa.js';

const cite = (t) => extractCitations(t).map((c) => `${c.surnames.join('+')}${c.etAl ? '*' : ''}|${c.year}${c.suffix}|${c.kind[0]}`);

test('all required citation forms are detected', () => {
  assert.deepEqual(cite('(Meier, 2020)'), ['Meier|2020|p']);
  assert.deepEqual(cite('(Meier & Huber, 2020)'), ['Meier+Huber|2020|p']);
  assert.deepEqual(cite('(Meier, Huber & Müller, 2020)'), ['Meier+Huber+Müller|2020|p']);
  assert.deepEqual(cite('(Meier et al., 2020)'), ['Meier*|2020|p']);
  assert.deepEqual(cite('(Meier, 2020; Huber, 2021)'), ['Meier|2020|p', 'Huber|2021|p']);
  assert.deepEqual(cite('Meier (2020) shows that'), ['Meier|2020|n']);
  assert.deepEqual(cite('(Meier, 2020a)'), ['Meier|2020a|p']);
  assert.deepEqual(cite('Meier and Huber (2020) show'), ['Meier+Huber|2020|n']);
  assert.deepEqual(cite('(cf. Meier, 2020, p. 14)'), ['Meier|2020|p']);
  assert.deepEqual(cite('(vgl. Meier, 2020, S. 14)'), ['Meier|2020|p']);
  assert.deepEqual(cite('(Meier, 2020a, 2020b)'), ['Meier|2020a|p', 'Meier|2020b|p']);
  assert.deepEqual(cite('(van der Berg, 2019)'), ['van der Berg|2019|p']);
});

test('no citations in ordinary parentheses', () => {
  assert.deepEqual(cite('That was (see Figure 1) and (n = 20) and (2020).'), []);
});

test('reference entries are parsed', () => {
  const r = parseReference('Müller, C., Schmid, D., & Keller, E. (2019). Stress and coping.');
  assert.deepEqual([r.surnames, r.year], [['Müller', 'Schmid', 'Keller'], '2019']);
  assert.equal(parseReference('Meier, A. (2020a). Title.').suffix, 'a');
});

const doc = await parseDocx(await readFile(new URL('../fixtures/apa.docx', import.meta.url)));
const apa = checkApa(doc);
const by = (id) => apa.find((c) => c.id === id);
const keys = (id) => by(id).findings.map((f) => f.message.k);

test('citations without a matching entry', () => {
  const f = by('apa-citations').findings;
  assert.equal(by('apa-citations').status, 'fail');
  assert.ok(f.some((x) => x.message.k === 'apa.noEntry' && x.message.p.c.includes('Schulz')));
  assert.ok(f.some((x) => x.message.k === 'apa.yearMismatch' && x.message.p.c.includes('Keller')));
  assert.ok(f.some((x) => x.message.k === 'apa.suffixMismatch' && x.message.p.c.includes('2020b')));
  assert.equal(f.length, 3);
});

test('unused entries', () => {
  const f = by('apa-unused').findings;
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].message.p.author, f[0].message.p.year], ['Huber', '2022']);
});

test('reference format: italic, DOI, title case', () => {
  const k = keys('apa-format');
  assert.ok(by('apa-format').findings.some((f) => f.message.k === 'apa.journalItalic' && f.message.p.title.includes('Psychology Today')));
  assert.ok(k.includes('apa.doiFormat'));
  assert.ok(k.includes('apa.titleCase'));
  assert.equal(k.length, 3, k.join(' | ')); // correct entries and the German book have no findings
});
