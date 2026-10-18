#!/usr/bin/env node
/**
 * Scans /tools/, validates every tool.config.json and writes
 *   - hub/tool-registry.json          (array of all tool configs)
 *   - the pre-rendered catalog in index.html (between the catalog markers; English)
 * Folders starting with "_" (e.g. _demo) are skipped unless INCLUDE_DEMO=1 is set.
 *
 * tool.config.json fields
 *   required: slug name shortDescription category status icon price hasPremium
 *   optional: purchaseUrl lemonSqueezy{productId} order accent{light,dark} about features{free[],premium[]} stores
 *   name / shortDescription / price / about / features entries: string (English) or { en, de, ... }
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ICONS, ICON_NAMES } from '../core/icons.js';
import { LOCALES } from '../core/locales/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = path.join(root, 'tools');
const outFile = path.join(root, 'hub', 'tool-registry.json');
const indexFile = path.join(root, 'index.html');
const includeDemo = process.env.INCLUDE_DEMO === '1';

const REQUIRED = ['slug', 'name', 'shortDescription', 'category', 'status', 'icon', 'price', 'hasPremium'];
const STATUSES = ['live', 'coming-soon'];
const LANGS = Object.keys(LOCALES);

const text = (v) => (typeof v === 'object' && v ? v.en ?? Object.values(v)[0] : v) ?? '';
const isPlaceholderUrl = (u) => /example\.com|\[.*\]/i.test(u || '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = /^#[0-9a-fA-F]{6}$/;

const errors = [];
const warnings = [];
const tools = [];

for (const entry of await readdir(toolsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (entry.name.startsWith('_') && !includeDemo) continue;
  const file = path.join(toolsDir, entry.name, 'tool.config.json');
  if (!existsSync(file)) { warnings.push(`${entry.name}: no tool.config.json, skipped`); continue; }
  const fail = (msg) => errors.push(`${entry.name}: ${msg}`);

  let cfg;
  try { cfg = JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { fail(`invalid JSON (${e.message})`); continue; }

  for (const k of REQUIRED) if (cfg[k] === undefined || cfg[k] === '') fail(`field "${k}" is missing`);
  if (cfg.slug !== entry.name && !(includeDemo && entry.name.startsWith('_'))) fail(`slug "${cfg.slug}" does not match the folder name`);
  if (cfg.status && !STATUSES.includes(cfg.status)) fail(`status must be ${STATUSES.join(' or ')}`);
  if (cfg.icon && !ICON_NAMES.includes(cfg.icon)) fail(`icon "${cfg.icon}" unknown (allowed: ${ICON_NAMES.join(', ')})`);
  for (const k of ['name', 'shortDescription', 'price', 'about']) {
    if (typeof cfg[k] === 'object' && cfg[k] && !cfg[k].en) fail(`"${k}" needs an "en" entry`);
    if (typeof cfg[k] === 'object' && cfg[k]) for (const l of LANGS) if (!cfg[k][l]) warnings.push(`${entry.name}: "${k}" has no "${l}" translation`);
  }
  if (cfg.accent && !(hex.test(cfg.accent.light) && hex.test(cfg.accent.dark))) fail('accent needs { "light": "#rrggbb", "dark": "#rrggbb" }');
  for (const k of ['free', 'premium']) if (cfg.features?.[k] && !Array.isArray(cfg.features[k])) fail(`features.${k} must be an array`);
  if (cfg.lemonSqueezy && !Number.isInteger(cfg.lemonSqueezy.productId)) fail('lemonSqueezy.productId must be a number');
  if (cfg.hasPremium && cfg.status === 'live' && !cfg.lemonSqueezy?.productId) {
    if (cfg.category === 'demo') warnings.push(`${entry.name}: no lemonSqueezy.productId (demo tools use offline keys)`);
    else fail('hasPremium requires lemonSqueezy.productId (online license check)');
  }
  if (cfg.hasPremium && cfg.status === 'live') {
    if (!/^https?:\/\//.test(cfg.purchaseUrl || '')) fail('hasPremium requires a valid purchaseUrl');
    else if (isPlaceholderUrl(cfg.purchaseUrl)) {
      if (cfg.category === 'demo') warnings.push(`${entry.name}: purchaseUrl is still a placeholder (allowed for demo tools)`);
      else fail('purchaseUrl is still a placeholder');
    }
  }
  tools.push({ ...cfg, path: `tools/${entry.name}/` });
}

if (errors.length) {
  console.error('Registry not built:\n- ' + errors.join('\n- '));
  process.exit(1);
}

tools.sort((a, b) =>
  (a.status === b.status ? 0 : a.status === 'live' ? -1 : 1)
  || (a.order ?? 1e6) - (b.order ?? 1e6)
  || text(a.name).localeCompare(text(b.name), 'en'));
await writeFile(outFile, JSON.stringify(tools, null, 2) + '\n');

// ---- pre-rendered catalog (English), so the list works without JavaScript ----
const en = LOCALES.en;
const icon = (name) => `<svg class="ow-icon" viewBox="0 0 24 24" width="1.4rem" height="1.4rem" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
function row(tool) {
  const live = tool.status === 'live';
  const style = tool.accent ? ` style="--accent-l:${tool.accent.light};--accent-d:${tool.accent.dark}"` : '';
  const inner = `<span class="tool-row__icon">${icon(tool.icon)}</span><h3 class="tool-row__name">${esc(text(tool.name))}</h3>`
    + `<div class="tool-row__side"><span class="tool-row__price">${esc(text(tool.price))}</span>`
    + `<span class="ow-status ow-status--${live ? 'green' : 'yellow'}">${esc(live ? en['hub.live'] : en['hub.soon'])}</span></div>`
    + `<p class="tool-row__desc">${esc(text(tool.shortDescription))}</p>`;
  return `        <li class="tool-row${live ? '' : ' tool-row--soon'}" data-category="${esc(tool.category)}"${style}>`
    + (live ? `<a href="${esc(tool.path)}">${inner}</a>` : `<div class="tool-row__inner">${inner}</div>`) + '</li>';
}
const html = await readFile(indexFile, 'utf8');
const rows = tools.length ? tools.map(row).join('\n') : `        <li class="catalog__msg ow-muted">${esc(en['hub.empty'])}</li>`;
const next = html.replace(/(<!-- catalog:start -->)[\s\S]*?(<!-- catalog:end -->)/, `$1\n${rows}\n        $2`);
if (next !== html) await writeFile(indexFile, next);

for (const w of warnings) console.warn(`warning: ${w}`);
console.log(`${tools.length} tool(s) written to hub/tool-registry.json`);
