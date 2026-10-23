import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTasks, checklistTitle, buildChecklist, createChecklistFromNote } from '../src/tasks.js';
import { newNote } from '../src/notes.js';
import { saveItem, getAllItems, buildExport, importData } from '../../../core/storage.js';
import { progress, visibleLists, displayTitle, FREE_LIMIT, newList } from '../../checklists/src/checklists.js';
import { todayEntries } from '../../checklists/src/today.js';
import { registerMessages, setLang, t } from '../../../core/i18n.js';
import en from '../src/locales/en.js';
import de from '../src/locales/de.js';

const note = (body, title = '') => ({ ...newNote(1000), title, body });

test('several open tasks', () => {
  assert.deepEqual(extractTasks('- [ ] Milk\n- [ ] Bread\n- [ ] Eggs'), [
    { text: 'Milk', done: false }, { text: 'Bread', done: false }, { text: 'Eggs', done: false },
  ]);
});

test('done and open tasks keep their state', () => {
  assert.deepEqual(extractTasks('- [x] a\n- [ ] b\n- [X] c'), [
    { text: 'a', done: true }, { text: 'b', done: false }, { text: 'c', done: true },
  ]);
});

test('accepts -, * and + and indentation', () => {
  assert.equal(extractTasks('* [ ] a\n+ [x] b\n  - [ ] c\n\t- [X] d').length, 4);
});

test('accepts the escaped form the note editor writes', () => {
  assert.deepEqual(extractTasks('- \\[ \\] Call Anna\n\\- \\[x\\] Send offer'), [
    { text: 'Call Anna', done: false }, { text: 'Send offer', done: true },
  ]);
});

test('list items of the editor count as tasks', () => {
  assert.deepEqual(extractTasks('Shopping\n\n- Milk\n- Bread\n\n1. Call Anna\n2) Send offer\n\\- typed dash'), [
    { text: 'Milk', done: false }, { text: 'Bread', done: false }, { text: 'Call Anna', done: false },
    { text: 'Send offer', done: false }, { text: 'typed dash', done: false },
  ]);
});

test('with checkboxes present only they count; plain text and malformed lines are ignored', () => {
  assert.deepEqual(extractTasks('- milk\n- [x] real\n* bread'), [{ text: 'real', done: true }]);
  assert.deepEqual(extractTasks('[ ] no bullet\n-[ ] no space\nSome - text\nplain line'), []);
});

test('empty tasks are ignored', () => {
  assert.deepEqual(extractTasks('- [ ]\n- [ ]    \n- [x] \n- [ ] real'), [{ text: 'real', done: false }]);
});

test('Windows and old Mac line breaks', () => {
  assert.equal(extractTasks('- [ ] a\r\n- [x] b\r\n\r\n- [ ] c').length, 3);
  assert.equal(extractTasks('- [ ] a\r- [ ] b').length, 2);
});

test('formatting is removed, links keep their address, code blocks are skipped', () => {
  assert.deepEqual(extractTasks('- [ ] **Call** *Anna* and `Bob`\n- [ ] [Docs](https://x.ch/a)\n```\n- [ ] in code\n```\n- [ ] 2 \\* 3'), [
    { text: 'Call Anna and Bob', done: false },
    { text: 'Docs (https://x.ch/a)', done: false },
    { text: '2 * 3', done: false },
  ]);
});

test('a note without tasks has none (no button)', () => {
  assert.equal(extractTasks('Just text\nmore text').length, 0);
  assert.equal(extractTasks('- \n-   \n1. ').length, 0);
  assert.equal(extractTasks('').length, 0);
  assert.equal(extractTasks(undefined).length, 0);
});

test('title: note title, else first line, else fallback', () => {
  assert.equal(checklistTitle(note('- [ ] a', 'Shopping'), 'Fallback'), 'Shopping');
  assert.equal(checklistTitle(note('# Plan\n- [ ] a'), 'Fallback'), 'Plan');
  assert.equal(checklistTitle(note(''), 'Fallback'), 'Fallback');
  assert.equal(checklistTitle(note('', 'x'.repeat(300)), 'F').length, 120);
});

