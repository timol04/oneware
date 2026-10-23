import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stashFiles, receiveFiles, handoffUrl } from '../handoff.js';
import { getAllItems, saveItem } from '../storage.js';

const open = (search) => {
  globalThis.location = { href: `http://localhost/mydashboard/converter/${search}` };
  globalThis.history = { replaceState(_s, _t, url) { globalThis.location = { href: `http://localhost${url}` }; globalThis.replaced = url; } };
};

test('stashed files come out again as File objects and the record is removed', async () => {
  const id = await stashFiles([
    { name: 'a.pdf', type: 'application/pdf', data: new Uint8Array([1, 2, 3]) },
    new File([new Uint8Array([4, 5])], 'b.docx', { type: 'application/x' }),
    { name: 'c.md', type: 'text/markdown', data: new Blob(['# hi']) },
  ]);
  open(`?handoff=${id}&target=pdf`);
  const got = await receiveFiles();
  assert.deepEqual(got.params, { target: 'pdf' });
  assert.deepEqual(got.files.map((f) => [f.name, f.type, f.size]), [['a.pdf', 'application/pdf', 3], ['b.docx', 'application/x', 2], ['c.md', 'text/markdown', 4]]);
  assert.deepEqual([...new Uint8Array(await got.files[0].arrayBuffer())], [1, 2, 3]);
  assert.equal((await getAllItems('handoff')).length, 0);
  assert.equal(globalThis.replaced, '/mydashboard/converter/');
});

test('a second visit with the same link gets nothing', async () => {
  const id = await stashFiles([{ name: 'a.pdf', type: '', data: new Uint8Array([1]) }]);
  open(`?handoff=${id}`);
  assert.equal((await receiveFiles()).files.length, 1);
  open(`?handoff=${id}`);
  assert.equal(await receiveFiles(), null);
});

test('no handoff parameter, or an unknown id, means nothing arrives', async () => {
  open('');
  assert.equal(await receiveFiles(), null);
  open('?handoff=nope');
  assert.equal(await receiveFiles(), null);
});

test('records nobody picked up are removed after an hour', async () => {
  await saveItem('handoff', { id: 'old', created: Date.now() - 2 * 3600000, files: [] });
  await stashFiles([{ name: 'x.pdf', type: '', data: new Uint8Array([1]) }]);
  assert.ok(!(await getAllItems('handoff')).some((r) => r.id === 'old'));
});

test('link to the next tool', () => {
  assert.equal(handoffUrl('converter', 'abc', { target: 'pdf' }), '../converter/?handoff=abc&target=pdf');
  assert.equal(handoffUrl('verifyxr', 'abc'), '../verifyxr/?handoff=abc');
});
