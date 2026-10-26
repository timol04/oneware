/**
 * analytics.js – cookieless visitor statistics with Cloudflare Web Analytics.
 *
 * The beacon sets no cookies, uses no localStorage and does no fingerprinting. It is loaded only on the
 * live domain, never on previews or localhost, and not when the browser sends "Do Not Track".
 * Inert until the site token from the Cloudflare dashboard is entered below.
 */
const TOKEN = ''; // Cloudflare dashboard > Web Analytics > site > "Manual setup" token
const LIVE_HOSTS = ['oneware.page', 'www.oneware.page'];
const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js';

export function initAnalytics() {
  if (!TOKEN || !LIVE_HOSTS.includes(location.hostname)) return;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  if (document.querySelector('script[data-cf-beacon]')) return;
  const s = document.createElement('script');
  s.defer = true;
  s.src = BEACON;
  s.dataset.cfBeacon = JSON.stringify({ token: TOKEN });
  document.head.appendChild(s);
}
