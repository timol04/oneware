import { registerMessages, t, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { markPremium } from '../../../core/premium.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import { createIcon } from '../../../core/icons.js';
import { showToast } from '../../../core/ui-components.js';
import { receiveFiles, continueButton } from '../../../core/handoff.js';
import { PREMIUM_FEATURES, MAX_BYTES, MAX_FILES, LEVELS } from './config.js';
import { loadPdf, buildPdf, parseRanges, everyN, repack, picturesToPdf } from './pdf-ops.js';
import { openForDrawing, closeDrawing, drawPage, pagesToJpeg } from './raster.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'pdf-toolkit';
const PDF = 'application/pdf';
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: () => renderAll() });
const locked = (feature) => PREMIUM_FEATURES[feature] && !shell.isPremium();

const MODES = ['organise', 'split', 'compress'];
let mode = 'organise';
let sources = []; // [{ id, name, bytes, count, view }]  view = pdf.js document for thumbnails (opened on demand)
let pages = [];   // [{ uid, src, index, rotate, selected }]  the working order
let nextId = 1;
let running = false;
let current = []; // outputs of the last run: [{ name, data, mime, detail }]

const formatSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const baseName = (name) => name.replace(/\.pdf$/i, '');

// ---------- Files ----------
async function addFiles(list) {
  const note = $('drop-note');
  const messages = [];
  for (const file of [...list]) {
    if (!/\.pdf$/i.test(file.name) && file.type !== PDF) { messages.push(t('drop.unsupported', { name: file.name })); continue; }
    if (file.size > MAX_BYTES) { messages.push(t('drop.tooBig', { name: file.name })); continue; }
    if (sources.length >= MAX_FILES) { messages.push(t('drop.tooMany', { n: MAX_FILES })); break; }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await loadPdf(bytes);
      const src = { id: nextId++, name: file.name, bytes, count: doc.getPageCount(), view: null };
      sources.push(src);
      for (let index = 0; index < src.count; index++) pages.push({ uid: nextId++, src: src.id, index, rotate: 0, selected: false });
    } catch (e) {
      messages.push(t(e.message === 'encrypted' ? 'drop.encrypted' : 'drop.invalid', { name: file.name }));
    }
  }
  note.textContent = messages.join(' ');
  note.hidden = !messages.length;
  clearResults();
  renderAll();
}

function removeSource(id) {
  const src = sources.find((s) => s.id === id);
  src?.view?.then(closeDrawing).catch(() => {});
  sources = sources.filter((s) => s.id !== id);
  pages = pages.filter((p) => p.src !== id);
  for (const key of [...canvases.keys()]) if (key.startsWith(`${id}:`)) canvases.delete(key);
  clearResults();
  renderAll();
}

function renderFiles() {
  $('list').replaceChildren(...sources.map((s) => {
    const li = document.createElement('li');
    li.className = 'pt-file';
    const name = document.createElement('span');
    name.className = 'pt-file__name';
    name.textContent = s.name;
    const meta = document.createElement('span');
    meta.className = 'pt-file__meta';
    meta.textContent = `${t('file.pages', { n: s.count })} · ${formatSize(s.bytes.byteLength)}`;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'ow-btn ow-btn--link ow-btn--small';
    rm.setAttribute('aria-label', t('list.remove', { name: s.name }));
    rm.append(createIcon('x', { size: '1em' }));
    rm.addEventListener('click', () => removeSource(s.id));
    li.append(name, meta, rm);
    return li;
  }));
}

// ---------- Page grid ----------
const BOX_W = 128;
const BOX_H = 168;
const canvases = new Map(); // `${src}:${index}` -> { canvas, drawn }
let queue = Promise.resolve();
const observer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    observer.unobserve(e.target);
    drawThumb(e.target);
  }
}, { rootMargin: '300px' });

function thumbFor(p) {
  const key = `${p.src}:${p.index}`;
  if (!canvases.has(key)) canvases.set(key, { canvas: document.createElement('canvas'), drawn: false });
  return canvases.get(key);
}

