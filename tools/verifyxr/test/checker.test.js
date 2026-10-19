// Tests against fixtures/beispiel.docx and fixtures/apa.docx (German sample documents).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseXml } from '../src/xml.js';
import { parseDocx } from '../src/docx.js';
import { checkDocument } from '../src/checker.js';
import { PRESETS } from '../src/presets.js';

const doc = await parseDocx(await readFile(new URL('../fixtures/beispiel.docx', import.meta.url)));
const rules = PRESETS.standard;
const byId = (r, id) => r.criteria.find((c) => c.id === id);
const hasParam = (c, key, value) => c.findings.some((f) => String(f.message.p[key]?.p?.n ?? f.message.p[key]) === String(value));

test('xml reader decodes entities and keeps spaces inside w:t', () => {
  const [root] = parseXml('<?xml version="1.0"?><w:p a="x&amp;y"><w:t> a &lt; b </w:t><w:br/></w:p>');
  assert.equal(root.attrs.a, 'x&y');
  assert.equal(root.kids[0].kids[0].text, ' a < b ');
  assert.equal(root.kids[1].name, 'w:br');
});

test('parser resolves inheritance', () => {
  const p = (t) => doc.paragraphs.find((x) => x.text.startsWith(t));
  assert.deepEqual(p('Absatz im Stil Normal').lineSpacing, { kind: 'multiple', value: 1.5 });
  assert.deepEqual(p('Absatz im Stil Fliesstext').lineSpacing, { kind: 'multiple', value: 2 });
  assert.deepEqual(p('Absatz mit direkter').lineSpacing, { kind: 'multiple', value: 1 });
  assert.deepEqual(p('Absatz mit exaktem').lineSpacing, { kind: 'exact', value: 18 });
  assert.equal(p('Absatz mit direkter').items[0].font, 'Courier New');
  assert.equal(p('Absatz mit direkter').items[0].size, 10);
  assert.equal(p('Absatz im Stil Normal').items[0].font, 'Times New Roman');
  assert.equal(doc.paragraphs[0].special, true); // Heading 1
});

test('sections and margins', () => {
  assert.equal(doc.sections.length, 2);
  assert.deepEqual(doc.sections[0].margins, { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 });
  assert.equal(doc.sections[1].margins.left, 3);
  assert.equal(doc.paragraphs.at(-1).sectionIndex, 1);
});

test('runs in one paragraph stay separate (spaces kept)', () => {
  const p = doc.paragraphs.find((x) => x.text.startsWith('Gemischt'));
  assert.equal(p.text, 'Gemischt: normal, gross (14pt) und wieder normal.');
  assert.deepEqual(p.items.map((i) => i.size), [12, 14, 12]);
});

test('checker reports the expected deviations', () => {
  const r = checkDocument(doc, rules);
  assert.notEqual(byId(r, 'font').status, 'ok');
  assert.ok(byId(r, 'font').findings.some((f) => f.found === 'Courier New'));
  assert.ok(hasParam(byId(r, 'size'), 'found', 10));
  assert.ok(hasParam(byId(r, 'size'), 'found', 14));
  assert.equal(byId(r, 'spacing').findings.length, 3); // 2x, 1x, exact 18 pt
  assert.equal(byId(r, 'margins').findings.length, 2); // section 2: left + right
  assert.equal(byId(r, 'words').status, 'skip');
});

test('limits for words and pages', () => {
  const r = checkDocument(doc, { ...rules, maxWords: 10, minPages: 1 });
  assert.equal(byId(r, 'words').status, 'fail');
  assert.equal(byId(r, 'words').findings[0].message.k, 'msg.wordsMax');
  assert.equal(doc.pages, 2);
  assert.equal(byId(r, 'pages').status, 'ok');
});

test('matching margins turn green', () => {
  const r = checkDocument(doc, { ...rules, marginsCm: { top: 2.5, bottom: 2.5, left: null, right: null } });
  assert.equal(byId(r, 'margins').status, 'ok');
});

test('a broken file is rejected', async () => {
  await assert.rejects(() => parseDocx(new Uint8Array([1, 2, 3])));
});
