import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../../../core/markdown.js';
import { newNote, displayTitle, snippet, parseTags, tagCounts, visibleNotes } from '../src/notes.js';

test('markdown escapes HTML', () => {
  assert.equal(renderMarkdown('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.ok(!renderMarkdown('[x](javascript:alert(1))').includes('<a'));
});

test('markdown blocks', () => {
  assert.equal(renderMarkdown('# Title'), '<h1>Title</h1>');
  assert.equal(renderMarkdown('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(renderMarkdown('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(renderMarkdown('> quote'), '<blockquote>quote</blockquote>');
  assert.equal(renderMarkdown('```\n<b>\n```'), '<pre><code>&lt;b&gt;</code></pre>');
  assert.equal(renderMarkdown('---'), '<hr>');
  assert.equal(renderMarkdown('one\ntwo\n\nthree'), '<p>one<br>two</p>\n<p>three</p>');
});

test('markdown inline', () => {
  assert.equal(renderMarkdown('**bold** and *em* and `x*y*`'), '<p><strong>bold</strong> and <em>em</em> and <code>x*y*</code></p>');
  assert.equal(renderMarkdown('[a](https://x.ch/p?q=1)'), '<p><a href="https://x.ch/p?q=1" target="_blank" rel="noopener noreferrer">a</a></p>');
  assert.equal(renderMarkdown('snake_case_name'), '<p>snake_case_name</p>');
});

test('titles and snippets', () => {
  const n = { ...newNote(), body: '# Plan\nBuy **milk** today' };
  assert.equal(displayTitle(n), 'Plan');
  assert.equal(snippet(n), 'Buy milk today');
  assert.equal(displayTitle({ ...newNote(), title: ' Hi ' }), 'Hi');
  assert.equal(displayTitle(newNote()), '');
});

test('tags are normalized and counted', () => {
  assert.deepEqual(parseTags('#Work, home office,work'), ['work', 'home-office']);
  const notes = [{ ...newNote(), tags: ['a', 'b'] }, { ...newNote(), tags: ['a'] }, { ...newNote(), tags: ['c'], archived: true }];
  assert.deepEqual(tagCounts(notes), [['a', 2], ['b', 1]]);
});

test('visibleNotes filters, searches and sorts pinned first', () => {
  const a = { ...newNote(1), id: 'a', title: 'Alpha', updated: 1, tags: ['x'] };
  const b = { ...newNote(2), id: 'b', title: 'Beta', updated: 5 };
  const c = { ...newNote(3), id: 'c', title: 'Gamma', updated: 3, pinned: true };
  const d = { ...newNote(4), id: 'd', title: 'Old', archived: true };
  const all = [a, b, c, d];
  assert.deepEqual(visibleNotes(all).map((n) => n.id), ['c', 'b', 'a']);
  assert.deepEqual(visibleNotes(all, { view: 'archive' }).map((n) => n.id), ['d']);
  assert.deepEqual(visibleNotes(all, { tag: 'x' }).map((n) => n.id), ['a']);
  assert.deepEqual(visibleNotes(all, { query: 'BET' }).map((n) => n.id), ['b']);
});


test('templates: made from a note, never listed, new note starts fresh', async () => {
  const { templateFromNote, noteFromTemplate, templatesOf, isTemplate, tagCounts, BUILTIN_TEMPLATES } = await import('../src/notes.js');
  const n = newNote();
  n.title = 'Meeting';
  n.body = '## Goal\n';
  n.tags = ['work'];
  n.color = 'red';
  n.pinned = true;
  const tpl = templateFromNote(n);
  assert.equal(isTemplate(tpl), true);
  assert.equal(tpl.color, null);
  assert.equal(tpl.pinned, false);
  assert.deepEqual(tpl.tags, ['work']);
  assert.equal(visibleNotes([tpl, n], { view: 'notes' }).length, 1);
  assert.equal(visibleNotes([tpl], { view: 'archive' }).length, 0);
  assert.deepEqual(tagCounts([tpl]), []);
  assert.deepEqual(templatesOf([n, tpl]), [tpl]);
  const fresh = noteFromTemplate(tpl);
  assert.equal(fresh.template, undefined);
  assert.deepEqual([fresh.title, fresh.body, fresh.tags], ['Meeting', '## Goal\n', ['work']]);
  assert.notEqual(fresh.tags, tpl.tags);
  assert.ok(BUILTIN_TEMPLATES.length >= 3);
});
