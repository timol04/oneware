#!/usr/bin/env node
/**
 * Durchsucht /tools/, liest jede tool.config.json und schreibt /hub/tool-registry.json.
 * Ordner, die mit "_" beginnen (z. B. _demo), werden übersprungen – ausser INCLUDE_DEMO=1 ist gesetzt.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = path.join(root, 'tools');
const outFile = path.join(root, 'hub', 'tool-registry.json');
const includeDemo = process.env.INCLUDE_DEMO === '1';

const REQUIRED = ['slug', 'name', 'shortDescription', 'category', 'status', 'icon', 'price', 'hasPremium'];
const STATUSES = ['live', 'coming-soon'];

const errors = [];
const tools = [];

for (const entry of await readdir(toolsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (entry.name.startsWith('_') && !includeDemo) continue;
  const file = path.join(toolsDir, entry.name, 'tool.config.json');
  if (!existsSync(file)) { console.warn(`⚠ ${entry.name}: keine tool.config.json, übersprungen`); continue; }

  let cfg;
  try { cfg = JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { errors.push(`${entry.name}: ungültiges JSON (${e.message})`); continue; }

  for (const k of REQUIRED) if (cfg[k] === undefined || cfg[k] === '') errors.push(`${entry.name}: Feld "${k}" fehlt`);
  if (cfg.slug !== entry.name && !(includeDemo && entry.name.startsWith('_'))) errors.push(`${entry.name}: slug "${cfg.slug}" passt nicht zum Ordnernamen`);
  if (cfg.status && !STATUSES.includes(cfg.status)) errors.push(`${entry.name}: status muss ${STATUSES.join(' oder ')} sein`);
  if (cfg.hasPremium && cfg.status === 'live' && !/^https?:\/\//.test(cfg.purchaseUrl || '')) errors.push(`${entry.name}: hasPremium ohne gültige purchaseUrl`);
  tools.push({ ...cfg, path: `tools/${entry.name}/` });
}

if (errors.length) {
  console.error('Registry nicht gebaut:\n- ' + errors.join('\n- '));
  process.exit(1);
}

tools.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name, 'de') : a.status === 'live' ? -1 : 1));
await writeFile(outFile, JSON.stringify(tools, null, 2) + '\n');
console.log(`✓ ${tools.length} Tool(s) → hub/tool-registry.json`);
