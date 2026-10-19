// Pure note logic: titles, filtering, sorting, tags. No DOM, no storage.

export const FREE_LIMIT = 20;
export const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

export function newNote(now = Date.now()) {
  return { title: '', body: '', tags: [], color: null, pinned: false, archived: false, created: now, updated: now };
}

/** Title shown in the list: the title, else the first line of the text. */
export function displayTitle(note) {
  const title = note.title.trim();
  if (title) return title;
  const first = note.body.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean);
  return first ?? '';
}

/** Short plain-text preview of the body (Markdown marks removed). */
export function snippet(note, max = 90) {
  const lines = note.body.split('\n').map((l) => l.trim()).filter(Boolean);
  const rest = note.title.trim() ? lines : lines.slice(1);
  return rest.map((l) => l.replace(/^(#+\s*|>\s*|[-*]\s+|\d+\.\s+)/, '')).join(' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').slice(0, max);
}

/** Normalizes a tag: trimmed, lower case, no leading #, single words joined by dashes. */
export function normalizeTag(tag) {
  return tag.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').slice(0, 24);
}

export function parseTags(text) {
  return [...new Set(text.split(/[,\n]/).map(normalizeTag).filter(Boolean))];
}

/** All tags with counts, most used first (archived notes do not count). */
export function tagCounts(notes) {
  const counts = new Map();
  for (const n of notes) if (!n.archived) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * Filters and sorts notes. view: 'notes' | 'archive'; tag: null or a tag; query: free text.
 * Pinned notes come first, then newest edit first.
 */
export function visibleNotes(notes, { view = 'notes', tag = null, query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return notes
    .filter((n) => (view === 'archive') === !!n.archived)
    .filter((n) => !tag || n.tags.includes(tag))
    .filter((n) => !q || `${n.title}\n${n.body}\n${n.tags.join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => (b.pinned - a.pinned) || b.updated - a.updated);
}

export const atLimit = (count, premium) => !premium && count >= FREE_LIMIT;