function fitCanvas(canvas, rotate) {
  const w = canvas.width || 1;
  const h = canvas.height || 1;
  const turned = rotate % 180 !== 0;
  const boxW = turned ? BOX_H : BOX_W;
  const boxH = turned ? BOX_W : BOX_H;
  const scale = Math.min(boxW / w, boxH / h);
  canvas.style.width = `${Math.round(w * scale)}px`;
  canvas.style.height = `${Math.round(h * scale)}px`;
  canvas.style.transform = `rotate(${rotate}deg)`;
}

function drawThumb(li) {
  const p = pages.find((x) => x.uid === Number(li.dataset.uid));
  if (!p) return;
  const entry = thumbFor(p);
  if (entry.drawn) return;
  entry.drawn = true;
  queue = queue.then(async () => {
    const src = sources.find((s) => s.id === p.src);
    if (!src) return;
    try {
      src.view ??= openForDrawing(src.bytes);
      const view = await src.view;
      await drawPage(view, p.index, entry.canvas, BOX_W, Math.min(window.devicePixelRatio || 1, 2));
      for (const q of pages) if (q.src === p.src && q.index === p.index) {
        const holder = $('grid').querySelector(`[data-uid="${q.uid}"] canvas`);
        if (holder) fitCanvas(holder, q.rotate);
      }
    } catch { entry.drawn = false; }
  });
}

function iconButton(act, icon, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ow-iconbtn pt-act';
  b.dataset.act = act;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.append(createIcon(icon, { size: '1.05em' }));
  return b;
}

function renderGrid() {
  observer.disconnect();
  const show = mode !== 'compress' && pages.length > 0;
  $('pages-card').hidden = mode === 'compress';
  $('pages-empty').hidden = pages.length > 0;
  $('pages-tools').hidden = !show;
  const selected = pages.filter((p) => p.selected).length;
  $('pages-count').textContent = show ? t('pages.count', { n: pages.length, selected }) : '';
  $('rot-sel').disabled = $('del-sel').disabled = !selected;
  $('sel-none').disabled = !selected;
  $('grid').replaceChildren(...pages.map((p, i) => {
    const src = sources.find((s) => s.id === p.src);
    const li = document.createElement('li');
    li.className = `pt-page${p.selected ? ' is-selected' : ''}`;
    li.dataset.uid = String(p.uid);
    li.draggable = true;

    const sel = document.createElement('label');
    sel.className = 'pt-page__sel';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = p.selected;
    box.dataset.act = 'select';
    const lab = document.createElement('span');
    lab.className = 'ow-sr-only';
    lab.textContent = t('page.select', { n: i + 1 });
    sel.append(box, lab);

    const thumb = document.createElement('div');
    thumb.className = 'pt-page__thumb';
    const { canvas, drawn } = thumbFor(p);
    thumb.append(canvas);
    if (drawn) fitCanvas(canvas, p.rotate);
    else { canvas.style.transform = `rotate(${p.rotate}deg)`; canvas.style.width = `${BOX_W}px`; canvas.style.height = `${BOX_H}px`; }

    const meta = document.createElement('div');
    meta.className = 'pt-page__meta';
    const num = document.createElement('strong');
    num.textContent = String(i + 1);
    const from = document.createElement('span');
    from.textContent = sources.length > 1 ? `${baseName(src.name)} · ${p.index + 1}` : '';
    from.title = src.name;
    meta.append(num, from);

    const acts = document.createElement('div');
    acts.className = 'pt-page__acts';
    acts.append(
      iconButton('left', 'arrow-left', t('page.earlier')),
      iconButton('rotate', 'repeat', t('page.rotate')),
      iconButton('delete', 'trash', t('page.delete')),
      iconButton('right', 'arrow-right', t('page.later')),
    );
    acts.querySelector('[data-act="left"]').disabled = i === 0;
    acts.querySelector('[data-act="right"]').disabled = i === pages.length - 1;
    li.append(sel, thumb, meta, acts);
    observer.observe(li);
    return li;
  }));
}

function move(uid, to) {
  const from = pages.findIndex((p) => p.uid === uid);
  const target = Math.max(0, Math.min(pages.length - 1, to));
  if (from < 0 || from === target) return;
  const [p] = pages.splice(from, 1);
  pages.splice(target, 0, p);
}

