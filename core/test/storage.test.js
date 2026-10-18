import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveItem, getAllItems, deleteItem, updateItem, buildExport, importData } from '../storage.js';

test('CRUD pro Tool, Stores sind getrennt', async () => {
  const a = await saveItem('tool-a', { name: 'Netflix' });
  assert.ok(a.id);
  await saveItem('tool-a', { name: 'Spotify' });
  await saveItem('tool-b', { name: 'anderes Tool' });

  assert.equal((await getAllItems('tool-a')).length, 2);
  assert.equal((await getAllItems('tool-b')).length, 1);

  const u = await updateItem('tool-a', a.id, { name: 'Netflix Premium' });
  assert.equal(u.id, a.id);
  assert.ok((await getAllItems('tool-a')).some((i) => i.name === 'Netflix Premium'));
  await assert.rejects(updateItem('tool-a', 'gibt-es-nicht', {}));

  await deleteItem('tool-a', a.id);
  assert.equal((await getAllItems('tool-a')).length, 1);
});

test('Export-Format und Import-Roundtrip', async () => {
  await saveItem('tool-c', { name: 'x' });
  const exp = await buildExport('tool-c');
  assert.equal(exp.tool, 'tool-c');
  assert.equal(exp.version, 1);
  assert.ok(!Number.isNaN(Date.parse(exp.exportedAt)));
  assert.equal(exp.data.length, 1);

  const file = new Blob([JSON.stringify(exp)], { type: 'application/json' });
  assert.equal(await importData('tool-d', { ...exp, tool: 'tool-d' }), 1);
  assert.equal(await importData('tool-c', file, { replace: true }), 1);
  assert.equal((await getAllItems('tool-c')).length, 1);
});

test('Import validiert Format und tool-Feld', async () => {
  const blob = (o) => new Blob([typeof o === 'string' ? o : JSON.stringify(o)]);
  await assert.rejects(importData('tool-c', blob('kein json')), /JSON/);
  await assert.rejects(importData('tool-c', blob({ foo: 1 })), /format/i);
  await assert.rejects(importData('tool-c', blob({ tool: 'anderes', version: 1, data: [] })), /anderes/);
  await assert.rejects(importData('tool-c', blob({ tool: 'tool-c', version: 99, data: [] })), /version/i);
});
