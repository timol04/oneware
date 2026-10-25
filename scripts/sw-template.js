/* Oneware service worker (generated into /sw.js by scripts/build-sw.js, do not edit the output).
 *
 * Strategy: network first, cache as the offline fallback. Online you always get the current version,
 * offline you get the last version you opened or that was stored in the background.
 * Only same-origin GET requests are handled. The license check (Lemon Squeezy) is cross-origin and
 * untouched: offline it fails like before and Premium stays active.
 * Caches hold only site files, never user data.
 */
const VERSION = '__VERSION__';
const MANIFEST = __MANIFEST__;
const CACHE = 'oneware-offline';
const WARM_KEY = '__oneware-warm';
const NETWORK_TIMEOUT_MS = 5000;

const scope = self.registration.scope;
const abs = (u) => new URL(u, scope).href;
const allUrls = () => [...MANIFEST.core, ...Object.values(MANIFEST.tools).flat()].map(abs);
const fresh = (u) => new Request(u, { cache: 'reload' });
const cacheable = (res) => res && res.ok && res.type === 'basic' && !res.redirected;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(MANIFEST.core.map(async (u) => {
      const res = await fetch(fresh(abs(u)));
      if (!cacheable(res)) throw new Error('precache failed: ' + u);
      await cache.put(abs(u), res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // entries that are no longer part of the site are dropped on update
    const keep = new Set([...allUrls(), abs(WARM_KEY)]);
    for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
    await self.clients.claim();
  })());
});

async function warm() {
  const cache = await caches.open(CACHE);
  const marker = await cache.match(abs(WARM_KEY));
  if (marker && (await marker.text()) === VERSION) return;
  let failed = 0;
  for (const u of Object.values(MANIFEST.tools).flat()) {
    try {
      const res = await fetch(fresh(abs(u)));
      if (cacheable(res)) await cache.put(abs(u), res); else failed++;
    } catch { failed++; }
  }
  if (!failed) await cache.put(abs(WARM_KEY), new Response(VERSION));
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'warm') event.waitUntil(warm());
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function lookup(cache, request) {
  const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  const url = new URL(request.url);
  // /mydashboard/notes without the trailing slash
  if (request.mode === 'navigate' && !url.pathname.endsWith('/') && !/\.[a-z0-9]+$/i.test(url.pathname)) {
    // like the server does online, so relative paths of the page resolve correctly
    if (await cache.match(url.origin + url.pathname + '/', { ignoreSearch: true })) return Response.redirect(url.origin + url.pathname + '/' + url.search, 301);
  }
  return undefined;
}

async function respond(event) {
  const request = event.request;
  const cache = await caches.open(CACHE);
  const network = (request.mode === 'navigate' ? fetch(request) : fetch(request, { cache: 'no-cache' })).then((res) => {
    if (cacheable(res)) {
      const copy = res.clone();
      event.waitUntil(cache.put(request.url.split('#')[0].replace(/\?.*$/, ''), copy));
    }
    return res;
  });
  const cached = await lookup(cache, request);
  try {
    // with a cached copy at hand, give up on a slow network after a few seconds (weak connection)
    return await (cached ? withTimeout(network, NETWORK_TIMEOUT_MS) : network);
  } catch {
    network.catch(() => {});
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const home = await cache.match(abs('./'));
      if (home) return home;
    }
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(scope)) return;
  if (url.pathname.endsWith('/sw.js')) return;
  event.respondWith(respond(event));
});