function pageAction(uid, act) {
  const i = pages.findIndex((p) => p.uid === uid);
  if (i < 0) return;
  if (act === 'left') move(uid, i - 1);
  else if (act === 'right') move(uid, i + 1);
  else if (act === 'rotate') pages[i].rotate = (pages[i].rotate + 90) % 360;
  else if (act === 'delete') pages.splice(i, 1);
  else if (act === 'select') pages[i].selected = !pages[i].selected;
  clearResults();
  renderAll();
  const again = $('grid').querySelector(`[data-uid="${uid}"] [data-act="${act}"]:not(:disabled)`);
  (again ?? $('grid').querySelector(`[data-uid="${uid}"] [data-act="rotate"]`))?.focus();
}

$('grid').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (b) pageAction(Number(b.closest('.pt-page').dataset.uid), b.dataset.act);
});
$('grid').addEventListener('change', (e) => {
  if (e.target.dataset.act === 'select') pageAction(Number(e.target.closest('.pt-page').dataset.uid), 'select');
});
let dragUid = null;
$('grid').addEventListener('dragstart', (e) => {
  const li = e.target.closest?.('.pt-page');
  if (!li) return;
  dragUid = Number(li.dataset.uid);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragUid));
  li.classList.add('is-dragging');
});
$('grid').addEventListener('dragend', () => { dragUid = null; $('grid').querySelectorAll('.is-dragging,.is-target').forEach((el) => el.classList.remove('is-dragging', 'is-target')); });
$('grid').addEventListener('dragover', (e) => {
  const li = e.target.closest?.('.pt-page');
  if (dragUid === null || !li) return;
  e.preventDefault();
  $('grid').querySelectorAll('.is-target').forEach((el) => el.classList.remove('is-target'));
  li.classList.add('is-target');
});
$('grid').addEventListener('drop', (e) => {
  const li = e.target.closest?.('.pt-page');
  if (dragUid === null || !li) return;
  e.preventDefault();
  const to = pages.findIndex((p) => p.uid === Number(li.dataset.uid));
  move(dragUid, to);
  dragUid = null;
  clearResults();
  renderAll();
});

$('sel-all').addEventListener('click', () => { pages.forEach((p) => { p.selected = true; }); renderAll(); });
$('sel-none').addEventListener('click', () => { pages.forEach((p) => { p.selected = false; }); renderAll(); });
$('rot-sel').addEventListener('click', () => { pages.filter((p) => p.selected).forEach((p) => { p.rotate = (p.rotate + 90) % 360; }); clearResults(); renderAll(); });
$('del-sel').addEventListener('click', () => { pages = pages.filter((p) => !p.selected); clearResults(); renderAll(); });
$('reset').addEventListener('click', () => {
  pages = sources.flatMap((s) => Array.from({ length: s.count }, (_, index) => ({ uid: nextId++, src: s.id, index, rotate: 0, selected: false })));
  clearResults();
  renderAll();
});

// ---------- Mode and options ----------
function renderModes() {
  $('modes').replaceChildren(...MODES.map((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pt-chip';
    b.dataset.mode = id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(mode === id));
    b.append(t(`mode.${id}`));
    if (id === 'split' && PREMIUM_FEATURES.splitMany) markPremium(b, SLUG, { compact: true });
    return b;
  }));
  $('mode-hint').textContent = t(`hint.${mode}`);
  $('opt-organise').hidden = mode !== 'organise';
  $('opt-split').hidden = mode !== 'split';
  $('opt-compress').hidden = mode !== 'compress';
  const selected = pages.filter((p) => p.selected).length;
  $('row-selected').hidden = !selected;
  $('only-selected-label').textContent = t('opt.onlySelected', { n: selected });
  if (!selected) $('only-selected').checked = false;
  else if (!$('only-selected').dataset.touched) $('only-selected').checked = true;
  $('row-ranges').hidden = $('split-by').value !== 'ranges';
  $('row-every').hidden = $('split-by').value !== 'every';
  for (const o of $('level').options) {
    const key = o.dataset.i18n;
    o.textContent = o.value !== 'lossless' && PREMIUM_FEATURES.compressStrong && !shell.isPremium() ? `${t(key)} (${t('shell.premium')})` : t(key);
  }
  const lossy = $('level').value !== 'lossless';
  $('cmp-warn').hidden = !lossy;
  $('cmp-warn').textContent = lossy ? t('cmp.warn') : '';
  $('go').textContent = t(`go.${mode}`);
  $('go').disabled = running || !sources.length || (mode !== 'compress' && !pages.length);
}

