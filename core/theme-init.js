/* Classic (non-module) script: include in <head> BEFORE the stylesheet to avoid a flash of the wrong theme. */
(function () {
  var theme = null;
  try { theme = localStorage.getItem('ow_theme'); } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.classList.add('js');
})();

/* Dev preview marker: on the Cloudflare preview host (*.workers.dev) the tab title starts with "oneware dev". No effect on the live site. */
(function () {
  if (!/\.workers\.dev$/.test(location.hostname)) return;
  var PREFIX = 'oneware dev | ';
  function mark() {
    if (document.title.indexOf(PREFIX) !== 0) document.title = PREFIX + document.title;
  }
  function start() {
    var el = document.querySelector('title');
    if (!el) return;
    mark();
    var badge = document.createElement('div');
    badge.textContent = 'DEV-Vorschau';
    badge.setAttribute('style', 'position:fixed;left:12px;bottom:12px;z-index:2147483647;padding:6px 12px;border-radius:999px;background:#c2410c;color:#fff;font:600 13px/1 system-ui,sans-serif;pointer-events:none');
    document.body.appendChild(badge);
    new MutationObserver(mark).observe(el, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* Offline use: registers /sw.js (generated at build time) and, once the page is idle, asks it to store all tools for offline use
 * (skipped when the browser asks to save data). Failure is harmless: the site works online exactly as before. */
(function () {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  var src = document.currentScript && document.currentScript.src;
  if (!src) return;
  var url = new URL('../sw.js', src).href;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register(url).then(function (reg) {
      var c = navigator.connection;
      if (c && c.saveData) return;
      return navigator.serviceWorker.ready.then(function (r) {
        var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 2000); };
        idle(function () { if (r.active) r.active.postMessage({ type: 'warm' }); });
      });
    }).catch(function () {});
  });
})();
