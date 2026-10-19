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