$('modes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  mode = b.dataset.mode;
  clearResults();
  renderAll();
});
$('only-selected').addEventListener('change', (e) => { e.target.dataset.touched = '1'; });
for (const id of ['split-by', 'level']) $(id).addEventListener('change', () => { clearResults(); renderModes(); });

// ---------- Run ----------
function clearResults() {
  current = [];
  $('results').replaceChildren();
  $('notes').replaceChildren();
  $('progress').textContent = '';
}

function download(data, name, mime) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function uniqueNames(outputs) {
  const seen = new Map();
  return outputs.map((o) => {
    const n = seen.get(o.name) ?? 0;
    seen.set(o.name, n + 1);
    if (!n) return o;
    const dot = o.name.lastIndexOf('.');
    return { ...o, name: `${o.name.slice(0, dot)} (${n + 1})${o.name.slice(dot)}` };
  });
}

const sourceBytes = () => sources.map((s) => s.bytes);
const indexOfSource = (id) => sources.findIndex((s) => s.id === id);
const toEntries = (list) => list.map((p) => ({ src: indexOfSource(p.src), index: p.index, rotate: p.rotate }));
const pause = () => new Promise((r) => setTimeout(r, 0));

async function runOrganise() {
  const picked = $('only-selected').checked && pages.some((p) => p.selected) ? pages.filter((p) => p.selected) : pages;
  const used = new Set(picked.map((p) => p.src));
  const only = sources.find((s) => s.id === picked[0].src);
  const name = used.size > 1 ? 'oneware-merged.pdf' : `${baseName(only.name)}-${picked.length === pages.length ? 'edited' : 'pages'}.pdf`;
  $('progress').textContent = t('go.working');
  await pause();
  return { outputs: [{ name, data: await buildPdf(sourceBytes(), toEntries(picked)), mime: PDF }], notes: [] };
}

async function runSplit() {
  let groups;
  if ($('split-by').value === 'ranges') {
    try {
      groups = parseRanges($('ranges').value, pages.length);
    } catch (e) {
      if (e.message !== 'range') throw e;
      throw new Error(e.token ? `range:${e.token}` : 'range-empty');
    }
  } else {
    const n = Number($('every').value);
    if (!Number.isInteger(n) || n < 1) throw new Error('every');
    groups = everyN(pages.length, n);
  }
  if (groups.length > 1 && locked('splitMany')) { shell.showLimit(); throw new Error('locked'); }
  const outputs = [];
  const pad = String(groups.length).length;
  const lead = pages.every((p) => p.src === pages[0].src) ? baseName(sources.find((s) => s.id === pages[0].src).name) : 'oneware';
  for (const [i, group] of groups.entries()) {
    $('progress').textContent = t('go.part', { n: i + 1, total: groups.length });
    await pause();
    const name = groups.length === 1 ? `${lead}-pages.pdf` : `${lead}-part-${String(i + 1).padStart(pad, '0')}.pdf`;
    outputs.push({ name, data: await buildPdf(sourceBytes(), toEntries(group.map((k) => pages[k]))), mime: PDF });
  }
  return { outputs, notes: [] };
}

async function compressOne(src) {
  const level = $('level').value;
  if (level === 'lossless') return repack(src.bytes);
  const view = await openForDrawing(src.bytes);
  try {
    const pictures = await pagesToJpeg(view, LEVELS[level], (n, total) => {
      $('progress').textContent = t('go.compressPage', { name: src.name, n, total });
    });
    return await picturesToPdf(pictures);
  } finally {
    await closeDrawing(view);
  }
}

async function runCompress() {
  if ($('level').value !== 'lossless' && locked('compressStrong')) { shell.showLimit(); throw new Error('locked'); }
  const outputs = [];
  const notes = [];
  for (const src of sources) {
    $('progress').textContent = t('go.compress', { name: src.name });
    await pause();
    const out = await compressOne(src);
    if (out.byteLength >= src.bytes.byteLength) { notes.push({ key: 'note.noGain', name: src.name }); continue; }
    const saved = Math.round((1 - out.byteLength / src.bytes.byteLength) * 100);
    outputs.push({
      name: `${baseName(src.name)}-compressed.pdf`, data: out, mime: PDF,
      detail: t('result.saved', { before: formatSize(src.bytes.byteLength), after: formatSize(out.byteLength), percent: saved }),
    });
  }
  return { outputs, notes };
}

