// Pure journal logic: entries per day, mood, tags, streaks, calendar, filtering. No DOM, no storage.
// Dates are local YYYY-MM-DD strings; weeks start on Monday.

export const FREE_LIMIT = 30;
export const MOODS = [1, 2, 3, 4, 5];

export function newEntry(date, now = Date.now()) {
  return { date, title: '', body: '', mood: null, tags: [], created: now, updated: now };
}

/** Local date as YYYY-MM-DD. */
export function isoDate(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export const parseDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

export function addDays(iso, n) {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** Title shown in the list: the title, else the first line of the text. */
export function displayTitle(entry) {
  const title = entry.title.trim();
  if (title) return title;
  const first = entry.body.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean);
  return first ?? '';
}

/** Short plain-text preview of the body (Markdown marks removed). */
export function snippet(entry, max = 90) {
  const lines = entry.body.split('\n').map((l) => l.trim()).filter(Boolean);
  const rest = entry.title.trim() ? lines : lines.slice(1);
  return rest.map((l) => l.replace(/^(#+\s*|>\s*|[-*]\s+|\d+\.\s+)/, '')).join(' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').slice(0, max);
}

export function normalizeTag(tag) {
  return tag.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').slice(0, 24);
}

export function parseTags(text) {
  return [...new Set(text.split(/[,\n]/).map(normalizeTag).filter(Boolean))];
}

/** All tags with counts, most used first. */
export function tagCounts(entries) {
  const counts = new Map();
  for (const e of entries) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export const hasContent = (entry) => !!(entry.title.trim() || entry.body.trim() || entry.mood || entry.tags.length);

/** Entries with text, mood or tag. Empty ones are not worth keeping. */
export const entryOn = (entries, date) => entries.find((e) => e.date === date) ?? null;

/** Filters by tag and free text; newest day first. */
export function visibleEntries(entries, { tag = null, query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return entries
    .filter((e) => !tag || e.tags.includes(tag))
    .filter((e) => !q || `${e.title}\n${e.body}\n${e.tags.join(' ')}\n${e.date}`.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Days in a row with an entry, ending today (or yesterday while today is still open), and the best run ever. */
export function streaks(entries, today) {
  const days = new Set(entries.filter(hasContent).map((e) => e.date));
  let current = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) { current++; d = addDays(d, -1); }
  let best = 0;
  let run = 0;
  let prev = null;
  for (const day of [...days].sort()) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return { current, best };
}

/** Average mood of the entries in the last `days` days, or null. */
export function averageMood(entries, today, days = 30) {
  const from = addDays(today, -(days - 1));
  const moods = entries.filter((e) => e.mood && e.date >= from && e.date <= today).map((e) => e.mood);
  return moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
}

/** Weeks of a month as ISO dates, Monday first, padded with the neighbouring months. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => isoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i)));
    if (w >= 4 && parseDay(week[0]).getMonth() !== month) break;
    weeks.push(week);
  }
  return weeks;
}

export const atLimit = (count, premium) => !premium && count >= FREE_LIMIT;
