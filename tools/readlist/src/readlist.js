// Pure reading-list logic: entries, status, progress, rating, tags, filtering, stats. No DOM, no storage.

export const TYPES = ['book', 'film', 'series', 'article'];
export const STATUSES = ['todo', 'doing', 'done'];
export const TYPE_ICONS = { book: 'book', film: 'film', series: 'tv', article: 'note' };

let counter = 0;
const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Local date as YYYY-MM-DD. */
export function isoDate(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function newEntry(type = 'book', now = Date.now()) {
  return {
    title: '', type, status: 'todo', creator: '', link: '', rating: 0, note: '', tags: [],
    current: 0, total: 0, started: null, finished: null, archived: false, created: now, updated: now,
  };
}

/** Unit of progress for a type. */
export const progressUnit = (type) => ({ book: 'pages', film: 'minutes', series: 'episodes', article: 'minutes' }[type]);

/** Sets the status and keeps dates and progress consistent. */
export function setStatus(entry, status, today = isoDate()) {
  if (!STATUSES.includes(status)) return;
  entry.status = status;
  if (status === 'doing') { entry.started ||= today; entry.finished = null; }
  else if (status === 'done') {
    entry.started ||= today;
    entry.finished ||= today;
    if (entry.total) entry.current = entry.total;
  } else { entry.finished = null; }
}

/** Percent 0..100, or null when there is no total. */
export function percent(entry) {
  if (!entry.total || entry.total <= 0) return entry.status === 'done' ? 100 : null;
  return Math.max(0, Math.min(100, Math.round((entry.current / entry.total) * 100)));
}

/** Clamps progress numbers; reaching the total on an open entry does not finish it by itself. */
export function setProgress(entry, current, total = entry.total) {
  const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
  entry.total = num(total);
  entry.current = entry.total ? Math.min(num(current), entry.total) : num(current);
}

/** Splits "a, b;c" into unique lowercase-insensitive tags, keeping the first spelling. */
export function parseTags(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text).split(/[,;\n]/)) {
    const tag = raw.trim().replace(/^#/, '').slice(0, 30);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

/** All tags in use with their counts, most used first. */
export function allTags(entries) {
  const map = new Map();
  for (const e of entries) {
    if (e.archived) continue;
    for (const tag of e.tags) {
      const k = tag.toLowerCase();
      const cur = map.get(k) ?? { tag, count: 0 };
      cur.count += 1;
      map.set(k, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export const displayTitle = (e) => e.title.trim() || e.creator.trim() || '';

/**
 * Filters and sorts entries. view: 'list' | 'archive'. status / type / tag: '' for all.
 * Open work first (doing, todo, done), then newest edit first.
 */
export function visibleEntries(entries, { view = 'list', query = '', status = '', type = '', tag = '' } = {}) {
  const q = query.trim().toLowerCase();
  const order = { doing: 0, todo: 1, done: 2 };
  const text = (e) => [e.title, e.creator, e.note, e.link, ...e.tags].join('\n').toLowerCase();
  return entries
    .filter((e) => (view === 'archive') === !!e.archived)
    .filter((e) => !status || e.status === status)
    .filter((e) => !type || e.type === type)
    .filter((e) => !tag || e.tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
    .filter((e) => !q || text(e).includes(q))
    .sort((a, b) => (order[a.status] - order[b.status]) || b.updated - a.updated);
}

/** Finished entries of a year: counts per type, total and average rating (null without ratings). */
export function yearStats(entries, year) {
  const done = entries.filter((e) => e.status === 'done' && e.finished?.startsWith(`${year}-`));
  const byType = Object.fromEntries(TYPES.map((t) => [t, done.filter((e) => e.type === t).length]));
  const rated = done.filter((e) => e.rating > 0);
  const average = rated.length ? Math.round((rated.reduce((s, e) => s + e.rating, 0) / rated.length) * 10) / 10 : null;
  return { total: done.length, byType, average };
}

export const counts = (entries) => {
  const live = entries.filter((e) => !e.archived);
  return { todo: live.filter((e) => e.status === 'todo').length, doing: live.filter((e) => e.status === 'doing').length, done: live.filter((e) => e.status === 'done').length };
};

/** Only http(s) links are kept so a stored link can never run script. */
export function safeLink(url) {
  const v = String(url).trim();
  if (!v) return '';
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch { return ''; }
}

