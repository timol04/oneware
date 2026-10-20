/**
 * site-config.js – the one switch that decides how premium works.
 *
 *   enabled: false  -> launch phase: every premium feature is free in every tool.
 *                      No license dialog, no unlock buttons, no prices shown.
 *   enabled: true   -> premium is unlocked only with a license key (Lemon Squeezy).
 *
 * Flip `enabled` to true once Lemon Squeezy is connected (purchaseUrl and lemonSqueezy.productId
 * set in each tool.config.json). This is the only place to change.
 */
export const licensing = { enabled: false };

// Test switch for the purchase flow before launch: in a browser where localStorage has
// oneware-licensing-preview = 1, licensing behaves as enabled. Only affects that browser.
// Remove this block once licensing.enabled is true for everyone.
try { if (globalThis.localStorage?.getItem('oneware-licensing-preview') === '1') licensing.enabled = true; } catch { /* storage blocked: stay with the site setting */ }
