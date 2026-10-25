import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolTitle, toolDescription, toolUrl, sitemapXml, SITE } from '../../scripts/seo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = async () => {
  const tools = [];
  for (const d of await readdir(path.join(root, 'tools'), { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('_')) continue;
    tools.push(JSON.parse(await readFile(path.join(root, 'tools', d.name, 'tool.config.json'), 'utf8')));
  }
  return tools.filter((t) => t.status === 'live');
};

test('every live tool has its own title and description of sensible length', async () => {
  const tools = await load();
  const titles = new Set();
  const descs = new Set();
  for (const t of tools) {
    for (const lang of ['en', 'de']) {
      const title = t.seo?.title?.[lang];
      const desc = t.seo?.description?.[lang];
      assert.ok(title && title.length <= 70, `${t.slug} ${lang}: title missing or over 70 characters`);
      assert.ok(desc && desc.length >= 60 && desc.length <= 170, `${t.slug} ${lang}: description missing or outside 60-170 characters`);
    }
    assert.ok(!titles.has(toolTitle(t)), `${t.slug}: duplicate title`);
    assert.ok(!descs.has(toolDescription(t)), `${t.slug}: duplicate description`);
    titles.add(toolTitle(t));
    descs.add(toolDescription(t));
  }
});

test('every related tool in seo.related exists and is live', async () => {
  const tools = await load();
  const slugs = new Set(tools.map((t) => t.slug));
  for (const t of tools) for (const r of t.seo?.related ?? []) assert.ok(slugs.has(r), `${t.slug}: related "${r}" is not a live tool`);
});

test('sitemap lists the home page, every live tool and the legal pages, once each, on the canonical host', async () => {
  const tools = await load();
  const urls = [...sitemapXml(tools).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.every((u) => u.startsWith(`${SITE}/`) && u.endsWith('/')));
  for (const t of tools) assert.ok(urls.includes(toolUrl(t)), `${t.slug} missing in sitemap`);
  for (const p of ['legal/privacy/', 'legal/terms/', 'legal/refund/', 'legal/licenses/', 'legal/imprint/']) assert.ok(urls.includes(`${SITE}/${p}`));
  assert.equal(urls[0], `${SITE}/`);
});

test('the committed sitemap.xml and robots.txt match the build', async () => {
  const tools = await load();
  const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(locs(await readFile(path.join(root, 'sitemap.xml'), 'utf8')), locs(sitemapXml(tools)));
  assert.match(await readFile(path.join(root, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/oneware\.page\/sitemap\.xml/);
});
