/**
 * ui-components.js – wiederverwendbare UI-Snippets (benötigt ui-components.css).
 * Alle Funktionen erzeugen DOM-Elemente; Texte werden nie als HTML eingefügt.
 */
import { unlockPremium } from './license.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** "🔒 Deine Daten bleiben lokal"-Banner. Wird in `container` eingefügt, falls angegeben. */
export function createPrivacyBanner({ text = 'Deine Daten bleiben lokal – nichts wird an einen Server gesendet.' } = {}, container) {
  const banner = el('div', 'ow-banner');
  banner.setAttribute('role', 'note');
  banner.append(el('span', '', '🔒'), el('span', '', text));
  container?.append(banner);
  return banner;
}

/** "Upgrade zu Premium"-Button als Link auf die Lemon-Squeezy-URL. */
export function createUpgradeButton({ url, label = '⭐ Upgrade zu Premium' }, container) {
  if (!/^https?:\/\//i.test(url || '')) throw new Error('Gültige purchaseUrl erforderlich');
  const a = el('a', 'ow-btn', label);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  container?.append(a);
  return a;
}

/** Ampel-Badge. status: 'green' | 'yellow' | 'red'. */
export function createStatusBadge(status, label) {
  if (!['green', 'yellow', 'red'].includes(status)) throw new Error(`Unbekannter Status: ${status}`);
  return el('span', `ow-status ow-status--${status}`, label);
}

/**
 * "Lizenzschlüssel eingeben"-Dialog. Gibt ein Promise<boolean> zurück
 * (true = freigeschaltet, false = abgebrochen). `onUnlock` wird bei Erfolg aufgerufen.
 */
export function showLicenseDialog({ toolSlug, purchaseUrl, onUnlock } = {}) {
  if (!toolSlug) throw new Error('toolSlug fehlt');
  return new Promise((resolve) => {
    const dialog = el('dialog', 'ow-dialog');
    const form = el('form');
    form.method = 'dialog';

    const field = el('div', 'ow-field');
    const label = el('label', 'ow-label', 'Lizenzschlüssel');
    const input = el('input', 'ow-input');
    input.id = `ow-license-${toolSlug}`;
    input.placeholder = 'XXXX-XXXX-XXXX-XXXX';
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.htmlFor = input.id;
    const error = el('p', 'ow-error');
    error.setAttribute('role', 'alert');
    field.append(label, input, error);

    const actions = el('div', 'ow-dialog__actions');
    const cancel = el('button', 'ow-btn ow-btn--secondary', 'Abbrechen');
    cancel.type = 'button';
    const ok = el('button', 'ow-btn', 'Freischalten');
    ok.type = 'submit';
    if (purchaseUrl) createUpgradeButton({ url: purchaseUrl, label: 'Lizenz kaufen' }, actions);
    actions.append(cancel, ok);

    form.append(el('h2', '', '🔑 Premium freischalten'), field, actions);
    dialog.append(form);

    let result = false;
    cancel.addEventListener('click', () => dialog.close());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (unlockPremium(toolSlug, input.value)) {
        result = true;
        dialog.close();
        onUnlock?.();
      } else {
        input.classList.add('ow-input--error');
        error.textContent = 'Ungültiger Lizenzschlüssel.';
        input.focus();
      }
    });
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });

    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}
