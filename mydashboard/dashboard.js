import { mountSiteShell, siteUrl } from '../core/site-shell.js';
import { createStatusBadge, showToast } from '../core/ui-components.js';
import { createIcon } from '../core/icons.js';
import { t, localize, onLangChange, applyTranslations, getLang } from '../core/i18n.js';
import { isPremiumUnlocked } from '../core/license.js';
import { getAllItems, exportData, importData } from '../core/storage.js';
import { getLastExport, BACKUP_INTERVAL_DAYS } from '../core/persistence.js';
import { getCloudLink } from '../core/cloud.js';
import { previewHtml } from '../hub/src/preview.js';
import { showCloudDialog } from '../core/cloud-ui.js';

mountSiteShell();
for (const n of document.querySelectorAll('[data-icon]')) n.prepend(createIcon(n.dataset.icon, { size: n.dataset.iconSize || '1.25rem' }));

const toolsList = document.getElementById('dash-tools');
const dataList = document.getElementById('dash-data');
let tools = null;
let rows = [];
let failed = false;

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
function button(label, onClick, className = 'ow-btn ow-btn--secondary ow-btn--small') {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
const days = (ms) => (Date.now() - ms) / 86400000;

async function collect() {
  rows = await Promise.all(tools.map(async (tool) => {
    const live = tool.status === 'live';
    let count = 0;
    let cloud = null;
    if (live && tool.stores !== false) {
      try { count = (await getAllItems(tool.slug)).length; } catch { /* storage blocked */ }
      try { cloud = await getCloudLink(tool.slug); } catch { /* no IndexedDB */ }
    }
    return { tool, live, count, cloud, premium: isPremiumUnlocked(tool.slug), backup: getLastExport(tool.slug) };
  }));
}
async function refresh() { await collect(); render(); }

function setup(li, tool) {
  if (tool.accent) { li.style.setProperty('--accent-l', tool.accent.light); li.style.setProperty('--accent-d', tool.accent.dark); }
}
function head(tool, ...extra) {
  const h = el('div', 'dash__head');
  const icon = el('span', 'dash__icon');
  icon.append(createIcon(tool.icon, { size: '1.4rem' }));
  const text = el('div', 'dash__text');
  text.append(el('h3', 'dash__name', localize(tool.name)), ...extra);
  h.append(icon, text);
  return h;
}

function toolRow({ tool, live, count, premium }) {
  const li = el('li', `tool-card${live ? '' : ' tool-card--soon'}`);
  setup(li, tool);
  const link = el(live ? 'a' : 'div', 'tool-card__link');
  if (live) link.href = siteUrl(tool.path);
  const preview = el('span', 'tool-card__preview');
  preview.innerHTML = previewHtml(tool.preview); // static markup from preview.js, no user data
  const icon = el('span', 'tool-card__icon');
  icon.append(createIcon(tool.icon, { size: '1.4rem' }));
  const top = el('span', 'tool-card__top');
  top.append(icon, el('h3', 'tool-card__name', localize(tool.name)));
  const meta = el('span', 'tool-card__meta');
  if (!live) meta.append(createStatusBadge('yellow', t('dash.soon')));
  else {
    meta.append(el('span', 'ow-muted', tool.stores !== false ? (count === 1 ? t('dash.entriesOne') : t('dash.entries', { count })) : ''));
    meta.append(tool.hasPremium ? createStatusBadge(premium ? 'green' : 'yellow', t(premium ? 'dash.premium' : 'dash.free')) : '');
  }
  const body = el('span', 'tool-card__body');
  body.append(top, el('p', 'tool-card__desc', localize(tool.shortDescription)), meta);
  if (live) body.append(el('span', 'ow-btn ow-btn--secondary dash__cta', t(tool.hasPremium && !premium ? 'dash.unlock' : 'dash.open')));
  link.append(preview, body);
  li.append(link);
  return li;
}

function dataRow({ tool, count, cloud, backup }) {
  const li = el('li', 'dash__row');
  setup(li, tool);
  const stale = count > 0 && (!backup || days(backup) > BACKUP_INTERVAL_DAYS);
  const status = el('div', 'dash__meta');
  if (!count) status.append(el('span', 'ow-muted', t('dash.noData')));
  else {
    status.append(el('span', '', backup ? t('dash.lastBackup', { date: new Date(backup).toLocaleDateString(getLang()) }) : t('dash.neverBackup')));
    if (stale) status.append(createStatusBadge('yellow', t('dash.stale')));
  }
  const file = el('input');
  file.type = 'file'; file.accept = 'application/json'; file.hidden = true;
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = '';
    if (!f) return;
    try { showToast(t('shell.imported', { count: await importData(tool.slug, f) })); refresh(); }
    catch (e) { showToast(t('shell.importFailed', { reason: e.message })); }
  });
  const actions = el('div', 'dash__actions');
  actions.append(
    button(t('dash.export'), async () => { await exportData(tool.slug); showToast(t('shell.exported')); refresh(); }),
    button(t('dash.import'), () => file.click()),
    button(cloud ? t('dash.cloudManage', { name: cloud.name }) : t('cloud.menu'), () => showCloudDialog({ toolSlug: tool.slug, onChange: refresh }).then(() => {}), 'ow-btn ow-btn--secondary ow-btn--small'),
    file,
  );
  li.append(head(tool), status, actions);
  return li;
}

function render() {
  if (failed) { toolsList.replaceChildren(el('li', 'ow-error', t('dash.error'))); return; }
  if (!rows.length) { toolsList.replaceChildren(el('li', 'ow-muted', t('dash.empty'))); return; }
  toolsList.replaceChildren(...rows.map(toolRow));
  dataList.replaceChildren(...rows.filter((r) => r.live && r.tool.stores !== false).map(dataRow));
}

onLangChange(render);
try {
  const res = await fetch(siteUrl('hub/tool-registry.json'));
  if (!res.ok) throw new Error(res.status);
  tools = await res.json();
  await collect();
} catch { failed = true; }
render();
applyTranslations();
document.addEventListener('ow:datachange', () => { if (tools) refresh(); });
