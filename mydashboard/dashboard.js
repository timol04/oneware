import { mountSiteShell, siteUrl } from '../core/site-shell.js';
import { createStatusBadge } from '../core/ui-components.js';
import { createIcon } from '../core/icons.js';
import { t, localize, onLangChange, applyTranslations, getLang } from '../core/i18n.js';
import { isPremiumUnlocked } from '../core/license.js';
import { getAllItems } from '../core/storage.js';
import { getLastExport } from '../core/persistence.js';
import { getCloudLink } from '../core/cloud.js';

mountSiteShell();

const list = document.getElementById('dash');
let rows = null;
let failed = false;

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
const fact = (label, value) => {
  const d = el('div', 'dash__fact');
  d.append(el('dt', '', label), el('dd', '', value));
  return d;
};
const when = (ms) => (ms ? new Date(ms).toLocaleDateString(getLang()) : t('dash.never'));

async function collect(tools) {
  return Promise.all(tools.filter((x) => x.status === 'live').map(async (tool) => {
    let count = 0;
    let cloud = null;
    if (tool.stores !== false) {
      try { count = (await getAllItems(tool.slug)).length; } catch { /* storage blocked */ }
      try { cloud = await getCloudLink(tool.slug); } catch { /* no IndexedDB */ }
    }
    return { tool, count, cloud, premium: isPremiumUnlocked(tool.slug), backup: getLastExport(tool.slug) };
  }));
}

function render() {
  if (failed) { list.replaceChildren(Object.assign(el('li', 'ow-error', t('dash.error')))); return; }
  if (!rows) return;
  if (!rows.length) { list.replaceChildren(el('li', 'ow-muted', t('dash.empty'))); return; }
  list.replaceChildren(...rows.map(({ tool, count, cloud, premium, backup }) => {
    const li = el('li', 'dash__row');
    if (tool.accent) { li.style.setProperty('--accent-l', tool.accent.light); li.style.setProperty('--accent-d', tool.accent.dark); }
    const head = el('div', 'dash__head');
    const icon = el('span', 'dash__icon');
    icon.append(createIcon(tool.icon, { size: '1.4rem' }));
    head.append(icon, el('h2', 'dash__name', localize(tool.name)));
    if (tool.hasPremium) head.append(createStatusBadge(premium ? 'green' : 'yellow', t(premium ? 'dash.premium' : 'dash.free')));
    const facts = el('dl', 'dash__facts');
    facts.append(
      fact(t('dash.entries'), String(count)),
      fact(t('dash.backup'), when(backup)),
      fact(t('dash.cloud'), cloud ? cloud.name : t('dash.notConnected')),
    );
    const open = el('a', 'ow-btn ow-btn--secondary', t(tool.hasPremium && !premium ? 'dash.unlock' : 'dash.open'));
    open.href = siteUrl(tool.path);
    li.append(head, facts, open);
    return li;
  }));
}

onLangChange(render);
try {
  const res = await fetch(siteUrl('hub/tool-registry.json'));
  if (!res.ok) throw new Error(res.status);
  rows = await collect(await res.json());
} catch { failed = true; }
render();
applyTranslations();
