// Dashboard "Today" contract: open tasks due today or overdue (and today's finished ones).
import { dueState, toggleItem, displayTitle } from './checklists.js';

const key = (list, item) => `${list.id}:${item.id}`;
const OVERDUE = { en: 'Overdue', de: 'Überfällig' };

export function todayEntries({ items, today, lang }) {
  const out = [];
  for (const list of items) {
    if (list.archived) continue;
    for (const item of list.items) {
      const state = item.done ? (item.due === today ? 'done' : null) : dueState(item, today);
      if (!state || state === 'later' || state === 'soon') continue;
      out.push({
        id: key(list, item),
        title: item.text,
        detail: state === 'overdue' ? `${displayTitle(list)} · ${OVERDUE[lang] ?? OVERDUE.en}` : displayTitle(list),
        state: state === 'today' ? 'due' : state,
        checkable: true,
      });
    }
  }
  return out;
}

export function toggleEntry({ items, id, today }) {
  for (const list of items) {
    const item = list.items.find((i) => key(list, i) === id);
    if (item) { toggleItem(item, today); return list; }
  }
  return null;
}
