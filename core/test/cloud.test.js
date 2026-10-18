import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBrowser, getCloudSupport } from '../cloud.js';

const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
};
const win = (ua, picker = true) => ({ navigator: { userAgent: ua }, isSecureContext: true, ...(picker ? { showDirectoryPicker() {} } : {}) });

test('detects browser families', () => {
  assert.deepEqual(detectBrowser(UA.chrome), { name: 'Chrome', version: 126 });
  assert.equal(detectBrowser(UA.edge).name, 'Edge');
  assert.equal(detectBrowser(UA.safari).name, 'Safari');
  assert.equal(detectBrowser(UA.firefox).name, 'Firefox');
});

test('cloud folder needs the picker API on a desktop browser', () => {
  assert.equal(getCloudSupport(win(UA.chrome)).supported, true);
  assert.equal(getCloudSupport(win(UA.edge)).supported, true);
  assert.equal(getCloudSupport(win(UA.safari, false)).supported, false);
  assert.equal(getCloudSupport(win(UA.firefox, false)).supported, false);
  assert.equal(getCloudSupport(win(UA.androidChrome)).supported, false);
});
