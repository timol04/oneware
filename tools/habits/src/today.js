// Dashboard "Today" contract: habits planned today (paused and archived ones are left out).
import { isDue, toggleDay, displayTitle } from './habits.js';

export function todayEntries({ items, today }) {
  return items
    .filter((h) => !h.archived && isDue(h, today))
    .map((h) => ({ id: h.id, title: displayTitle(h), state: h.done[today] ? 'done' : 'due', checkable: true }));
}

export function toggleEntry({ items, id, today }) {
  const habit = items.find((h) => h.id === id);
  if (!habit) return null;
  toggleDay(habit, today);
  return habit;
}
