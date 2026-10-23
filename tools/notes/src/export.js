// Notes -> Converter: turns a note into a Markdown file that the Converter turns into PDF or Word.
// The editor writes Markdown marks it typed itself with a backslash; they are removed so the file reads cleanly.

import { displayTitle } from './notes.js';

export const hasText = (note) => !!note && (note.title.trim() !== '' || note.body.trim() !== '');

/** Markdown of the note: the title as a heading, then the text. */
export function noteMarkdown(note) {
  const body = note.body.replace(/\\([\\`*_[\]#\-+.!()>])/g, '$1').trim();
  const title = note.title.trim();
  return [title && `# ${title}`, body].filter(Boolean).join('\n\n') + '\n';
}

/** A safe file name for the note, e.g. "Meeting.md". */
export function noteFileName(note, fallback = 'note') {
  const stem = (displayTitle(note) || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${stem || fallback}.md`;
}

/** The note as a file description for core/handoff.js. */
export function noteFile(note, fallback) {
  return { name: noteFileName(note, fallback), type: 'text/markdown', data: new TextEncoder().encode(noteMarkdown(note)) };
}
