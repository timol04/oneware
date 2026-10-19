/**
 * premium.js – marks features that belong to Premium.
 *
 *   markPremium(element, slug)                 // small "Premium" badge appended to the element
 *   markPremium(element, slug, { compact: true })  // star only (for chips and buttons)
 *   <h2 data-premium-badge>...</h2>            // same, from markup (the tool shell applies it)
 *
 * The badge is visible while licensing is switched off (free launch phase: it only shows what will be
 * Premium) and while the tool is locked. It disappears once the tool is unlocked with a license key.
 * It never locks anything itself; gating stays with isPremiumUnlocked().
 */
import { t } from './i18n.js';
import { createIcon } from './icons.js';
import { licensing } from './site-config.js';
import { isPremiumUnlocked } from './license.js';

const visible = (slug) => !licensing.enabled || !isPremiumUnlocked(slug);

export function markPremium(element, slug, { compact = false } = {}) {
  if (!element || element.querySelector(':scope > .ow-premium')) return null;
  const badge = document.createElement('span');
  badge.className = `ow-premium${compact ? ' ow-premium--compact' : ''}`;
  badge.dataset.slug = slug;
  badge.append(createIcon('star', { size: compact ? '.8em' : '.85em' }));
  const label = document.createElement('span');
  label.dataset.i18n = 'shell.premium';
  label.textContent = t('shell.premium');
  if (compact) {
    label.className = 'ow-sr-only';
    badge.title = t('shell.premium');
  }
  badge.append(label);
  badge.hidden = !visible(slug);
  element.append(badge);
  return badge;
}

/** Applies badges declared in markup (`data-premium-badge`) below `root`. */
export function applyPremiumBadges(root, slug) {
  for (const el of root.querySelectorAll('[data-premium-badge]')) {
    markPremium(el, slug, { compact: el.dataset.premiumBadge === 'compact' });
  }
}

/** Shows or hides all badges after the license state changed. */
export function refreshPremiumBadges() {
  for (const b of document.querySelectorAll('.ow-premium[data-slug]')) b.hidden = !visible(b.dataset.slug);
}
document.addEventListener('ow:licensechange', refreshPremiumBadges);
