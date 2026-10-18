import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { backupReminderDue, markExported, dismissBackupReminder, BACKUP_INTERVAL_DAYS } from '../persistence.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
beforeEach(() => mem.clear());
const DAY = 86400000;

test('no reminder without data', () => assert.equal(backupReminderDue('t', 0), false));
test('reminder when data exists and never exported', () => assert.equal(backupReminderDue('t', 3), true));
test('no reminder right after an export, reminder after the interval', () => {
  const now = Date.now();
  markExported('t', now);
  assert.equal(backupReminderDue('t', 3, now + DAY), false);
  assert.equal(backupReminderDue('t', 3, now + (BACKUP_INTERVAL_DAYS + 1) * DAY), true);
});
test('dismissing silences the reminder for the interval', () => {
  const now = Date.now();
  dismissBackupReminder('t', now);
  assert.equal(backupReminderDue('t', 3, now + DAY), false);
  assert.equal(backupReminderDue('t', 3, now + (BACKUP_INTERVAL_DAYS + 1) * DAY), true);
});
