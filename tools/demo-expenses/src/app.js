import { isPremiumUnlocked } from '../../../core/license.js';
import { saveItem, getAllItems, deleteItem } from '../../../core/storage.js';
import { registerMessages, t, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'demo-expenses';
const FREE_LIMIT = 3;
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: render });

async function render() {
  applyTranslations();
  const items = await getAllItems(SLUG);
  $('list').replaceChildren(...items.map((it) => {
    const li = document.createElement('li');
    li.className = 'ow-list__item';
    const text = document.createElement('span');
    text.textContent = it.text;
    const del = document.createElement('button');
    del.className = 'ow-btn ow-btn--secondary ow-btn--small';
    del.textContent = t('demo.delete');
    del.addEventListener('click', async () => { await deleteItem(SLUG, it.id); render(); });
    li.append(text, del);
    return li;
  }));
  shell.setPremiumLimit(t('demo.limitLabel', { limit: FREE_LIMIT }), t('demo.usage', { count: items.length, limit: FREE_LIMIT }));
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const items = await getAllItems(SLUG);
  if (!isPremiumUnlocked(SLUG) && items.length >= FREE_LIMIT) { shell.showLimit(); return; }
  await saveItem(SLUG, { text: $('text').value });
  $('text').value = '';
  render();
});

onLangChange(render);
render();
