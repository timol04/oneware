// Pure subscription logic: schedules, costs, totals, history. No DOM, no storage.
// Dates are ISO strings (YYYY-MM-DD) and are handled in UTC so daylight saving never shifts a charge.

export const CYCLES = ['weekly', 'monthly', 'quarterly', 'yearly'];
export const CATEGORIES = ['streaming', 'music', 'software', 'cloud', 'news', 'fitness', 'gaming', 'finance', 'home', 'other'];
export const STATUSES = ['active', 'paused', 'cancelled'];
export const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP'];

const MONTHS_PER_CYCLE = { monthly: 1, quarterly: 3, yearly: 12 };
const DAY = 86400000;

// --- Dates ---
export const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const toISO = (date) => date.toISOString().slice(0, 10);
export const isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(parseISO(s)) === s;

/** Today's date on the user's calendar. */
export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const daysBetween = (fromISO, toISOStr) => Math.round((parseISO(toISOStr) - parseISO(fromISO)) / DAY);

/** Adds months to a date, keeping the wanted day of month where the target month has it (31 Jan + 1 month = 28/29 Feb). */
function addMonths(date, months, day) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first;
}

// --- Subscriptions ---
export function newSub(now = Date.now(), today = todayISO()) {
  return {
    name: '', cycle: 'monthly', category: 'other', status: 'active', note: '',
    start: today,
    prices: [{ from: today, price: 0 }],
    periods: [{ from: today, to: null }],
    created: now, updated: now,
  };
}

/** The k-th charge date (k = 0 is the start date). Calculated from the start so a clamped day never drifts. */
export function chargeDate(sub, k) {
  const start = parseISO(sub.start);
  if (sub.cycle === 'weekly') return toISO(new Date(start.getTime() + k * 7 * DAY));
  return toISO(addMonths(start, k * MONTHS_PER_CYCLE[sub.cycle], start.getUTCDate()));
}

/** Index of the first charge on or after a date (never negative). */
function firstChargeIndex(sub, onOrAfter) {
  if (onOrAfter <= sub.start) return 0;
  const days = daysBetween(sub.start, onOrAfter);
  let k = Math.max(0, Math.floor(days / (sub.cycle === 'weekly' ? 7 : MONTHS_PER_CYCLE[sub.cycle] * 31)) - 1);
  while (chargeDate(sub, k) < onOrAfter) k++;
  return k;
}

export function priceAt(sub, date) {
  let price = sub.prices[0].price;
  for (const p of sub.prices) if (p.from <= date) price = p.price;
  return price;
}

export const currentPrice = (sub, today) => priceAt(sub, today);

/** Whether the subscription is running on a date (it can have several periods when it was paused and resumed). */
export const isRunningOn = (sub, date) => sub.periods.some((p) => p.from <= date && (p.to === null || date <= p.to));

export const isActive = (sub) => sub.status === 'active';

/** Next charge on or after today, or null when the subscription is paused or cancelled. */
export function nextCharge(sub, today) {
  if (!isActive(sub)) return null;
  const date = chargeDate(sub, firstChargeIndex(sub, today));
  return { date, price: priceAt(sub, date) };
}

/** All charges that really happened or are due in [from, to], in date order. */
export function chargesBetween(sub, from, to) {
  const out = [];
  for (let k = firstChargeIndex(sub, from); ; k++) {
    const date = chargeDate(sub, k);
    if (date > to) break;
    if (isRunningOn(sub, date)) out.push({ date, price: priceAt(sub, date) });
  }
  return out;
}

export function monthlyCost(price, cycle) {
  if (cycle === 'weekly') return price * 52 / 12;
  return price / MONTHS_PER_CYCLE[cycle];
}

export const monthlyOf = (sub, today) => monthlyCost(currentPrice(sub, today), sub.cycle);

/** Changes the price from today on, keeping earlier prices for the history. */
export function applyPrice(sub, price, today) {
  if (currentPrice(sub, today) === price) return;
  if (sub.prices.length === 1 && today <= sub.start) { sub.prices = [{ from: sub.start, price }]; return; }
  const same = sub.prices.find((p) => p.from === today);
  if (same) same.price = price; else sub.prices.push({ from: today, price });
  sub.prices.sort((a, b) => a.from.localeCompare(b.from));
}

/** Moves the start date; the first price and period follow it. */
export function applyStart(sub, start) {
  sub.start = start;
  sub.prices[0].from = start;
  sub.periods[0].from = start;
  sub.prices.sort((a, b) => a.from.localeCompare(b.from));
}

/** Pauses or cancels (ends the open period today) or resumes (opens a new one). */
export function setStatus(sub, status, today) {
  if (status === sub.status) return;
  const open = sub.periods[sub.periods.length - 1];
  if (status === 'active') sub.periods.push({ from: today, to: null });
  else if (open.to === null) open.to = today < open.from ? open.from : today;
  sub.status = status;
}

// --- Overview ---
export function totals(subs, today) {
  const active = subs.filter(isActive);
  const monthly = active.reduce((sum, s) => sum + monthlyOf(s, today), 0);
  return { monthly, yearly: monthly * 12, active: active.length, inactive: subs.length - active.length };
}

/** Active subscriptions with their next charge, soonest first. */
export function upcoming(subs, today) {
  return subs.filter(isActive)
    .map((sub) => ({ sub, ...nextCharge(sub, today) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.sub.name.localeCompare(b.sub.name));
}

/** Money due within the next `days` days (today included). */
export function dueWithin(subs, today, days) {
  const end = toISO(new Date(parseISO(today).getTime() + days * DAY));
  return subs.filter(isActive).flatMap((s) => chargesBetween(s, today, end)).reduce((sum, c) => sum + c.price, 0);
}

// --- Analysis ---
/** Spending per calendar month for the last `months` months, the current month last. */
export function monthlySeries(subs, today, months = 12) {
  const now = parseISO(today);
  const list = [];
  for (let i = months - 1; i >= 0; i--) {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    const from = toISO(first);
    const to = toISO(last);
    const total = subs.flatMap((s) => chargesBetween(s, from, to)).reduce((sum, c) => sum + c.price, 0);
    list.push({ month: from.slice(0, 7), total });
  }
  return list;
}

/** Monthly cost of active subscriptions per category, biggest first. */
export function byCategory(subs, today) {
  const map = new Map();
  for (const s of subs.filter(isActive)) map.set(s.category, (map.get(s.category) ?? 0) + monthlyOf(s, today));
  const sum = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map].map(([category, monthly]) => ({ category, monthly, share: sum ? monthly / sum : 0 }))
    .sort((a, b) => b.monthly - a.monthly || a.category.localeCompare(b.category));
}

/** Subscriptions whose price changed, with first and latest price. */
export function priceChanges(subs, today) {
  return subs.filter((s) => s.prices.length > 1).map((sub) => {
    const first = sub.prices[0].price;
    const last = currentPrice(sub, today);
    return { sub, first, last, change: first ? (last - first) / first : 0 };
  }).sort((a, b) => b.change - a.change);
}

export const visibleSubs = (subs, view) => subs.filter((s) => (view === 'active') === isActive(s));

/** Accepts "12.90" and "12,90"; returns null for anything else or a negative number. */
export function parsePrice(text) {
  const n = Number(String(text).trim().replace(',', '.'));
  return text !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
