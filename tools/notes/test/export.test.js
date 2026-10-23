import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteMarkdown, noteFileName, noteFile, hasText } from '../src/export.js';
import { newNote } from '../src/notes.js';
import { readMarkdown } from '../../converter/src/text-in.js';

const note = (body, title = '') => ({ ...newNote(1), title, body });

test('the title becomes a heading and editor escapes are removed', () => {
  assert.equal(noteMarkdown(note('Intro\n\n\\- one\n\n\\[ \\] two', 'Plan')), '# Plan\n\nIntro\n\n- one\n\n[ ] two\n');
  assert.equal(noteMarkdown(note('Text')), 'Text\n');
});

test('file names are safe and fall back', () => {
  assert.equal(noteFileName(note('', 'Plan: Q1/Q2?')), 'Plan Q1 Q2.md');
  assert.equal(noteFileName(note('First line\nmore')), 'First line.md');
  assert.equal(noteFileName(note(''), 'Notiz'), 'Notiz.md');
  assert.equal(noteFileName(note('', 'x'.repeat(200))).length, 63);
});

test('notes with no text are not offered for conversion', () => {
  assert.equal(hasText(note('')), false);
  assert.equal(hasText(note('  ', ' ')), false);
  assert.equal(hasText(note('a')), true);
  assert.equal(hasText(note('', 'T')), true);
  assert.equal(hasText(null), false);
});

test('the Converter reads the exported file as headings, items and text', async () => {
  const f = noteFile(note('Intro\n\n\\- one\n\n\\- two', 'Plan'), 'x');
  assert.equal(f.type, 'text/markdown');
  const blocks = readMarkdown(new TextDecoder().decode(f.data));
  assert.deepEqual(blocks.map((b) => b.type), ['heading', 'para', 'item', 'item']);
});
