/** cloud-ui.js – dialog for linking a tool's backup to a cloud folder (see cloud.js). */
import { t, getLang } from './i18n.js';
import { createIcon } from './icons.js';
import { showToast } from './ui-components.js';
import { getCloudSupport, getCloudLink, connectCloud, syncCloud, restoreCloud, disconnectCloud } from './cloud.js';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
const button = (label, onClick, className = 'ow-btn') => {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};
const reason = (e) => e?.message || String(e);

/** One line about this browser, used on the home page and in the dialog. */
export function cloudBrowserLine() {
  const { supported, browser } = getCloudSupport();
  return t(supported ? 'cloud.yourBrowser.yes' : 'cloud.yourBrowser.no', { browser: browser.name });
}

/** Short collapsible how-to: folder, saving, restoring on a new device, license key. */
export function cloudHowTo() {
  const d = el('details', 'ow-cloud-howto');
  const sum = el('summary');
  sum.append(createIcon('cloud', { size: '1rem' }), ' ', t('cloud.howto.title'));
  const ol = el('ol');
  for (const k of ['pick', 'save', 'restore']) ol.append(el('li', '', t(`cloud.howto.${k}`)));
  d.append(sum, ol, el('p', 'ow-muted', t('cloud.howto.license')));
  d.style.fontSize = 'var(--fs-small)';
  d.style.marginTop = 'var(--s-3)';
  sum.style.cursor = 'pointer';
  return d;
}

/** Opens the dialog. `onChange` runs after data was restored. */
export async function showCloudDialog({ toolSlug, onChange } = {}) {
  const support = getCloudSupport();
  const dialog = el('dialog', 'ow-dialog');
  dialog.setAttribute('aria-labelledby', 'ow-cloud-title');
  const box = el('div');
  dialog.append(box);

  async function draw() {
    const link = support.supported ? await getCloudLink(toolSlug) : null;
    const head = el('div', 'ow-row');
    head.style.justifyContent = 'space-between';
    const h = el('h2');
    h.id = 'ow-cloud-title';
    h.append(createIcon('cloud'), ' ', t('cloud.title'));
    const close = el('button', 'ow-iconbtn');
    close.type = 'button';
    close.title = t('core.license.close');
    close.setAttribute('aria-label', t('core.license.close'));
    close.append(createIcon('x', { size: '1.1rem' }));
    close.addEventListener('click', () => dialog.close());
    head.append(h, close);

    const parts = [head];
    if (!support.supported) {
      parts.push(el('p', '', t('cloud.unsupported', { browser: support.browser.name })));
    } else if (!link) {
      parts.push(el('p', 'ow-muted', t('cloud.intro')));
      parts.push(button(t('cloud.connect'), async () => {
        try { showToast(t((await connectCloud(toolSlug)).kept ? 'cloud.found' : 'cloud.synced')); draw(); }
        catch (e) { if (e?.name !== 'AbortError') showToast(t('cloud.connectFailed', { reason: reason(e) })); }
      }));
    } else {
      parts.push(el('p', '', t(link.shared ? 'cloud.connectedAll' : 'cloud.connected', { name: link.name })));
      parts.push(el('p', 'ow-muted', link.lastSync ? t('cloud.lastSync', { time: new Date(link.lastSync).toLocaleString(getLang()) }) : t('cloud.never')));
      const row = el('div', 'ow-row');
      row.append(
        button(t('cloud.syncNow'), async () => {
          try { showToast(t((await syncCloud(toolSlug, { interactive: true })) === 'ok' ? 'cloud.synced' : 'cloud.needsAccess')); draw(); }
          catch (e) { showToast(t('cloud.connectFailed', { reason: reason(e) })); }
        }),
        button(t('cloud.restore'), async () => {
          try { showToast(t('cloud.restored', { count: await restoreCloud(toolSlug) })); onChange?.(); }
          catch (e) { showToast(t('cloud.restoreFailed', { reason: reason(e) })); }
        }, 'ow-btn ow-btn--secondary'),
        ...(link.shared ? [] : [button(t('cloud.disconnect'), async () => { await disconnectCloud(toolSlug); draw(); }, 'ow-btn ow-btn--secondary')]),
      );
      parts.push(row);
    }
    const info = el('div', 'ow-muted');
    info.style.fontSize = 'var(--fs-small)';
    info.append(el('p', '', t('cloud.browsers.yes')), el('p', '', t('cloud.browsers.no')), el('p', '', cloudBrowserLine()), el('p', '', t('cloud.note')));
    parts.push(info, cloudHowTo());
    box.replaceChildren(...parts);
  }

  await draw();
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
