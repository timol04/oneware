import { isPremiumUnlocked } from '../../../core/license.js';
import { saveItem, getAllItems, deleteItem, exportData, importData } from '../../../core/storage.js';
import { createPrivacyBanner, createUpgradeButton, createStatusBadge, showLicenseDialog } from '../../../core/ui-components.js';

const SLUG = '_demo';
const FREE_LIMIT = 3;
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

createPrivacyBanner({}, $('privacy'));

function button(label, onClick, secondary = true) {
  const b = document.createElement('button');
  b.className = `ow-btn${secondary ? ' ow-btn--secondary' : ''}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

async function render() {
  const premium = isPremiumUnlocked(SLUG);
  $('premium').replaceChildren(createStatusBadge(premium ? 'green' : 'yellow', premium ? 'Premium' : 'Gratis'));

  const items = await getAllItems(SLUG);
  $('list').replaceChildren(...items.map((it) => {
    const li = document.createElement('li');
    li.append(it.text + ' ', button('✕', async () => { await deleteItem(SLUG, it.id); render(); }));
    return li;
  }));

  const actions = $('actions');
  actions.replaceChildren(button('Export', () => exportData(SLUG)));
  const file = document.createElement('input');
  file.type = 'file'; file.accept = 'application/json'; file.hidden = true;
  file.addEventListener('change', async () => {
    try { await importData(SLUG, file.files[0]); $('error').textContent = ''; }
    catch (e) { $('error').textContent = e.message; }
    render();
  });
  actions.append(' ', button('Import', () => file.click()), file);
  if (!premium) {
    actions.append(' ', button('🔑 Lizenzschlüssel', () => showLicenseDialog({ toolSlug: SLUG, purchaseUrl: config.purchaseUrl, onUnlock: render })), ' ');
    createUpgradeButton({ url: config.purchaseUrl }, actions);
  }
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const items = await getAllItems(SLUG);
  if (!isPremiumUnlocked(SLUG) && items.length >= FREE_LIMIT) {
    $('error').textContent = `Gratis-Limit erreicht (${FREE_LIMIT}). Mit Premium unbegrenzt.`;
    return;
  }
  $('error').textContent = '';
  await saveItem(SLUG, { text: $('text').value });
  $('text').value = '';
  render();
});

render();
