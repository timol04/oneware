import { createPrivacyBanner, createStatusBadge } from '../../core/ui-components.js';

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
  side.append(el('span', 'tool-row__price', tool.price), createStatusBadge(live ? 'green' : 'yellow', live ? 'Live' : 'Kommt bald'));

  inner.append(el('span', 'tool-row__icon', tool.icon), el('h2', 'tool-row__name', tool.name), side, el('p', 'tool-row__desc', tool.shortDescription));
  row.append(inner);
  return row;
}

const container = document.getElementById('tools');
try {
  const res = await fetch('tool-registry.json');
  if (!res.ok) throw new Error(res.status);
  const tools = await res.json();
  container.replaceChildren(...(tools.length
    ? tools.map(renderRow)
    : [el('li', 'ow-muted', 'Noch keine Tools veröffentlicht – bald mehr.')]));
} catch {
  container.replaceChildren(el('li', 'ow-error', 'Tool-Liste konnte nicht geladen werden.'));
}
