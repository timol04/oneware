// Notes -> Checklists: finds the tasks of a note and copies them into a new, independent checklist.
// Tasks are the list items of the note (bulleted or numbered, as made with the editor's list buttons).
// If the note has Markdown checkboxes ("- [ ] / - [x]"), only those count and keep their done state.
// The note is never touched. The checklist is built with the Checklists tool's own data model.

import { saveItem, getAllItems } from '../../../core/storage.js';
import { newList, newItem, isoDate, atLimit } from '../../checklists/src/checklists.js';
import { displayTitle } from './notes.js';

export const CHECKLISTS = 'checklists';
const MAX_TITLE = 120; // maxlength of the checklist title field
const MAX_TEXT = 200; // maxlength of a checklist entry

// "- [ ] text", "* [x] text", "+ [X] text". The note editor stores Markdown marks it wrote itself with a backslash
// ("\- \[ \] text"), so those are accepted too.
const TASK = /^[ \t]*\\?[-*+][ \t]+\\?\[([ xX])\\?\][ \t]+(.+)$/;

// Plain list items: "- text", "* text", "+ text", "1. text" (also with the backslash the editor adds to typed marks).
const ITEM = /^[ \t]*(?:\\?[-*+]|\d+\\?[.)])[ \t]+(.+)$/;

/** Removes Markdown formatting from a task text: escapes, bold, italic, code; links keep their address. */
function plain(md) {
  const kept = [];
  let s = md.replace(/\\([\\`*_[\]#\-+.!()>])/g, (_, c) => `\u0000${kept.push(c) - 1}\u0000`);
  s = s
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) => (text === url ? url : `${text} (${url})`))
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1$2');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

/** Tasks of a note in order: [{ text, done }]. Empty tasks and tasks inside code blocks are ignored. */
export function extractTasks(body) {
  const checks = [];
  const items = [];
  let fenced = false;
  for (const line of String(body ?? '').split(/\r\n|\r|\n/)) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = TASK.exec(line);
    if (m) {
      const text = plain(m[2]);
      if (text) checks.push({ text, done: m[1] !== ' ' });
      continue;
    }
    const li = ITEM.exec(line);
    const text = li && plain(li[1]);
    if (text) items.push({ text, done: false });
  }
  return checks.length ? checks : items;
}

/** Title of the new checklist: the note title, else the first line of the note, else the fallback. */
export function checklistTitle(note, fallback) {
  return (note.title.trim() || displayTitle(note) || fallback).slice(0, MAX_TITLE);
}

/** A new checklist (not yet stored) with one entry per task, due today like entries made in Checklists. */
export function buildChecklist(note, tasks, { fallbackTitle, now = Date.now(), today = isoDate() } = {}) {
  const list = newList(now);
  list.title = checklistTitle(note, fallbackTitle);
  list.items = tasks.map(({ text, done }) => ({ ...newItem(text, today), done }));
  return list;
}

/** Number of checklists that count against the free limit (all of them, archived ones included). */
export async function checklistCount() {
  return (await getAllItems(CHECKLISTS)).length;
}

/**
 * Copies the tasks of a note into a new checklist.
 * Returns { status: 'created', list } or { status: 'limit' } (free limit of Checklists reached, nothing stored)
 * or { status: 'empty' } when the note has no tasks. `premium` is the Checklists license state.
 */
export async function createChecklistFromNote(note, { premium, fallbackTitle, now, today } = {}) {
  const tasks = extractTasks(note.body);
  if (!tasks.length) return { status: 'empty' };
  if (atLimit(await checklistCount(), premium)) return { status: 'limit' };
  const list = await saveItem(CHECKLISTS, buildChecklist(note, tasks, { fallbackTitle, now, today }));
  return { status: 'created', list };
}
