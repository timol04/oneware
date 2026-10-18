import { createPrivacyBanner, createStatusBadge, mountToolbar } from '../../core/ui-components.js';
import { createIcon } from '../../core/icons.js';
import { t, localize, onLangChange } from '../../core/i18n.js';

mountToolbar(document.getElementById('toolbar'));
createPrivacyBanner({}, document.getElementById('privacy'));

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function renderRow(tool) {
  const live = tool.status === 'live';
  const row = el('li', `tool-row${live ? '' : ' tool-row--soon'}`);
  const inner = el(live ? 'a' : 'div', live ? '' : 'tool-row__inner');
  if (live) inner.href = `../${tool.path}`;

  const side = el('div', 'tool-row__side');
  side.append(el('span', 'tool-row__price', localize(tool.price)), createStatusBadge(live ? 'green' : 'yellow', t(live ? 'hub.live' : 'hub.soon')));

  const icon = el('span', 'tool-row__icon');
  icon.append(createIcon(tool.icon, { size: '1.4rem' }));
  inner.append(icon, el('h2', 'tool-row__name', localize(tool.name)), side, el('p', 'tool-row__desc', localize(tool.shortDescription)));
  row.append(inner);
  return row;
}

const container = document.getElementById('tools');
let tools = null;
let failed = false;

function render() {
  if (failed) container.replaceChildren(el('li', 'ow-error', t('hub.error')));
  else if (tools) container.replaceChildren(...(tools.length ? tools.map(renderRow) : [el('li', 'ow-muted', t('hub.empty'))]));
}
onLangChange(render);

try {
  const res = await fetch('tool-registry.json');
  if (!res.ok) throw new Error(res.status);
  tools = await res.json();
} catch {
  failed = true;
}
render();
