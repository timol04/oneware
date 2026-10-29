/**
 * Writes /sw.js (git-ignored) from scripts/sw-template.js: the service worker with the list of files to keep for offline use.
 * Called at the end of build-tool-registry.js, so every build (GitHub Pages, Cloudflare preview) produces it.
 *   core  = shell pages, core/, hub/, legal, how-it-works, dashboard: stored when the service worker installs
 *   tools = mydashboard/<slug>/ per tool: stored in the background after the first visit (they are large)
 *   lazy  = folders inside a tool that are not stored in the background (the receipt-scan engine, ~7 MB); they are kept offline once used
 * The version is a hash over all listed files, so any change to the site updates the worker.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'scripts', 'tools', 'test', '_demo']);
const SKIP_FILES = new Set(['sw.js', 'CNAME', 'robots.txt', 'sitemap.xml', 'README.md', 'package.json', 'package-lock.json', '.gitignore', '.DS_Store']);

async function walk(root, dir = '') {
  const out = [];
  for (const e of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...await walk(root, rel)); }
    else if (!SKIP_FILES.has(e.name)) out.push(rel);
  }
  return out;
}

// a page file maps to its folder URL (index.html -> dir/), everything else to its own path
const urlOf = (rel) => (rel === 'index.html' ? './' : rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel);

// big optional engines: fetched when first used (the service worker caches them then), not in the background warm-up
export const LAZY = ['vendor/ocr/'];
const isLazy = (rel) => LAZY.some((dir) => rel.includes(`/${dir}`));

export async function buildSw(root, slugs) {
  const files = (await walk(root)).filter((f) => !f.startsWith('mydashboard/') || f === 'mydashboard/index.html' || /^mydashboard\/(dashboard\.(js|css))$/.test(f));
  const core = files.sort();
  const tools = {};
  for (const slug of [...slugs].sort()) {
    tools[slug] = (await walk(root, `mydashboard/${slug}`)).filter((f) => !isLazy(f)).sort().map(urlOf);
  }
  const hash = createHash('sha256');
  for (const f of [...core, ...Object.values(tools).flat().map((u) => (u.endsWith('/') ? u + 'index.html' : u))]) {
    hash.update(f).update(await readFile(path.join(root, f)));
  }
  const template = await readFile(path.join(root, 'scripts', 'sw-template.js'), 'utf8');
  hash.update(template);
  const version = hash.digest('hex').slice(0, 12);
  const manifest = { core: core.map(urlOf), tools, lazy: LAZY };
  const out = template.replace('__VERSION__', version).replace('__MANIFEST__', () => JSON.stringify(manifest));
  await writeFile(path.join(root, 'sw.js'), out);
  return { version, core: manifest.core.length, tools: Object.fromEntries(Object.entries(tools).map(([k, v]) => [k, v.length])) };
}
