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
    new MutationObserver(mark).observe(el, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
