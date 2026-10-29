/**
 * tool-shell.js – the frame around every tool: header with license status and menu,
 * notices (limit, backup reminder, storage warning), "About this tool", footer.
 *
 *   const shell = await mountToolShell({ slug, config, main, onLicenseChange });
 *   shell.setUsage('Free: ...');                  // quiet note about free and Premium
 *   shell.setPremiumLimit(3, '1 of 3 free entries used'); // demo only: live tools have no quantity limits (Free-first rule)
 *   shell.showLimit();                             // inline "this is a Premium function" notice
 *   shell.isPremium();
 *
 * The tool provides <main id="main" class="ow-container"> with its workspace.
 */
import { t, localize, availableLanguages, languageName, getLang, setLang, applyTranslations } from './i18n.js';
import { initAnalytics } from './analytics.js';
import { initTheme, getTheme, toggleTheme } from './theme.js';
import { createIcon } from './icons.js';
import { licensing } from './site-config.js';
import { markPremium, applyPremiumBadges } from './premium.js';
import { isPremiumUnlocked, revalidateLicense } from './license.js';
import { createStatusBadge, showLicenseDialog, showToast } from './ui-components.js';
import { siteUrl, createSiteFooter } from './site-shell.js';
import { getAllItems, exportData, importData } from './storage.js';
import { showCloudDialog } from './cloud-ui.js';
import { getCloudLink, syncCloud } from './cloud.js';
import { backupReminderDue, dismissBackupReminder, storageProblem, requestPersistence } from './persistence.js';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
function i18n(tag, className, key, params) {
  const n = el(tag, className, t(key, params));
  if (!params) n.dataset.i18n = key;
  return n;
}
const isDesktop = () => matchMedia('(min-width: 721px)').matches;

