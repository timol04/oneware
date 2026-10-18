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

// ---- Lemon Squeezy online activation ----
import { unlockPremiumOnline, revalidateLicense } from '../license.js';

const reply = (json, status = 200) => async () => ({ status, json: async () => json });
const ok = (productId = 7) => reply({ activated: true, instance: { id: 'inst-1' }, meta: { product_id: productId } });

test('online activation stores the key and unlocks offline afterwards', async () => {
  const res = await unlockPremiumOnline('tool-x', '  AAAA-BBBB  ', { productId: 7, fetchImpl: ok() });
  assert.deepEqual(res, { ok: true });
  assert.equal(isPremiumUnlocked('tool-x'), true);
  assert.equal(isPremiumUnlocked('tool-y'), false);
});

test('online activation maps errors to reasons', async () => {
  const call = (fetchImpl) => unlockPremiumOnline('tool-x', 'KEY', { productId: 7, fetchImpl });
  assert.equal((await call(reply({ activated: false, error: 'license_key not found.' }, 404))).reason, 'invalid');
  assert.equal((await call(reply({ activated: false, error: 'This license key has reached the activation limit.' }, 400))).reason, 'limit');
  assert.equal((await call(reply({ activated: false, error: 'This license key is disabled.' }, 400))).reason, 'disabled');
  assert.equal((await call(async () => { throw new Error('offline'); })).reason, 'network');
  assert.equal((await call(async () => ({ status: 500, json: async () => { throw new Error('no json'); } }))).reason, 'network');
  assert.equal(isPremiumUnlocked('tool-x'), false);
});

test('a key of another product is rejected and its activation is released', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url.split('/').pop()); return { status: 200, json: async () => ({ activated: true, instance: { id: 'i' }, meta: { product_id: 99 } }) }; };
  const res = await unlockPremiumOnline('tool-x', 'KEY', { productId: 7, fetchImpl });
  assert.equal(res.reason, 'wrongProduct');
  assert.deepEqual(calls, ['activate', 'deactivate']);
  assert.equal(isPremiumUnlocked('tool-x'), false);
});

test('revalidation: fresh and offline never lock, revoked locks', async () => {
  const now = Date.now();
  await unlockPremiumOnline('tool-x', 'KEY', { productId: 7, fetchImpl: ok(), now });
  assert.equal(await revalidateLicense('tool-x', { now: now + 86400000 }), 'fresh');
  const later = now + 40 * 86400000;
  assert.equal(await revalidateLicense('tool-x', { now: later, fetchImpl: async () => { throw new Error('offline'); } }), 'offline');
  assert.equal(isPremiumUnlocked('tool-x'), true);
  assert.equal(await revalidateLicense('tool-x', { now: later, fetchImpl: reply({ valid: true }) }), 'ok');
  assert.equal(await revalidateLicense('tool-x', { now: later + 40 * 86400000, fetchImpl: reply({ valid: false, license_key: { status: 'disabled' } }) }), 'revoked');
  assert.equal(isPremiumUnlocked('tool-x'), false);
});
