import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES } from '../locales/index.js';

test('every language has all English keys and no extra keys', () => {
  const base = Object.keys(LOCALES.en);
  for (const [lang, dict] of Object.entries(LOCALES)) {
    const keys = Object.keys(dict);
    assert.deepEqual(base.filter((k) => !keys.includes(k)), [], `${lang}: missing keys`);
    assert.deepEqual(keys.filter((k) => !base.includes(k)), [], `${lang}: unknown keys`);
  }
});

test('translations contain no emojis', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const [lang, dict] of Object.entries(LOCALES)) {
    for (const [k, v] of Object.entries(dict)) assert.ok(!emoji.test(v), `${lang}:${k} contains an emoji`);
  }
});

test('tool dictionaries have the same keys in every language', async () => {
  const { readdir } = await import('node:fs/promises');
  const { pathToFileURL } = await import('node:url');
  const root = new URL('../../tools/', import.meta.url);
  for (const dir of await readdir(root)) {
    let files;
    try { files = (await readdir(new URL(`${dir}/src/locales/`, root))).filter((f) => f.endsWith('.js')); } catch { continue; }
    const dicts = {};
    for (const f of files) dicts[f] = Object.keys((await import(pathToFileURL(new URL(`${dir}/src/locales/${f}`, root).pathname))).default);
    const base = dicts['en.js'];
    assert.ok(base, `${dir}: en.js is required`);
    for (const [f, keys] of Object.entries(dicts)) {
      assert.deepEqual(base.filter((k) => !keys.includes(k)), [], `${dir}/${f}: missing keys`);
    }
  }
});
