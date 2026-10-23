/**
 * handoff.js - passes files from one Oneware tool to another without a download in between.
 * The files are kept for a moment in the browser's own database ("handoff" store, never uploaded),
 * the next tool picks them up through the link (?handoff=<id>) and the record is deleted right away.
 * Records that nobody picked up are removed after an hour.
 */
import { t } from './i18n.js';
import { createIcon } from './icons.js';
import { saveItem, getAllItems, deleteItem } from './storage.js';

const STORE = 'handoff';
const TTL = 60 * 60 * 1000;

async function sweep(now = Date.now()) {
  for (const rec of await getAllItems(STORE)) if (now - rec.created > TTL) await deleteItem(STORE, rec.id);
}

/** Stores files for another tool; returns the id to put into the link. `files` are File objects or { name, type, data } with data as Blob, ArrayBuffer or Uint8Array. */
export async function stashFiles(files) {
  await sweep().catch(() => {});
  const stored = [];
  for (const f of files) {
    const src = f.data ?? f;
    const data = typeof src.arrayBuffer === 'function' ? await src.arrayBuffer() : src instanceof ArrayBuffer ? src : new Uint8Array(src).slice().buffer;
    stored.push({ name: f.name, type: f.type ?? '', data });
  }
  return (await saveItem(STORE, { created: Date.now(), files: stored })).id;
}

/** Link to a tool that opens with the stashed files. `tool` is the folder name, e.g. "converter". */
export const handoffUrl = (tool, id, params = {}) => {
  const q = new URLSearchParams({ handoff: id, ...params });
  return `../${tool}/?${q}`;
};

/** Stashes the files and opens the other tool. Returns false when it failed (nothing was left behind). */
export async function sendToTool(tool, files, params = {}) {
  try {
    const id = await stashFiles(files);
    location.href = handoffUrl(tool, id, params);
    return true;
  } catch {
    return false;
  }
}

/** Files handed over to this page, as { files, params }, or null. Removes the record and cleans the address. */
export async function receiveFiles() {
  const url = new URL(location.href);
  const id = url.searchParams.get('handoff');
  if (!id) return null;
  const params = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'handoff'));
  url.searchParams.delete('handoff');
  for (const k of Object.keys(params)) url.searchParams.delete(k);
  history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
  try {
    const rec = (await getAllItems(STORE)).find((r) => r.id === id);
    if (!rec) return null;
    await deleteItem(STORE, id);
    return { files: rec.files.map((f) => new File([f.data], f.name, { type: f.type })), params };
  } catch {
    return null;
  }
}

/** A "Continue with <tool>" button that hands over the files produced by `getFiles()` (File[] or a promise of them). */
export function continueButton({ tool, label, getFiles, params, onFail }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ow-btn ow-btn--secondary ow-btn--small';
  b.append(createIcon('arrow-right', { size: '1em' }), ` ${t('core.handoff.continue', { tool: label })}`);
  b.addEventListener('click', async () => {
    b.disabled = true;
    const ok = await sendToTool(tool, await getFiles(), params);
    if (!ok) { b.disabled = false; onFail?.(t('core.handoff.failed')); }
  });
  return b;
}
