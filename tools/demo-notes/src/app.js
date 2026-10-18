import { isPremiumUnlocked } from '../../../core/license.js';
import { saveItem, getAllItems, deleteItem, exportData, importData } from '../../../core/storage.js';
import { createIcon } from '../../../core/icons.js';
import { registerMessages, t, localize, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { createPrivacyBanner, createUpgradeButton, createStatusBadge, mountToolbar, showLicenseDialog } from '../../../core/ui-components.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'demo-notes';
const FREE_LIMIT = 3;
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

mountToolbar($('toolbar'));
createPrivacyBanner({}, $('privacy'));

function button(label, onClick, secondary = true) {
  const b = document.createElement('button');
  b.className = `ow-btn${secondary ? ' ow-btn--secondary' : ''}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

async function render() {
  applyTranslations();
  document.title = `${localize(config.name)} – oneware`;
  $('title').replaceChildren(createIcon(config.icon, { size: '.9em' }), localize(config.name));
  $('freeinfo').textContent = t('demo.freeInfo', { limit: FREE_LIMIT });

  const premium = isPremiumUnlocked(SLUG);
  $('premium').replaceChildren(createStatusBadge(premium ? 'green' : 'yellow', t(premium ? 'demo.premium' : 'demo.free')));

  const items = await getAllItems(SLUG);
  $('list').replaceChildren(...items.map((it) => {
    const li = document.createElement('li');
    li.className = 'ow-list__item';
    const text = document.createElement('span');
    text.textContent = it.text;
    li.append(text, button(t('demo.delete'), async () => { await deleteItem(SLUG, it.id); render(); }));
    return li;
  }));

  const actions = $('actions');
  actions.replaceChildren(button(t('demo.export'), () => exportData(SLUG)));
  const file = document.createElement('input');
  file.type = 'file'; file.accept = 'application/json'; file.hidden = true;
  file.addEventListener('change', async () => {
    try { await importData(SLUG, file.files[0]); $('error').textContent = ''; }
    catch (e) { $('error').textContent = e.message; }
    render();
  });
  actions.append(button(t('demo.import'), () => file.click()), file);
  if (!premium) {
    actions.append(button(t('core.license.enter'), () => showLicenseDialog({ toolSlug: SLUG, purchaseUrl: config.purchaseUrl, onUnlock: render })));
    createUpgradeButton({ url: config.purchaseUrl }, actions);
  }
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const items = await getAllItems(SLUG);
  if (!isPremiumUnlocked(SLUG) && items.length >= FREE_LIMIT) {
    $('error').textContent = t('demo.limitReached', { limit: FREE_LIMIT });
    return;
  }
  $('error').textContent = '';
  await saveItem(SLUG, { text: $('text').value });
  $('text').value = '';
  render();
});

onLangChange(render);
render();
