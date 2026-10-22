import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveItem, getAllItems, buildExport, importData, importAll } from '../storage.js';

const SLUGS = ['notes', 'checklists', 'habits', 'abo-tracker', 'readlist', 'journal', 'expenses', 'verifyxr'];

test('backup roundtrip keeps every tool, rich-text HTML and per-tool settings', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    get length() { return mem.size; },
    key: (i) => [...mem.keys()][i] ?? null,
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const html = '<h2>Titel</h2><p>Ein <strong>fetter</strong> &amp; <em>kursiver</em> Text mit "Quotes" und Umlauten äöü</p><ul><li>a</li></ul>';
  for (const slug of SLUGS) await saveItem(slug, { name: `${slug}-item`, body: html, nested: { list: [1, 2, { x: true }] } });
  mem.set('expenses:currency', 'EUR');
  mem.set('abo-tracker:currency', 'USD');
  mem.set('ow_theme', 'dark');

  const bundle = { bundle: true, version: 1, tools: {} };
  for (const slug of SLUGS) bundle.tools[slug] = JSON.parse(JSON.stringify(await buildExport(slug)));
  const before = {};
  for (const slug of SLUGS) before[slug] = await getAllItems(slug);

  // wipe: new database state + empty settings
  for (const slug of SLUGS) {
    const items = await getAllItems(slug);
    const { deleteItem } = await import('../storage.js');
    for (const it of items) await deleteItem(slug, it.id);
  }
  mem.clear();

  const count = await importAll(SLUGS, JSON.parse(JSON.stringify(bundle)));
  assert.equal(count, SLUGS.length);
  for (const slug of SLUGS) assert.deepEqual(await getAllItems(slug), before[slug]);
  assert.equal(mem.get('expenses:currency'), 'EUR');
  assert.equal(mem.get('abo-tracker:currency'), 'USD');
  assert.equal(mem.has('ow_theme'), false);

  // single-tool / cloud file format
  const file = { text: async () => JSON.stringify(await buildExport('journal')) };
  assert.equal(await importData('journal', file, { replace: true }), 1);
  assert.equal((await getAllItems('journal'))[0].body, html);

  // foreign settings keys are not accepted
  await importData('notes', { tool: 'notes', version: 1, data: [], settings: { 'ow_theme': 'light', 'notes:x': '1' } });
  assert.equal(mem.has('ow_theme'), false);
  assert.equal(mem.get('notes:x'), '1');
});
