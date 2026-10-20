/**
 * SEO helpers for build-tool-registry.js: head tags for the mirrored tool pages and sitemap.xml.
 * The canonical host lives here; everything else is derived from tool.config.json
 * (seo.title / seo.description override the defaults, strings or { en, de }).
 */
export const SITE = 'https://oneware.page';

const CATEGORY_TYPES = { tracker: 'FinanceApplication', study: 'EducationalApplication', utility: 'UtilitiesApplication' };

const pick = (v) => (typeof v === 'object' && v ? v.en ?? Object.values(v)[0] : v) ?? '';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ldJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

export const toolUrl = (tool) => `${SITE}/mydashboard/${tool.slug}/`;
export const toolTitle = (tool) => pick(tool.seo?.title) || `${pick(tool.name)} – Oneware`;
export const toolDescription = (tool) => pick(tool.seo?.description) || `${pick(tool.shortDescription)} ${pick(tool.about)}`.trim();

function structuredData(tool, free) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: pick(tool.name),
    url: toolUrl(tool),
    description: toolDescription(tool),
    applicationCategory: CATEGORY_TYPES[tool.category] ?? 'LifestyleApplication',
    operatingSystem: 'Any (web browser)',
    browserRequirements: 'Requires JavaScript',
    inLanguage: ['en', 'de'],
    isPartOf: { '@type': 'WebSite', name: 'Oneware', url: `${SITE}/` },
  };
  if (free) data.offers = { '@type': 'Offer', price: '0', priceCurrency: 'USD' };
  return data;
}

/** Rewrites the head of a mirrored tool page: title, description, canonical, Open Graph, Twitter, JSON-LD. */
export function injectToolSeo(html, tool, { free, registry = [] }) {
  const title = esc(toolTitle(tool));
  const desc = esc(toolDescription(tool));
  const url = toolUrl(tool);
  const strip = (re) => { html = html.replace(re, ''); };
  strip(/[ \t]*<meta (?:name|property)="(?:description|og:title|og:description|og:type|og:url|og:site_name|twitter:[a-z]+)"[^>]*>\n?/g);
  strip(/[ \t]*<link rel="canonical"[^>]*>\n?/g);
  html = html.replace(/<title[^>]*>[^<]*<\/title>/, `<title>${title}</title>`);
  const tags = [
    `<meta name="description" content="${desc}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${desc}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:url" content="${url}">`,
    '<meta property="og:site_name" content="Oneware">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${desc}">`,
    `<meta name="twitter:image" content="${SITE}/core/og.png">`,
    `<script type="application/ld+json">${ldJson(structuredData(tool, free))}</script>`,
  ].map((l) => `  ${l}\n`).join('');
  html = html.replace(/<\/title>\n?/, (m) => `${m.endsWith('\n') ? m : `${m}\n`}${tags}`);
  return html.replace(/<\/main>/, () => `</main>\n  ${noscriptNav('../../')}\n  ${toolStaticSection(tool, registry, { free })}`);
}

/** sitemap.xml for the fixed pages plus every live tool. */
export function sitemapXml(tools) {
  const urls = [`${SITE}/`, `${SITE}/how-it-works/`, ...tools.filter((t) => t.status === 'live').map(toolUrl),
    `${SITE}/legal/privacy/`, `${SITE}/legal/terms/`, `${SITE}/legal/licenses/`, `${SITE}/legal/imprint/`];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${u}</loc></url>\n`).join('') + '</urlset>\n';
}

// ---- prerendering: plain HTML for visitors and bots that do not run JavaScript ----

const NAV = [['', 'Oneware'], ['#tools', 'Tools'], ['how-it-works/', 'How it works'], ['legal/privacy/', 'Privacy'], ['legal/terms/', 'Terms'], ['legal/licenses/', 'Third-party licenses'], ['legal/imprint/', 'About']];

/** Plain links to the main pages, shown only when JavaScript is off (the site shell is mounted by JS). `rel` is the path back to the site root, ending in a slash. */
export function noscriptNav(rel) {
  const links = NAV.map(([href, label]) => `<a href="${rel}${href}">${label}</a>`).join(' · ');
  return `<noscript><nav aria-label="Main">${links}</nav></noscript>`;
}

/** Fills elements and attributes marked data-i18n / data-i18n-attr with the English text (what the page shows on first load). */
export function fillI18n(html, en) {
  const text = (k) => (typeof en[k] === 'string' && !en[k].includes('{') ? esc(en[k]) : null);
  html = html.replace(/<(\w+)([^>]*?\sdata-i18n="([^"]+)"[^>]*)>([^<]*)<\/\1>/g, (all, tag, attrs, key, inner) => {
    const v = text(key);
    return v === null ? all : `<${tag}${attrs}>${v}</${tag}>`;
  });
  return html.replace(/<([\w-]+)((?:\s[^>]*?)?)\sdata-i18n-attr="([^"]+)"([^>]*)>/g, (all, tag, pre, spec, post) => {
    let out = `<${tag}${pre} data-i18n-attr="${spec}"${post}>`;
    for (const pair of spec.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      const v = attr && key ? text(key) : null;
      if (v === null) continue;
      const re = new RegExp(`(\\s${attr}=")[^"]*(")`);
      out = re.test(out) ? out.replace(re, `$1${v}$2`) : out.replace(/>$/, ` ${attr}="${v}">`);
    }
    return out;
  });
}

const list = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

/** Static copy of a tool's text content (heading, description, features, FAQ, related tools). The tool shell removes it once JS runs. */
export function toolStaticSection(tool, registry, { free }) {
  const prem = (tool.features?.premium ?? []).map(pick);
  const feats = [...(tool.features?.free ?? []).map(pick), ...(free ? prem : [])];
  const related = (tool.seo?.related ?? []).map((s) => registry.find((t) => t.slug === s)).filter(Boolean);
  let h = '<section id="seo-static" class="ow-container ow-prose">';
  h += `<h1>${esc(pick(tool.name))}</h1><p>${esc(pick(tool.about))}</p>`;
  if (feats.length) h += `<h2>${free ? 'Included, free for now' : 'Features'}</h2>${list(feats)}`;
  if (!free && prem.length) h += `<h2>Premium</h2>${list(prem)}`;
  if (tool.seo?.faq?.length) {
    h += '<h2>Questions and answers</h2>';
    for (const f of tool.seo.faq) h += `<h3>${esc(pick(f.q))}</h3><p>${esc(pick(f.a))}</p>`;
  }
  if (related.length) h += `<h2>More tools</h2><ul>${related.map((t) => `<li><a href="../${t.slug}/">${esc(pick(t.name))}</a>: ${esc(pick(t.shortDescription))}</li>`).join('')}</ul>`;
  return `${h}</section>`;
}
