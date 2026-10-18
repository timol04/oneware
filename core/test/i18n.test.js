import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, localize, registerMessages, availableLanguages, getLang, setLang, languageName } from '../i18n.js';

test('English is the default language', () => {
  assert.equal(getLang(), 'en');
  assert.equal(t('core.license.unlock'), 'Unlock');
});

test('unknown keys fall back to the key, params are interpolated', () => {
  assert.equal(t('does.not.exist'), 'does.not.exist');
  registerMessages('en', { 'test.greet': 'Hello {name}, {missing}' });
  assert.equal(t('test.greet', { name: 'Ada' }), 'Hello Ada, {missing}');
});

test('a new language is added by registering a dictionary', () => {
  registerMessages('xx', { 'lang.name': 'Testish', 'core.license.unlock': 'UNLOCK-XX' });
  assert.ok(availableLanguages().includes('xx'));
  assert.equal(languageName('xx'), 'Testish');
  assert.equal(setLang('xx', { persist: false }), true);
  assert.equal(t('core.license.unlock'), 'UNLOCK-XX');
  assert.equal(t('core.license.cancel'), 'Cancel'); // falls back to English
  assert.equal(localize({ en: 'Name', xx: 'Nom' }), 'Nom');
  assert.equal(setLang('nope', { persist: false }), false);
  setLang('en', { persist: false });
  assert.equal(localize({ de: 'x' }), 'x');
  assert.equal(localize('plain'), 'plain');
});
