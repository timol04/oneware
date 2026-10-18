import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateLicenseKey, generateLicenseKey, isPremiumUnlocked, unlockPremium, lockPremium } from '../license.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
beforeEach(() => mem.clear());

test('generated keys are valid and match the format XXXX-XXXX-XXXX-XXXX', () => {
  for (let i = 0; i < 50; i++) {
    const key = generateLicenseKey('abo-tracker');
    assert.match(key, /^([0-9A-Z]{4}-){3}[0-9A-Z]{4}$/);
    assert.equal(validateLicenseKey(key, 'abo-tracker'), true);
  }
});

test('invalid input is rejected', () => {
  const key = generateLicenseKey('t');
  const bad = key.slice(0, -1) + (key.endsWith('0') ? '1' : '0');
  assert.equal(validateLicenseKey(bad, 't'), false);
  for (const v of ['', 'abc', null, undefined, 42, 'AAAA-AAAA-AAAA']) assert.equal(validateLicenseKey(v), false);
});

test('key is tool specific', () => {
  const key = generateLicenseKey('qr-code');
  assert.equal(validateLicenseKey(key, 'qr-code'), true);
  assert.equal(validateLicenseKey(key, 'abo-tracker'), false);
});

test('input is normalized (lower case, spaces)', () => {
  const key = generateLicenseKey('t');
  assert.equal(validateLicenseKey(` ${key.toLowerCase().replaceAll('-', ' ')} `, 't'), true);
});

test('unlockPremium stores per tool', () => {
  const a = generateLicenseKey('tool-a');
  assert.equal(isPremiumUnlocked('tool-a'), false);
  assert.equal(unlockPremium('tool-a', 'wrong'), false);
  assert.equal(unlockPremium('tool-a', a), true);
  assert.equal(isPremiumUnlocked('tool-a'), true);
  assert.equal(isPremiumUnlocked('tool-b'), false);
  assert.ok(mem.has('premium_tool-a'));
  lockPremium('tool-a');
  assert.equal(isPremiumUnlocked('tool-a'), false);
});

test('tampered localStorage value does not unlock', () => {
  mem.set('premium_tool-a', 'ABCD-ABCD-ABCD-ABCD');
  assert.equal(isPremiumUnlocked('tool-a'), false);
});
