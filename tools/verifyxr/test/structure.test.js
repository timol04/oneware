import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocx } from '../src/docx.js';
import { checkDocument } from '../src/checker.js';
import { PRESETS } from '../src/presets.js';
import { buildDocx, para, heading, caption, picture, table, pageBreak, sect, footerRef, pageFooter, textFooter } from './helpers.js';

const run = async (opts) => {
  const doc = await parseDocx(await buildDocx(opts));
  const result = checkDocument(doc, PRESETS.standard);
  return { doc, get: (id) => result.criteria.find((c) => c.id === id) };
};

test('headings: a clean hierarchy passes, also going back up', async () => {
  const { get } = await run({ body: heading(1, 'A') + heading(2, 'B') + heading(3, 'C') + heading(2, 'D') + heading(1, 'E') + heading(2, 'F') });
  assert.equal(get('headings').status, 'ok');
  assert.equal(get('headings').summary.p.n, 6);
});

test('headings: a skipped level is an error with both levels named', async () => {
  const { get } = await run({ body: heading(1, 'A') + heading(3, 'Zu tief') + heading(2, 'B') });
  const c = get('headings');
  assert.equal(c.status, 'fail');
  assert.equal(c.findings.length, 1);
  assert.equal(c.findings[0].message.k, 'msg.headingSkip');
  assert.deepEqual(c.findings[0].message.p, { from: 1, found: 3 });
  assert.equal(c.findings[0].severity, 'error');
});

test('headings: starting below level 1 is only a note', async () => {
  const { get } = await run({ body: heading(2, 'A') + heading(3, 'B') });
  assert.equal(get('headings').status, 'warn');
  assert.equal(get('headings').findings[0].severity, 'hint');
});

test('headings: outline level without a heading style counts, body text does not', async () => {
  const outline = '<w:p><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:r><w:t>Direkt Ebene 3</w:t></w:r></w:p>';
  const { get } = await run({ body: heading(1, 'A') + outline + para('Fliesstext') });
  assert.equal(get('headings').findings.length, 1);
  assert.deepEqual(get('headings').findings[0].message.p, { from: 1, found: 3 });
});

test('headings: none found is skipped', async () => {
  assert.equal((await run({ body: para('Nur Text') })).get('headings').status, 'skip');
});

test('page numbers: a PAGE field in the footer of every section passes', async () => {
  const { get } = await run({
    body: para('Seite 1') + pageBreak + para('Seite 2') + sect(footerRef('rId1')),
    parts: { 'word/footer1.xml': pageFooter }, rels: { rId1: 'footer1.xml' },
  });
  assert.equal(get('pagenumbers').status, 'ok');
});

test('page numbers: a footer without a PAGE field does not count', async () => {
  const { get } = await run({
    body: para('Seite 1') + pageBreak + para('Seite 2') + sect(footerRef('rId1')),
    parts: { 'word/footer1.xml': textFooter }, rels: { rId1: 'footer1.xml' },
  });
  assert.equal(get('pagenumbers').status, 'fail');
  assert.equal(get('pagenumbers').findings[0].message.k, 'msg.pageNumbersNone');
});

test('page numbers: no footer at all fails, a single page is skipped', async () => {
  assert.equal((await run({ body: para('A') + pageBreak + para('B') })).get('pagenumbers').status, 'fail');
  assert.equal((await run({ body: para('A') })).get('pagenumbers').status, 'skip');
});

test('page numbers: simple field and inheritance by later sections', async () => {
  const simple = '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>';
  const section1 = `<w:p><w:pPr>${sect(footerRef('rId1'))}</w:pPr><w:r><w:t>Teil 1</w:t></w:r></w:p>`;
  const { get } = await run({ body: section1 + pageBreak + para('Teil 2 erbt die Fusszeile'), parts: { 'word/footer1.xml': simple }, rels: { rId1: 'footer1.xml' } });
  assert.equal(get('pagenumbers').status, 'ok');
});

test('page numbers: a section without number next to numbered ones is a note', async () => {
  const titlePage = `<w:p><w:pPr>${sect()}</w:pPr><w:r><w:t>Titelblatt</w:t></w:r></w:p>`;
  const { get } = await run({
    body: titlePage + para('Inhalt') + pageBreak + para('Mehr') + sect(footerRef('rId1')),
    parts: { 'word/footer1.xml': pageFooter }, rels: { rId1: 'footer1.xml' },
  });
  const c = get('pagenumbers');
  assert.equal(c.status, 'warn');
  assert.equal(c.findings.length, 1);
  assert.equal(c.findings[0].severity, 'hint');
});

test('captions: figure and table with captions pass, above or below', async () => {
  const { get } = await run({ body: para('Text') + picture() + caption('Abbildung 1: Aufbau') + caption('Tabelle 1: Werte') + table() + para('Weiter') });
  assert.equal(get('captions').status, 'ok');
  assert.equal(get('captions').summary.p.n, 2);
});

test('captions: missing captions are named per figure and table', async () => {
  const { get } = await run({ body: para('Text') + picture() + para('Weiter im Text.') + table() + para('Ende.') });
  const c = get('captions');
  assert.equal(c.status, 'fail');
  assert.deepEqual(c.findings.map((f) => f.message.k).sort(), ['msg.captionMissing.figure', 'msg.captionMissing.table']);
});

test('captions: tiny images (logos) are ignored, empty paragraphs between figure and caption are fine', async () => {
  const { get } = await run({ body: picture(1) + para('Titel') + picture(8) + para('') + caption('Figure 1: Overview') });
  assert.equal(get('captions').status, 'ok');
  assert.equal(get('captions').summary.p.n, 1);
});

test('captions: stacked pictures share one caption', async () => {
  const { get } = await run({ body: picture() + picture() + caption('Abbildung 1: Zwei Teile') });
  assert.equal(get('captions').status, 'ok');
});

test('captions: a caption of the wrong kind does not count', async () => {
  const { get } = await run({ body: para('Text') + picture() + para('Tabelle 1: Falsch') });
  assert.equal(get('captions').status, 'fail');
});

test('captions: running text that starts with "Tabelle 2" is not a caption', async () => {
  const long = 'Tabelle 2 zeigt, dass die Ergebnisse der Messung über alle Gruppen hinweg stabil bleiben und nur im letzten Durchgang leicht abweichen, was wir im folgenden Abschnitt genauer besprechen und einordnen.';
  const { get } = await run({ body: para(long) + table() });
  assert.equal(get('captions').status, 'fail');
});

test('captions: numbering gaps and repeats are errors', async () => {
  const gap = await run({ body: picture() + caption('Abbildung 1: A') + picture() + caption('Abbildung 3: B') });
  assert.equal(gap.get('captions').status, 'fail');
  assert.deepEqual(gap.get('captions').findings.map((f) => f.message.p), [{ found: 3, expected: 2 }]);
  const repeat = await run({ body: picture() + caption('Abbildung 1: A') + picture() + caption('Abbildung 2: B') + picture() + caption('Abbildung 2: C') });
  assert.deepEqual(repeat.get('captions').findings.map((f) => f.message.p), [{ found: 2, expected: 3 }]);
});

test('captions: chapter numbering (2.1) is not judged', async () => {
  const { get } = await run({ body: picture() + caption('Abbildung 2.1: A') + picture() + caption('Abbildung 2.2: B') });
  assert.equal(get('captions').status, 'ok');
});

test('captions: nothing to caption is skipped', async () => {
  assert.equal((await run({ body: para('Text') })).get('captions').status, 'skip');
});
