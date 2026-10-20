import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { saveProfile, listProfiles, getProfile, deleteProfile } from '../src/profiles.js';
import { buildExport, importData } from '../../../core/storage.js';

const rules = { font: 'Arial', size: 12, lineSpacing: 1.5, marginsCm: { top: 2, bottom: 2, left: 3, right: 2 }, minWords: null, maxWords: 5000, minPages: null, maxPages: null, ignoreSpecial: true };

test('profiles live in the store, so backup export and import cover them', async () => {
  assert.equal(await saveProfile('Uni A', rules), true);
  assert.equal(await saveProfile('Uni A', { ...rules, size: 11 }), true);
  assert.equal((await listProfiles()).length, 1);
  assert.equal((await getProfile('Uni A')).rules.size, 11);
  const exp = await buildExport('verifyxr');
  assert.equal(exp.data.length, 1);
  assert.equal(await deleteProfile('Uni A'), true);
  assert.equal((await listProfiles()).length, 0);
  assert.equal(await importData('verifyxr', exp), 1);
  assert.equal((await getProfile('Uni A')).rules.size, 11);
});