export async function mountToolShell({ slug, config, main, onLicenseChange } = {}) {
  if (!slug || !config || !main) throw new Error('slug, config and main are required');
  initTheme();
  initAnalytics();
  if (config.accent) {
    document.documentElement.style.setProperty('--accent-l', config.accent.light);
    document.documentElement.style.setProperty('--accent-d', config.accent.dark);
  }
  const hasPremium = !!config.hasPremium && licensing.enabled; // no license UI during the free launch phase
  const stores = config.stores !== false;
  const price = localize(config.price);
  const name = localize(config.name);

  // slugs of other tools (for the "wrong tool" license message); best effort
  let registry = [];
  try {
    const res = await fetch(siteUrl('hub/tool-registry.json'));
    if (res.ok) registry = await res.json();
  } catch { /* offline or missing */ }
  if (registry.find((x) => x.slug === slug)?.status === 'coming-soon') { location.replace(siteUrl('')); return; } // tool paused: back to the hub
  const otherSlugs = registry.map((x) => x.slug);
  document.getElementById('seo-static')?.remove(); // plain-HTML copy for bots without JS; the about section below replaces it

  const openLicense = (mode = 'buy') => showLicenseDialog({
    toolSlug: slug, purchaseUrl: config.purchaseUrl, price, mode, otherSlugs, productId: config.lemonSqueezy?.productId,
    description: localize(config.about) || undefined,
    thanks: { tool: name, features: (config.features?.premium ?? []).map((f) => localize(f)) },
    onUnlock: () => { render(); onLicenseChange?.(); },
  });

  // ---- header ----
  const header = el('header', 'ow-toolhead');
  const inner = el('div', 'ow-container ow-container--tool ow-toolhead__in');
  const back = el('a', 'ow-toolhead__back');
  back.href = siteUrl('mydashboard/');
  const backText = el('span', 'ow-hide-mobile', t('dash.h1'));
  back.append(createIcon('arrow-left', { size: '1.2rem' }), backText);
  const backLabel = () => { backText.textContent = t('dash.h1'); back.title = t('shell.back'); back.setAttribute('aria-label', t('shell.back')); };
  const title = el('h1', 'ow-toolhead__title');
  const status = el('span', 'ow-toolstatus');
  const menuWrap = el('span', 'ow-menuwrap');
  const menuBtn = el('button', 'ow-iconbtn');
  menuBtn.type = 'button';
  menuBtn.setAttribute('aria-haspopup', 'menu');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.append(createIcon('more', { size: '1.3rem' }));
  const menu = el('div', 'ow-menu');
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  const backdrop = el('div', 'ow-menu__backdrop');
  backdrop.hidden = true;
  menuWrap.append(menuBtn, backdrop, menu);
  inner.append(back, title, status, menuWrap);
  header.append(inner);

  const skip = i18n('a', 'ow-skip', 'shell.skip');
  skip.href = '#main';
  main.before(header);
  document.body.prepend(skip);

  // ---- notices & usage ----
  const notices = el('div', 'ow-notices');
  notices.setAttribute('aria-live', 'polite');
  const usage = el('p', 'ow-usage');
  main.prepend(usage);
  main.prepend(notices);

  function addNotice(id, text, { warn = false, action } = {}) {
    notices.querySelector(`[data-notice="${id}"]`)?.remove();
    const box = el('div', `ow-notice${warn ? ' ow-notice--warn' : ''}`);
    box.dataset.notice = id;
    box.append(el('p', '', text));
    if (action) {
      const b = el('button', 'ow-btn ow-btn--small', action.label);
      b.type = 'button';
      b.addEventListener('click', action.onClick);
      box.append(b);
    }
    notices.append(box);
    return box;
  }
  const removeNotice = (id) => notices.querySelector(`[data-notice="${id}"]`)?.remove();

  // ---- menu ----
  function item(iconName, label, onClick, tag = 'button') {
    const b = el(tag, 'ow-menu__item');
    b.setAttribute('role', 'menuitem');
    if (tag === 'button') b.type = 'button';
    b.append(createIcon(iconName, { size: '1.2rem' }), el('span', '', label));
    if (onClick) b.addEventListener('click', () => { closeMenu(); onClick(); });
    return b;
  }
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json';
  fileInput.hidden = true;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (!confirm(t('shell.importConfirm'))) return;
    try { showToast(t('shell.imported', { count: await importData(slug, file) })); onLicenseChange?.(); }
    catch (e) { showToast(t('shell.importFailed', { reason: e.message })); }
  });

  function buildMenu() {
    const premium = isPremiumUnlocked(slug);
    const items = [];
    if (hasPremium && !premium) items.push(item('key', t('shell.menu.license'), () => openLicense('key')));
    if (hasPremium && premium) items.push(item('key', t('shell.menu.checkLicense'), async () => {
      const state = await revalidateLicense(slug, { force: true }).catch(() => 'offline');
      if (state === 'ok') showToast(t('core.license.stillActive'));
      else if (state === 'revoked') showToast(t('core.license.disabled'));
      else showToast(t('core.license.checkFailed'));
    }));
    if (stores) {
      items.push(item('download', t('shell.menu.export'), async () => { await exportData(slug); showToast(t('shell.exported')); removeNotice('backup'); }));
      items.push(item('upload', t('shell.menu.import'), () => fileInput.click()));
      items.push(item('cloud', t('cloud.menu'), () => showCloudDialog({ toolSlug: slug, onChange: onLicenseChange })));
    }
    const dark = getTheme() === 'dark';
    const themeItem = item(dark ? 'sun' : 'moon', t(dark ? 'core.theme.toLight' : 'core.theme.toDark'), null);
    themeItem.addEventListener('click', () => { toggleTheme(); buildMenu(); });
    items.push(themeItem);
    if (availableLanguages().length > 1) {
      const row = el('label', 'ow-menu__item');
      const select = el('select');
      for (const code of availableLanguages()) { const o = el('option', '', languageName(code)); o.value = code; select.append(o); }
      select.value = getLang();
      select.addEventListener('change', () => setLang(select.value));
      row.append(createIcon('globe', { size: '1.2rem' }), el('span', '', t('core.lang.label')), select);
      items.push(row);
    }
    items.push(item('grid', t('shell.menu.allTools'), () => { location.href = siteUrl('#tools'); }));
    menu.replaceChildren(...items, fileInput);
  }

  let lastFocus = null;
  function openMenu() {
    buildMenu();
    menu.hidden = false; backdrop.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    lastFocus = document.activeElement;
    menu.querySelector('[role=menuitem]')?.focus();
  }
  function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true; backdrop.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    (lastFocus ?? menuBtn).focus();
  }
  menuBtn.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  backdrop.addEventListener('click', closeMenu);
  document.addEventListener('click', (e) => { if (!menu.hidden && !menuWrap.contains(e.target)) closeMenu(); });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('[role=menuitem]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items.at(-1)?.focus(); }
    else if (e.key === 'Tab') closeMenu();
  });

  // ---- header content / status ----
  function render() {
    backLabel();
    title.replaceChildren(createIcon(config.icon, { size: '1.25rem' }), el('span', '', name));
    document.title = localize(config.seo?.title) || `${name} – oneware`;
    const seoDesc = localize(config.seo?.description);
    if (seoDesc) for (const sel of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) document.head.querySelector(sel)?.setAttribute('content', seoDesc);
    for (const sel of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) document.head.querySelector(sel)?.setAttribute('content', document.title);
    menuBtn.title = t('shell.menu.label');
    menuBtn.setAttribute('aria-label', t('shell.menu.label'));
    const premium = isPremiumUnlocked(slug);
    status.replaceChildren();
    if (hasPremium) {
      if (premium) {
        const badge = createStatusBadge('green', t('shell.planPremium'));
        status.append(badge);
      } else {
        const unlock = el('button', 'ow-btn ow-btn--small', t('shell.unlock'));
        unlock.type = 'button';
        unlock.addEventListener('click', () => openLicense('buy'));
        status.append(el('span', 'ow-muted', t('shell.free')), unlock);
      }
    }
    if (premium) removeNotice('limit');
    if (!menu.hidden) buildMenu();
    renderAbout();
  }

  // ---- about section ----
  const about = el('details', 'ow-about');
  const aboutWrap = el('section', 'ow-container ow-container--tool');
  aboutWrap.setAttribute('aria-label', t('shell.about.title'));
  aboutWrap.append(about);
  main.after(aboutWrap);
  if (isDesktop()) about.open = true;
  document.body.append(createSiteFooter());

  function renderAbout() {
    const summary = el('summary');
    summary.append(el('span', '', t('shell.about.title')), createIcon('chevron-down', { size: '1.3rem' }));
    const body = el('div', 'ow-about__text');
    const text = localize(config.about);
    if (text) body.append(el('p', '', text));
    let free = (config.features?.free ?? []).map(localize);
    let prem = (config.features?.premium ?? []).map(localize);
    const freeLaunch = !licensing.enabled && !!config.hasPremium;
    const premiumItems = new Set(prem);
    if (freeLaunch) { free = [...free, ...prem]; prem = []; }
    if (free.length || prem.length) {
      const cmp = el('div', 'ow-compare');
      for (const [label, list, cls] of [[t(freeLaunch ? 'shell.about.included' : 'shell.about.free'), free, ''], [t('shell.about.premium'), prem, ' ow-compare--premium']]) {
        if (!list.length) continue;
        const col = el('div', cls.trim());
        const h = el('h3', '', label);
        const ul = el('ul');
        for (const f of list) {
          const li = el('li', '', f);
          if (freeLaunch && premiumItems.has(f)) markPremium(li, slug);
          ul.append(li);
        }
        col.append(h, ul);
        cmp.append(col);
      }
      body.append(cmp);
    }
    const audience = localize(config.audience);
    if (audience) body.append(el('h3', '', t('shell.about.audience')), el('p', '', audience));
    body.append(el('h3', '', t('shell.about.data')), el('p', '', t(stores ? 'shell.about.data.stores' : 'shell.about.data.files')));
    if (config.countLimit && config.hasPremium) body.append(el('h3', '', t('shell.about.limit')), el('p', '', t('shell.about.limit.text')));
    const faq = config.seo?.faq ?? [];
    if (faq.length) {
      const sec = el('div', 'ow-faq');
      sec.append(el('h3', '', t('shell.about.faq')));
      for (const item of faq) sec.append(el('h4', '', localize(item.q)), el('p', '', localize(item.a)));
      body.append(sec);
    }
    const related = (config.seo?.related ?? []).map((s) => registry.find((x) => x.slug === s)).filter((x) => x && x.status === 'live');
    if (related.length) {
      const sec = el('div', 'ow-faq');
      sec.append(el('h3', '', t('shell.about.related')));
      const ul = el('ul');
      for (const r of related) {
        const li = el('li');
        const a = el('a', '', localize(r.name));
        a.href = siteUrl(`mydashboard/${r.slug}/`);
        li.append(a, document.createTextNode(`: ${localize(r.shortDescription)}`));
        ul.append(li);
      }
      sec.append(ul);
      body.append(sec);
    }
    if (hasPremium) body.append(el('p', '', t('shell.about.price', { price })));
    const priv = el('p', 'ow-banner');
    priv.append(createIcon('lock'), i18n('span', '', 'core.privacy'));
    body.append(priv);
    about.replaceChildren(summary, body);
  }

  // ---- data protection ----
  async function checkData() {
    if (!stores) return;
    try {
      const count = (await getAllItems(slug)).length;
      if (backupReminderDue(slug, count)) {
        addNotice('backup', t('shell.backup.reminder'), {
          action: { label: t('shell.menu.export'), onClick: async () => { await exportData(slug); showToast(t('shell.exported')); removeNotice('backup'); } },
        }).append(Object.assign(el('button', 'ow-btn ow-btn--link ow-btn--small', t('shell.backup.dismiss')), {
          type: 'button', onclick: () => { dismissBackupReminder(slug); removeNotice('backup'); },
        }));
      } else removeNotice('backup');
    } catch { /* storage unavailable, handled below */ }
  }
  if (stores) {
    if (await storageProblem()) addNotice('storage', t('shell.storage.unavailable'), { warn: true });
    let persisted = false;
    document.addEventListener('ow:datachange', (e) => {
      if (e.detail?.tool !== slug) return;
      if (!persisted) { persisted = true; requestPersistence(); }
      checkData();
    });
    checkData();
  }

  // ---- cloud folder: keep the linked backup current ----
  if (stores) {
    const askAccess = async () => { if ((await syncCloud(slug, { interactive: true })) === 'ok') removeNotice('cloud'); };
    const cloudSync = async () => {
      try {
        if ((await syncCloud(slug)) === 'needs-access') {
          addNotice('cloud', t('cloud.needsAccess'), { action: { label: t('cloud.reconnect'), onClick: () => askAccess().catch(() => {}) } });
        } else removeNotice('cloud');
      } catch { /* folder gone or blocked; the dialog shows details */ }
    };
    let timer;
    document.addEventListener('ow:datachange', (e) => {
      if (e.detail?.tool !== slug) return;
      clearTimeout(timer);
      timer = setTimeout(async () => { if (await getCloudLink(slug)) cloudSync(); }, 1500);
    });
    getCloudLink(slug).then((link) => { if (link) cloudSync(); }).catch(() => {});
  }

  // ---- purchase return link ----
  const params = new URLSearchParams(location.search);
  if (params.get('purchased') === '1') {
    params.delete('purchased');
    history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
    if (hasPremium && !isPremiumUnlocked(slug)) setTimeout(() => openLicense('key'), 0);
  }

  document.addEventListener('ow:licensechange', (e) => { if (e.detail?.toolSlug === slug) { render(); onLicenseChange?.(); } });
  // Only tools with Premium functions re-check a stored key: for a fully free tool the key changes nothing, so no "license disabled" message either (the key itself stays stored).
  if (config.hasPremium) {
    const checkLicense = () => revalidateLicense(slug).then((state) => { if (state === 'revoked') showToast(t('core.license.disabled')); }).catch(() => {});
    checkLicense();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkLicense(); });
  }
  document.addEventListener('ow:langchange', () => { render(); checkData(); applyTranslations(); });
  document.addEventListener('ow:themechange', () => { if (!menu.hidden) buildMenu(); });
  render();
  applyPremiumBadges(main, slug);
  applyTranslations();

  return {
    isPremium: () => isPremiumUnlocked(slug),
    setUsage: (text) => { usage.textContent = text; },
    /** Counter for a free limit. In the free launch phase it only announces the limit with a Premium badge. */
    setPremiumLimit: (limit, usageText) => {
      if (licensing.enabled) { usage.textContent = isPremiumUnlocked(slug) ? '' : usageText; return; }
      usage.textContent = t('shell.premiumLimit', { limit });
      markPremium(usage, slug);
    },
    showLimit: () => addNotice('limit', price ? t('shell.limit', { price }) : t('shell.limitNoPrice'), {
      action: { label: t('shell.unlock'), onClick: () => openLicense('buy') },
    }),
    clearLimit: () => removeNotice('limit'),
    openLicense,
  };
}
