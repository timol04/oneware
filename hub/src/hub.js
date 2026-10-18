import { createPrivacyBanner, createStatusBadge } from '../../core/ui-components.js';

createPrivacyBanner({}, document.getElementById('privacy'));

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function renderCard(tool) {
  const live = tool.status === 'live';
  const card = el('article', `ow-card tool-card${live ? '' : ' tool-card--soon'}`);
  const title = el('h2', 'ow-card__title', tool.name);
  card.append(el('div', 'tool-card__icon', tool.icon), title, el('p', 'ow-muted', tool.shortDescription));

  const meta = el('div', 'tool-card__meta');
  meta.append(createStatusBadge(live ? 'green' : 'yellow', live ? 'Live' : 'Kommt bald'), el('strong', '', tool.price));
  card.append(meta);

  if (live) {
    const link = el('a', 'ow-btn', 'Öffnen');
    link.href = `../${tool.path}`;
    card.append(link);
  }
  return card;
}

const container = document.getElementById('tools');
try {
  const res = await fetch('tool-registry.json');
  if (!res.ok) throw new Error(res.status);
  const tools = await res.json();
  container.replaceChildren(...(tools.length
    ? tools.map(renderCard)
    : [el('p', 'ow-muted', 'Noch keine Tools veröffentlicht – bald mehr.')]));
} catch {
  container.replaceChildren(el('p', 'ow-error', 'Tool-Liste konnte nicht geladen werden.'));
}
