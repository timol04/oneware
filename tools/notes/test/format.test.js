import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFormat } from '../src/format.js';

const sel = (text, mark, kind) => {
  const s = text.indexOf('[');
  const e = text.indexOf(']') - 1;
  return applyFormat(text.replace('[', '').replace(']', ''), s, e, kind);
};

test('bold and italic wrap and unwrap the selection', () => {
  const r = sel('say [hello] now', '', 'bold');
  assert.deepEqual(r, { text: 'say **hello** now', start: 6, end: 11 });
  assert.equal(applyFormat(r.text, r.start, r.end, 'bold').text, 'say hello now');
  assert.equal(sel('a [b] c', '', 'italic').text, 'a *b* c');
});

test('italic inside bold adds marks instead of removing bold', () => {
  const r = applyFormat('**word**', 2, 6, 'italic');
  assert.equal(r.text, '***word***');
});

test('without a selection the word at the cursor is used, else an empty pair', () => {
  assert.equal(applyFormat('hello world', 2, 2, 'bold').text, '**hello** world');
  assert.deepEqual(applyFormat('a  b', 2, 2, 'bold'), { text: 'a **** b', start: 4, end: 4 });
});

test('inline code and link', () => {
  assert.equal(sel('run [ls] now', '', 'code').text, 'run `ls` now');
  const l = applyFormat('see docs', 4, 8, 'link');
  assert.equal(l.text, 'see [docs](https://)');
  assert.equal(l.text.slice(l.start, l.end), 'https://');
});

test('headings cycle through levels and back', () => {
  let r = applyFormat('Title', 0, 0, 'heading');
  assert.equal(r.text, '# Title');
  r = applyFormat(r.text, 0, 0, 'heading');
  assert.equal(r.text, '## Title');
  r = applyFormat(r.text, 0, 0, 'heading');
  r = applyFormat(r.text, 0, 0, 'heading');
  assert.equal(r.text, 'Title');
});

test('lists and quotes apply to every selected line and toggle off', () => {
  const text = 'a\nb\nc';
  let r = applyFormat(text, 0, 5, 'ul');
  assert.equal(r.text, '- a\n- b\n- c');
  assert.equal(applyFormat(r.text, r.start, r.end, 'ul').text, text);
  r = applyFormat(text, 0, 5, 'ol');
  assert.equal(r.text, '1. a\n2. b\n3. c');
  assert.equal(applyFormat('x\ny', 2, 3, 'quote').text, 'x\n> y');
  // switching list type replaces the old prefix
  assert.equal(applyFormat('- a', 0, 3, 'ol').text, '1. a');
});
