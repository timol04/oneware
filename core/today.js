/**
 * today.js – the "Today" feed on My Dashboard.
 *
 * A tool opts in with `"today": true` in tool.config.json and ships `src/today.js` exporting:
 *   todayEntries({ items, today, lang })  -> [{ id, title, detail?, state, checkable? }]
 *       state: 'overdue' | 'due' | 'soon' | 'done'. Pure: reads the tool's stored items only.
 *   toggleEntry({ items, id, today })     -> the changed stored item (to be saved) or null
 *       Only needed for checkable entries; may mutate the item it returns.
 */
import { getAllItems, updateItem } from './storage.js';

const RANK = { overdue: 0, due: 1, soon: 2, done: 3 };

/** Entries of all given tools, most urgent first, finished ones last. Tools that fail to load are skipped. */
export async function collectToday(tools, { today, lang, base }) {
  const lists = await Promise.all(tools.map(async (tool) => {
    try {
      const [mod, items] = await Promise.all([import(`${base}${tool.slug}/src/today.js`), getAllItems(tool.slug)]);
      return mod.todayEntries({ items, today, lang }).map((entry) => ({ ...entry, tool }));
    } catch { return []; }
  }));
  return lists.flat().sort((a, b) => RANK[a.state] - RANK[b.state]);
}

/** Checks or unchecks one entry in its tool's own storage. Returns false when nothing changed. */
export async function toggleToday(entry, { today, base }) {
  const mod = await import(`${base}${entry.tool.slug}/src/today.js`);
  const items = await getAllItems(entry.tool.slug);
  const item = mod.toggleEntry({ items, id: entry.id, today });
  if (!item) return false;
  await updateItem(entry.tool.slug, item.id, item);
  return true;
}
