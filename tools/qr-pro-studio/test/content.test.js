import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, build, fileName, TYPE_IDS } from '../src/content.js';

test('analyze detects links, addresses and text', () => {
  assert.deepEqual(analyze('your-shop.com/menu'), { kind: 'url', data: 'https://your-shop.com/menu', bytes: 26 });
  assert.equal(analyze('a@b.ch').data, 'mailto:a@b.ch');
  assert.equal(analyze('hello world').kind, 'text');
});

test('url and text', () => {
  assert.equal(build('url', { url: 'example.com' }).data, 'https://example.com');
  assert.equal(build('url', { url: 'a b' }), null);
  assert.equal(build('text', { text: '  hi ' }).data, 'hi');
  assert.equal(build('text', { text: '' }), null);
});

test('wifi escapes special characters and handles open networks', () => {
  assert.equal(build('wifi', { ssid: 'My;Net', password: 'p:w"d', security: 'WPA' }).data, 'WIFI:T:WPA;S:My\\;Net;P:p\\:w\\"d;;');
  assert.equal(build('wifi', { ssid: 'Guest', password: 'ignored', security: 'nopass', hidden: true }).data, 'WIFI:T:nopass;S:Guest;H:true;;');
  assert.equal(build('wifi', { ssid: '' }), null);
});

test('contact builds a vCard', () => {
  const { data } = build('contact', { first: 'Ada', last: 'Lovelace', phone: '+41 79 000 00 00', email: 'ada@example.com', url: 'example.com' });
  assert.match(data, /^BEGIN:VCARD\nVERSION:3\.0\nN:Lovelace;Ada;;;\nFN:Ada Lovelace\n/);
  assert.match(data, /TEL:\+41 79 000 00 00\nEMAIL:ada@example.com\nURL:https:\/\/example.com\nEND:VCARD$/);
  assert.equal(build('contact', {}), null);
});

test('email, phone, sms', () => {
  assert.equal(build('email', { to: 'a@b.ch', subject: 'Hi there', body: 'A&B' }).data, 'mailto:a@b.ch?subject=Hi%20there&body=A%26B');
  assert.equal(build('email', { to: 'nope' }), null);
  assert.equal(build('phone', { phone: '+41 (79) 123-45-67' }).data, 'tel:+41791234567');
  assert.equal(build('phone', { phone: 'abc' }), null);
  assert.equal(build('sms', { phone: '0791234567', message: 'Hi' }).data, 'SMSTO:0791234567:Hi');
});

test('location validates ranges and accepts decimal commas', () => {
  assert.equal(build('location', { lat: '47,3769', lng: '8.5417' }).data, 'geo:47.3769,8.5417');
  assert.equal(build('location', { lat: '91', lng: '0' }), null);
  assert.equal(build('location', { lat: '', lng: '0' }), null);
});

test('event builds an iCalendar entry', () => {
  const { data } = build('event', { title: 'Launch, day 1', start: '2026-10-19T14:30', end: '2026-10-19T16:00', place: 'Zurich' });
  assert.equal(data, 'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Launch\\, day 1\nDTSTART:20261019T143000\nDTEND:20261019T160000\nLOCATION:Zurich\nEND:VEVENT\nEND:VCALENDAR');
  assert.equal(build('event', { title: 'x' }), null);
});

test('app only accepts store links', () => {
  assert.equal(build('app', { store: 'apps.apple.com/app/id1' }).data, 'https://apps.apple.com/app/id1');
  assert.equal(build('app', { store: 'https://play.google.com/store/apps/details?id=a.b' }).kind, 'app');
  assert.equal(build('app', { store: 'https://example.com' }), null);
});

test('file names and type list', () => {
  assert.equal(fileName({ kind: 'url', data: 'https://www.your-shop.ch/menu' }), 'qr-your-shop-ch');
  assert.equal(fileName({ kind: 'wifi', data: 'x' }), 'qr-wifi');
  assert.equal(fileName({ kind: 'text', data: 'x' }), 'qr-code');
  assert.equal(TYPE_IDS.length, 10);
});
