// Dashboard "Today" contract: one reminder to write today's entry, done once the day has content.
import { hasContent } from './journal.js';

const TITLE = { en: 'Write journal entry', de: 'Journal-Eintrag schreiben' };

export function todayEntries({ items, today, lang }) {
  const entry = items.find((e) => e.date === today);
  return [{ id: 'today', title: TITLE[lang] ?? TITLE.en, state: entry && hasContent(entry) ? 'done' : 'due', checkable: false }];
}
