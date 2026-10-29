import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSw } from '../../scripts/build-sw.js';

async function site() {
  const root = await mkdtemp(path.join(tmpdir(), 'ow-sw-'));
  const put = async (rel, body = 'x') => { await mkdir(path.dirname(path.join(root, rel)), { recursive: true }); await writeFile(path.join(root, rel), body); };
  await put('scripts/sw-template.js', "const VERSION = '__VERSION__'; const MANIFEST = __MANIFEST__;");
  await put('index.html'); await put('core/a.js'); await put('core/test/a.test.js'); await put('legal/terms/index.html');
  await put('mydashboard/index.html'); await put('mydashboard/dashboard.js'); await put('mydashboard/notes/index.html'); await put('mydashboard/notes/src/app.js');
  await put('tools/notes/src/app.js'); await put('CNAME');
  return { root, put };
}

test('sw manifest: core and tools separated, no tests, sources or meta files', async () => {
  const { root } = await site();
  const info = await buildSw(root, ['notes']);
  const out = await readFile(path.join(root, 'sw.js'), 'utf8');
  const manifest = JSON.parse(out.match(/MANIFEST = (.*);/)[1]);
  assert.deepEqual(manifest.core, ['core/a.js', 'index.html', 'legal/terms/index.html', 'mydashboard/dashboard.js', 'mydashboard/index.html'].map((f) => (f === 'index.html' ? './' : f.replace(/index\.html$/, ''))));
  assert.deepEqual(manifest.tools.notes, ['mydashboard/notes/', 'mydashboard/notes/src/app.js']);
  assert.match(out, new RegExp(`VERSION = '${info.version}'`));
});

test('sw version changes with any listed file', async () => {
  const { root, put } = await site();
  const a = (await buildSw(root, ['notes'])).version;
  assert.equal((await buildSw(root, ['notes'])).version, a);
  await put('mydashboard/notes/src/app.js', 'changed');
  assert.notEqual((await buildSw(root, ['notes'])).version, a);
});

test('sw manifest: the receipt-scan engine is lazy, not part of the background warm-up', async () => {
  const { root, put } = await site();
  await put('mydashboard/notes/vendor/ocr/engine.wasm');
  await buildSw(root, ['notes']);
  const manifest = JSON.parse((await readFile(path.join(root, 'sw.js'), 'utf8')).match(/MANIFEST = (.*);/)[1]);
  assert.ok(!manifest.tools.notes.some((u) => u.includes('vendor/ocr')));
  assert.deepEqual(manifest.lazy, ['vendor/ocr/']);
});
