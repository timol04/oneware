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
export function injectToolSeo(html, tool, { free }) {
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
  return html.replace(/<\/title>\n?/, (m) => `${m.endsWith('\n') ? m : `${m}\n`}${tags}`);
}

/** sitemap.xml for the fixed pages plus every live tool. */
export function sitemapXml(tools) {
  const urls = [`${SITE}/`, `${SITE}/how-it-works/`, ...tools.filter((t) => t.status === 'live').map(toolUrl),
    `${SITE}/legal/privacy/`, `${SITE}/legal/imprint/`];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${u}</loc></url>\n`).join('') + '</urlset>\n';
}
