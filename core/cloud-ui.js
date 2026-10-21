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

const BROWSER_KEYS = ['chromium', 'brave', 'safari', 'firefox', 'mobile'];

/** Collapsible how-to: steps, license note and one fold-out per browser (the current browser is opened). */
export function cloudHowTo() {
  const fold = (title, body, open = false) => {
    const d = el('details', 'ow-howto__item');
    d.open = open;
    const sum = el('summary');
    sum.append(el('span', '', title), createIcon('chevron-down', { size: '1.1rem' }));
    d.append(sum, body);
    return d;
  };
  const { browser, mobile, braveOff } = getCloudSupport();
  const current = mobile ? 'mobile' : braveOff || browser.name === 'Brave' ? 'brave'
    : browser.name === 'Safari' ? 'safari' : browser.name === 'Firefox' ? 'firefox' : 'chromium';

  const steps = el('ol');
  for (const k of ['pick', 'save', 'restore']) steps.append(el('li', '', t(`cloud.howto.${k}`)));
  const stepsBody = el('div', 'ow-howto__body');
  stepsBody.append(steps, el('p', 'ow-muted', t('cloud.howto.files')), el('p', 'ow-muted', t('cloud.howto.license')));

  const browsers = el('div', 'ow-howto__body');
  for (const k of BROWSER_KEYS) browsers.append(fold(t(`cloud.howto.b.${k}.title`), el('p', '', t(`cloud.howto.b.${k}`)), k === current));

  const root = el('div', 'ow-howto');
  const outer = fold(t('cloud.howto.title'), el('div'));
  outer.lastChild.replaceWith(el('div', 'ow-howto__body'));
  outer.lastChild.append(fold(t('cloud.howto.steps'), stepsBody, true), fold(t('cloud.howto.browsers'), browsers));
  root.append(outer);
  return root;
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
