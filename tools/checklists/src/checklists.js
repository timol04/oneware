// Pure checklist logic: items, progress, due dates, repeats, filtering. No DOM, no storage.

export const REPEATS = ['daily', 'weekly', 'monthly'];

let counter = 0;
const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newList(now = Date.now()) {
  return { title: '', items: [], pinned: false, archived: false, created: now, updated: now };
}

/** New items are due today and do not repeat. */
export function newItem(text = '', today = isoDate()) {
  return { id: newId(), text, done: false, due: today, repeat: null, sub: [] };
}

export const newSubItem = (text = '') => ({ id: newId(), text, done: false });

/** Local date as YYYY-MM-DD. */
export function isoDate(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

/** Next due date of a repeating task, counted from `from` (never in the past relative to `today`). */
export function nextDue(from, repeat, today = isoDate()) {
  let d = parse(from ?? today);
  const step = () => {
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else {
      const day = d.getDate();
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, last));
    }
  };
  do step(); while (isoDate(d) <= today);
  return isoDate(d);
}

/** 'overdue' | 'today' | 'soon' (within 2 days) | 'later' | null (no date or already done). */
export function dueState(item, today = isoDate()) {
  if (!item.due || item.done) return null;
  if (item.due < today) return 'overdue';
  if (item.due === today) return 'today';
  const soon = parse(today);
  soon.setDate(soon.getDate() + 2);
  return item.due <= isoDate(soon) ? 'soon' : 'later';
}

/**
 * Checks or unchecks an item. A repeating item is not finished when checked: it moves on to its next due date.
 * Checking the item also checks its sub-items; a repeating item resets them for the next round.
 * Returns true when the item stayed open because it repeats.
 */
export function toggleItem(item, today = isoDate()) {
  if (!item.done && item.repeat) {
    item.due = nextDue(item.due, item.repeat, today);
    for (const s of item.sub) s.done = false;
    return true;
  }
  item.done = !item.done;
  for (const s of item.sub) s.done = item.done;
  return false;
}

/** Checks a sub-item; the parent follows when all sub-items are done (and reopens when one is unchecked). */
export function toggleSub(item, subId) {
  const sub = item.sub.find((s) => s.id === subId);
  if (!sub) return;
  sub.done = !sub.done;
  item.done = item.sub.length > 0 && item.sub.every((s) => s.done);
}

/** Counts every top-level item without sub-items and every sub-item as one task. */
export function progress(list) {
  let done = 0;
  let total = 0;
  for (const it of list.items) {
    if (it.sub.length) { total += it.sub.length; done += it.sub.filter((s) => s.done).length; }
    else { total += 1; if (it.done) done += 1; }
  }
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

export const overdueCount = (list, today = isoDate()) => list.items.filter((i) => dueState(i, today) === 'overdue').length;

export function clearCompleted(list) {
  const before = list.items.length;
  list.items = list.items.filter((i) => !i.done);
  return before - list.items.length;
}

/** Moves the item at `index` by `delta` positions; returns false when it cannot move. */
export function moveItem(items, index, delta) {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return false;
  const [it] = items.splice(index, 1);
  items.splice(to, 0, it);
  return true;
}

/** Title shown in the list: the title, else the first item. */
export function displayTitle(list) {
  return list.title.trim() || list.items[0]?.text.trim() || '';
}

/** Filters and sorts lists. view: 'lists' | 'archive'. Pinned first, then newest edit first. */
export function visibleLists(lists, { view = 'lists', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  const text = (l) => [l.title, ...l.items.flatMap((i) => [i.text, ...i.sub.map((s) => s.text)])].join('\n').toLowerCase();
  return lists
    .filter((l) => (view === 'archive') === !!l.archived)
    .filter((l) => !q || text(l).includes(q))
    .sort((a, b) => (b.pinned - a.pinned) || b.updated - a.updated);
}

