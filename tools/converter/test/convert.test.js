import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readText, readMarkdown, inlineRuns } from '../src/text-in.js';
import { toText, toMarkdown, toHtml } from '../src/text-out.js';
import { toDocx } from '../src/docx-out.js';
import { readDocx } from '../src/docx-in.js';
import { textToPdf, toLatin } from '../src/pdf-out.js';
import { readPdf } from '../src/pdf-in.js';
import { kindOf, commonTargets } from '../src/formats.js';
import { plain } from '../src/blocks.js';

const MD = `# Titel

Ein **fetter** und *schräger* Absatz mit Umlauten: äöü ß.

- Eins
- Zwei

1. Erste
2. Zweite

| Name | Wert |
| --- | --- |
| a | 1 |
`;

test('markdown is parsed into headings, paragraphs, lists and tables', () => {
  const b = readMarkdown(MD);
  assert.deepEqual(b.map((x) => x.type), ['heading', 'para', 'item', 'item', 'item', 'item', 'table']);
  assert.equal(b[2].ordered, false);
  assert.equal(b[4].ordered, true);
  assert.deepEqual(b[6].rows, [['Name', 'Wert'], ['a', '1']]);
  assert.deepEqual(b[1].runs.filter((r) => r.b).map((r) => r.t), ['fetter']);
  assert.deepEqual(b[1].runs.filter((r) => r.i).map((r) => r.t), ['schräger']);
});

test('inline markdown leaves snake_case alone', () => {
  assert.equal(plain(inlineRuns('use my_var_name here')), 'use my_var_name here');
});

test('plain text splits on blank lines and keeps line breaks', () => {
  const b = readText('a\nb\n\n\nc');
  assert.equal(b.length, 2);
  assert.equal(plain(b[0].runs), 'a\nb');
});

test('text, markdown and html writers', () => {
  const b = readMarkdown(MD);
  assert.match(toText(b), /^Titel\n\nEin fetter/);
  assert.match(toText(b), /- Eins\n- Zwei/);
  assert.match(toText(b), /1\. Erste\n2\. Zweite/);
  const md = toMarkdown(b);
  assert.match(md, /^# Titel/);
  assert.match(md, /\*\*fetter\*\*/);
  assert.match(md, /\| Name \| Wert \|\n\| --- \| --- \|/);
  const html = toHtml(b, 'x<y');
  assert.match(html, /<title>x&lt;y<\/title>/);
  assert.match(html, /<strong>fetter<\/strong>/);
  assert.match(html, /<ul>\n<li>Eins<\/li>\n<li>Zwei<\/li>\n<\/ul>/);
});

test('docx round trip keeps structure and styles', async () => {
  const blocks = readMarkdown(MD);
  const bytes = await toDocx(blocks);
  const back = await readDocx(bytes);
  assert.deepEqual(back.map((x) => x.type), blocks.map((x) => x.type));
  assert.equal(back[0].level, 1);
  assert.equal(plain(back[1].runs), plain(blocks[1].runs));
  assert.deepEqual(back[1].runs.filter((r) => r.b).map((r) => r.t), ['fetter']);
  assert.equal(back[2].ordered, false);
  assert.equal(back[4].ordered, true);
  assert.deepEqual(back[6].rows, blocks[6].rows);
});

test('docx writer escapes XML and drops control characters', async () => {
  const back = await readDocx(await toDocx([{ type: 'para', runs: [{ t: 'a < b & c\u0001 "d"' }] }]));
  assert.equal(plain(back[0].runs), 'a < b & c "d"');
});

test('pdf output can be read back', async () => {
  const long = Array.from({ length: 400 }, (_, i) => `wort${i}`).join(' ');
  const blocks = [...readMarkdown(MD), { type: 'para', runs: [{ t: long }] }];
  const { bytes, pages, lost } = await textToPdf(blocks);
  assert.ok(pages >= 2);
  assert.equal(lost, 0);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  const read = await readPdf(bytes);
  assert.equal(read.pages, pages);
  const text = read.blocks.map((b) => (b.type === 'table' ? '' : plain(b.runs))).join(' ');
  assert.match(text, /Titel/);
  assert.match(text, /Umlauten: äöü ß/);
  assert.match(text, /wort0 wort1/);
  assert.match(text, /wort399/);
});

test('characters outside Latin-1 are replaced and counted', () => {
  assert.deepEqual(toLatin('a—b 中 €'), { text: 'a-b ? EUR', lost: 1 });
});

test('file kinds and common targets', () => {
  assert.equal(kindOf('A.JPEG'), 'image');
  assert.equal(kindOf('x.docx'), 'docx');
  assert.equal(kindOf('x.xlsx'), null);
  assert.deepEqual(commonTargets([{ name: 'a.png', kind: 'image' }]), ['jpg', 'webp', 'pdf']);
  assert.deepEqual(commonTargets([{ name: 'a.png', kind: 'image' }, { name: 'b.jpg', kind: 'image' }]), ['png', 'jpg', 'webp', 'pdf']);
  assert.deepEqual(commonTargets([{ name: 'a.png', kind: 'image' }, { name: 'b.docx', kind: 'docx' }]), ['pdf']);
});

test('a real Word file converts to text, Markdown, HTML and PDF', async () => {
  const { readFile } = await import('node:fs/promises');
  const blocks = await readDocx(await readFile(new URL('../../verifyxr/fixtures/beispiel.docx', import.meta.url)));
  assert.ok(blocks.length > 3);
  assert.equal(blocks[0].type, 'heading');
  assert.match(toText(blocks), /^Einleitung/);
  assert.match(toHtml(blocks), /<h1>Einleitung<\/h1>/);
  assert.ok((await textToPdf(blocks)).bytes.length > 1000);
});