function errorText(e) {
  const m = e?.message ?? '';
  if (m.startsWith('range:')) return t('err.range', { token: m.slice(6) });
  if (m === 'range-empty') return t('err.rangeEmpty');
  if (m === 'every') return t('err.every');
  if (m === 'encrypted') return t('err.encrypted');
  return t('err.failed');
}

async function run() {
  if (running || !sources.length) return;
  running = true;
  clearResults();
  $('go').disabled = true;
  const errors = [];
  let result = { outputs: [], notes: [] };
  try {
    result = await ({ organise: runOrganise, split: runSplit, compress: runCompress }[mode])();
  } catch (e) {
    if (e?.message !== 'locked') errors.push(errorText(e));
  } finally {
    running = false;
  }
  current = uniqueNames(result.outputs);
  renderResults(errors, result.notes);
  $('progress').textContent = current.length ? t('go.done', { n: current.length }) : '';
  renderModes();
}

const sizeOf = (d) => (d instanceof Blob ? d.size : d.byteLength);

function renderResults(errors, notes) {
  const box = $('results');
  const ul = document.createElement('ul');
  ul.className = 'pt-out';
  for (const o of current) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = o.name;
    const size = document.createElement('span');
    size.className = 'size';
    size.textContent = o.detail ?? formatSize(sizeOf(o.data));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ow-btn ow-btn--secondary ow-btn--small';
    btn.append(createIcon('download', { size: '1em' }), ` ${t('go.download')}`);
    btn.addEventListener('click', () => download(o.data, o.name, o.mime));
    li.append(name, size, btn);
    if (o.mime === PDF) li.append(continueButton({ tool: 'converter', label: t('core.handoff.converter'), onFail: showToast, getFiles: () => [{ name: o.name, type: o.mime, data: o.data }] }));
    ul.append(li);
  }
  for (const msg of errors) {
    const li = document.createElement('li');
    li.className = 'is-error';
    li.textContent = msg;
    ul.append(li);
  }
  box.replaceChildren(...(current.length || errors.length ? [ul] : []));
  if (current.length > 1) {
    const zip = document.createElement('button');
    zip.type = 'button';
    zip.className = 'ow-btn pt-zip';
    zip.append(createIcon('download', { size: '1em' }), ` ${t('go.zip')}`);
    zip.addEventListener('click', downloadZip);
    box.append(zip);
  }
  $('notes').replaceChildren(...notes.map((n) => {
    const p = document.createElement('p');
    p.className = 'ow-status ow-status--yellow';
    p.textContent = `${n.name}: ${t(n.key)}`;
    return p;
  }));
}

async function downloadZip() {
  $('progress').textContent = t('go.zipping');
  try {
    const { default: JSZip } = await import('../vendor/jszip.js');
    const zip = new JSZip();
    for (const o of current) zip.file(o.name, o.data);
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
    download(bytes, 'oneware-pdf.zip', 'application/zip');
  } catch {
    showToast(t('err.failed'));
  }
  $('progress').textContent = t('go.done', { n: current.length });
}

// ---------- Events ----------
$('file').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', (e) => addFiles(e.dataTransfer?.files ?? []));
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
$('go').addEventListener('click', run);

// ---------- Static texts ----------
function renderAll() {
  applyTranslations();
  $('drop-icon').replaceChildren(createIcon('upload', { size: '2rem' }));
  $('privacy').textContent = t('drop.privacy');
  drop.tabIndex = 0;
  $('limits').replaceChildren(...['good', 'compress', 'forms', 'protected', 'reorder'].map((k) => {
    const li = document.createElement('li');
    li.textContent = t(`limits.${k}`);
    return li;
  }));
  shell.setUsage(shell.isPremium() ? '' : t('usage.free'));
  renderFiles();
  renderModes();
  renderGrid();
}

onLangChange(() => { clearResults(); renderAll(); });
renderAll();
// PDFs handed over from another tool
const handed = await receiveFiles();
if (handed) addFiles(handed.files);
