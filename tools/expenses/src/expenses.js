// Pure bookkeeping logic: bookings, month totals, category split, 12-month series. No DOM, no storage.
// Dates are ISO strings (YYYY-MM-DD), months are "YYYY-MM". Amounts are positive; `type` says in or out.

export const TYPES = ['expense', 'income'];
export const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP'];
export const CATEGORIES = {
  expense: ['groceries', 'eating', 'housing', 'bills', 'transport', 'shopping', 'leisure', 'health', 'travel', 'other'],
  income: ['salary', 'side', 'gift', 'refund', 'otherIn'],
};

// --- Dates ---
export const isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Today's date on the user's calendar. */
export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const monthOf = (date) => date.slice(0, 7);

/** Moves a "YYYY-MM" month by `delta` months. */
export function shiftMonth(month, delta) {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// --- Bookings ---
export function newEntry(now = Date.now(), today = todayISO()) {
  return { type: 'expense', amount: 0, category: 'other', date: today, note: '', created: now, updated: now };
}


/** Accepts "12.90" and "12,90"; returns null for anything else, zero or a negative number. */
export function parseAmount(text) {
  const n = Number(String(text).trim().replace(',', '.'));
  return text !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Keeps the category valid for the type (switching expense to income resets it). */
export const categoryFor = (type, category) => (CATEGORIES[type].includes(category) ? category : CATEGORIES[type][CATEGORIES[type].length - 1]);

const byNewest = (a, b) => b.date.localeCompare(a.date) || b.created - a.created;

export const inMonth = (entries, month) => entries.filter((e) => monthOf(e.date) === month);

/** Bookings of a month, optionally narrowed by type ('all' | 'expense' | 'income') and a search text (note or category label). */
export function listMonth(entries, month, { type = 'all', query = '', label = (c) => c } = {}) {
  const q = query.trim().toLowerCase();
  return inMonth(entries, month)
    .filter((e) => type === 'all' || e.type === type)
    .filter((e) => !q || e.note.toLowerCase().includes(q) || label(e.category).toLowerCase().includes(q))
    .sort(byNewest);
}

/** Groups newest-first bookings by day: [{ date, entries, net }]. */
export function groupByDay(list) {
  const days = [];
  for (const e of list) {
    let day = days[days.length - 1];
    if (!day || day.date !== e.date) { day = { date: e.date, entries: [], net: 0 }; days.push(day); }
    day.entries.push(e);
    day.net += e.type === 'income' ? e.amount : -e.amount;
  }
  return days;
}

const round = (n) => Math.round(n * 100) / 100;

export function monthTotals(entries, month) {
  let income = 0;
  let expense = 0;
  for (const e of inMonth(entries, month)) { if (e.type === 'income') income += e.amount; else expense += e.amount; }
  return { income: round(income), expense: round(expense), balance: round(income - expense) };
}

/** Amount per category for one type within the given months, biggest first, with the share of the type's total. */
export function byCategory(entries, months, type = 'expense') {
  const set = new Set(months);
  const map = new Map();
  for (const e of entries) if (e.type === type && set.has(monthOf(e.date))) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  const sum = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map].map(([category, amount]) => ({ category, amount: round(amount), share: sum ? amount / sum : 0 }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

/** Income and expenses per month for the `months` months ending at `month`, the latest last. */
export function monthlySeries(entries, month, months = 12) {
  const list = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = shiftMonth(month, -i);
    list.push({ month: m, ...monthTotals(entries, m) });
  }
  return list;
}

/** Average monthly income and expenses over the months of a series that have any booking. */
export function averages(series) {
  const used = series.filter((m) => m.income || m.expense);
  if (!used.length) return { months: 0, income: 0, expense: 0 };
  const sum = (k) => used.reduce((a, m) => a + m[k], 0) / used.length;
  return { months: used.length, income: round(sum('income')), expense: round(sum('expense')) };
}

/** Latest month that has a booking, or `fallback`. */
export function latestMonth(entries, fallback) {
  return entries.reduce((m, e) => (monthOf(e.date) > m ? monthOf(e.date) : m), fallback);
}
