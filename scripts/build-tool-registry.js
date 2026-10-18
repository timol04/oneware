#!/usr/bin/env node
/**
 * Scans /tools/, reads every tool.config.json and writes /hub/tool-registry.json.
 * Folders starting with "_" (e.g. _demo) are skipped unless INCLUDE_DEMO=1 is set.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ICON_NAMES } from '../core/icons.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = path.join(root, 'tools');
const outFile = path.join(root, 'hub', 'tool-registry.json');
const includeDemo = process.env.INCLUDE_DEMO === '1';

const REQUIRED = ['slug', 'name', 'shortDescription', 'category', 'status', 'icon', 'price', 'hasPremium'];
const STATUSES = ['live', 'coming-soon'];

// name / shortDescription / price may be a string (English) or { en: '…', de: '…' }
const text = (v) => (typeof v === 'object' && v ? v.en ?? Object.values(v)[0] : v) ?? '';

const errors = [];
const tools = [];

for (const entry of await readdir(toolsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (entry.name.startsWith('_') && !includeDemo) continue;
  const file = path.join(toolsDir, entry.name, 'tool.config.json');
  if (!existsSync(file)) { console.warn(`warning: ${entry.name}: no tool.config.json, skipped`); continue; }

  let cfg;
  try { cfg = JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { errors.push(`${entry.name}: invalid JSON (${e.message})`); continue; }

  for (const k of REQUIRED) if (cfg[k] === undefined || cfg[k] === '') errors.push(`${entry.name}: field "${k}" is missing`);
  if (cfg.slug !== entry.name && !(includeDemo && entry.name.startsWith('_'))) errors.push(`${entry.name}: slug "${cfg.slug}" does not match the folder name`);
  for (const k of ['name', 'shortDescription']) {
    if (typeof cfg[k] === 'object' && cfg[k] && !cfg[k].en) errors.push(`${entry.name}: "${k}" needs an "en" entry`);
  }
  if (cfg.icon && !ICON_NAMES.includes(cfg.icon)) errors.push(`${entry.name}: icon "${cfg.icon}" unknown (allowed: ${ICON_NAMES.join(', ')})`);
  if (cfg.status && !STATUSES.includes(cfg.status)) errors.push(`${entry.name}: status must be ${STATUSES.join(' or ')}`);
  if (cfg.hasPremium && cfg.status === 'live' && !/^https?:\/\//.test(cfg.purchaseUrl || '')) errors.push(`${entry.name}: hasPremium requires a valid purchaseUrl`);
  tools.push({ ...cfg, path: `tools/${entry.name}/` });
}

if (errors.length) {
  console.error('Registry not built:\n- ' + errors.join('\n- '));
  process.exit(1);
}

tools.sort((a, b) => (a.status === b.status ? text(a.name).localeCompare(text(b.name), 'en') : a.status === 'live' ? -1 : 1));
await writeFile(outFile, JSON.stringify(tools, null, 2) + '\n');
console.log(`${tools.length} tool(s) written to hub/tool-registry.json`);
