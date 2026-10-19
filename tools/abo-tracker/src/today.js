// Dashboard "Today" contract: charges due today and in the next three days (not checkable, opens the tool).
import { nextCharge, daysBetween } from './subs.js';

const SOON_DAYS = 3;
const IN_DAYS = { en: (n) => (n === 1 ? 'Tomorrow' : `In ${n} days`), de: (n) => (n === 1 ? 'Morgen' : `In ${n} Tagen`) };

function currency() {
  try { return localStorage.getItem('abo-tracker:currency') || 'CHF'; } catch { return 'CHF'; }
}

export function todayEntries({ items, today, lang }) {
  const money = new Intl.NumberFormat(lang, { style: 'currency', currency: currency() });
  const out = [];
  for (const sub of items) {
    const next = nextCharge(sub, today);
    if (!next) continue;
    const days = daysBetween(today, next.date);
    if (days > SOON_DAYS) continue;
    out.push({
      id: sub.id,
      title: sub.name,
      detail: days === 0 ? money.format(next.price) : `${(IN_DAYS[lang] ?? IN_DAYS.en)(days)} · ${money.format(next.price)}`,
      state: days === 0 ? 'due' : 'soon',
    });
  }
  return out;
}

export const toggleEntry = () => null;