test('built checklist uses the Checklists data model', () => {
  const list = buildChecklist(note('- [ ] a\n- [x] b', 'T'), extractTasks('- [ ] a\n- [x] b'), { now: 5, today: '2026-10-22' });
  assert.equal(list.title, 'T');
  assert.equal(list.created, 5);
  assert.equal(list.archived, false);
  assert.equal(list.pinned, false);
  assert.deepEqual(list.items.map((i) => [i.text, i.done, i.due, i.repeat, i.sub]), [
    ['a', false, '2026-10-22', null, []], ['b', true, '2026-10-22', null, []],
  ]);
  assert.equal(new Set(list.items.map((i) => i.id)).size, 2);
  assert.deepEqual(progress(list), { done: 1, total: 2, percent: 50 });
});

test('conversion stores an independent checklist and leaves the note untouched', async () => {
  const n = await saveItem('notes', note('Intro\n- [ ] one\n- [x] two', 'Meeting'));
  const before = JSON.stringify(await getAllItems('notes'));
  const res = await createChecklistFromNote(n, { premium: false, fallbackTitle: 'F', today: '2026-10-22' });
  assert.equal(res.status, 'created');
  assert.equal(JSON.stringify(await getAllItems('notes')), before);
  const lists = await getAllItems('checklists');
  assert.equal(lists.length, 1);
  assert.equal(lists[0].id, res.list.id);
  assert.equal(lists[0].title, 'Meeting');
  assert.equal(displayTitle(lists[0]), 'Meeting');
  assert.equal(visibleLists(lists).length, 1);
  // editing the copy does not change the note
  lists[0].items[0].text = 'changed';
  assert.equal(JSON.stringify(await getAllItems('notes')), before);
});

test('new checklist appears in the dashboard Today feed (open and done)', async () => {
  const lists = await getAllItems('checklists');
  const entries = todayEntries({ items: lists, today: '2026-10-22', lang: 'en' });
  assert.deepEqual(entries.map((e) => [e.title, e.state]).sort(), [['one', 'due'], ['two', 'done']]);
  assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
});

test('export and import of the new checklist keeps it intact', async () => {
  const payload = await buildExport('checklists');
  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0].items.length, 2);
  const lists = await getAllItems('checklists');
  const n = await importData('checklists', { tool: 'checklists', version: 1, data: structuredClone(lists) });
  assert.equal(n, 1);
  assert.equal((await getAllItems('checklists')).length, 1);
});

test('free limit of Checklists is respected, Premium lifts it', async () => {
  const have = (await getAllItems('checklists')).length;
  for (let i = have; i < FREE_LIMIT; i++) await saveItem('checklists', { ...newList(), title: `L${i}` });
  const n = note('- [ ] over limit', 'Extra');
  const blocked = await createChecklistFromNote(n, { premium: false, fallbackTitle: 'F' });
  assert.equal(blocked.status, 'limit');
  assert.equal((await getAllItems('checklists')).length, FREE_LIMIT);
  const ok = await createChecklistFromNote(n, { premium: true, fallbackTitle: 'F' });
  assert.equal(ok.status, 'created');
  assert.equal((await getAllItems('checklists')).length, FREE_LIMIT + 1);
});

test('a note without tasks creates nothing', async () => {
  const before = (await getAllItems('checklists')).length;
  const res = await createChecklistFromNote(note('plain text'), { premium: true, fallbackTitle: 'F' });
  assert.equal(res.status, 'empty');
  assert.equal((await getAllItems('checklists')).length, before);
});

test('English and German texts exist and fill their placeholders', () => {
  registerMessages('en', en);
  registerMessages('de', de);
  for (const lang of ['en', 'de']) {
    setLang(lang);
    for (const key of ['nt.toChecklist', 'nt.toChecklist.title', 'nt.toChecklist.create', 'nt.toChecklist.limitTitle', 'nt.toChecklist.failed']) {
      assert.notEqual(t(key), key, `${lang}:${key}`);
    }
    const text = t('nt.toChecklist.text', { title: 'Plan', count: 3, done: 1 });
    assert.ok(text.includes('Plan') && text.includes('3') && !text.includes('{'), `${lang}: ${text}`);
    assert.ok(!t('nt.toChecklist.text.one', { title: 'Plan', done: 0 }).includes('{'));
    assert.ok(!t('nt.toChecklist.limitText', { limit: 10 }).includes('{'));
  }
  assert.equal(t('nt.toChecklist'), 'Aufgaben in Checkliste umwandeln');
  setLang('en');
  assert.equal(t('nt.toChecklist'), 'Convert tasks to checklist');
});
