/**
 * analytics.js – cookieless visitor statistics with Cloudflare Web Analytics.
 *
 * The beacon sets no cookies, uses no localStorage and does no fingerprinting. It is loaded only on the
 * live domain, never on previews or localhost, and not when the browser sends "Do Not Track".
 * Inert while TOKEN is empty.
 */
const TOKEN = '3610a79c739a4a9a8e44204e4f46a993'; // Cloudflare dashboard > Web Analytics > site > "Manual setup" token
const LIVE_HOSTS = ['oneware.page', 'www.oneware.page'];
const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js';

export function initAnalytics() {
  if (!TOKEN || !LIVE_HOSTS.includes(location.hostname)) return;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  if (document.querySelector('script[data-cf-beacon]')) return;
  const s = document.createElement('script');
  s.type = 'module';
  s.src = BEACON;
  s.dataset.cfBeacon = JSON.stringify({ token: TOKEN });
  document.head.appendChild(s);
}
