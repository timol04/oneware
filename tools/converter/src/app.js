import { registerMessages, t, applyTranslations, onLangChange, getLang } from '../../../core/i18n.js';
import { markPremium } from '../../../core/premium.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import { createIcon } from '../../../core/icons.js';
import { showToast } from '../../../core/ui-components.js';
import { PREMIUM_FEATURES, MAX_BYTES, MAX_FILES } from './config.js';
import { kindOf, commonTargets, MIME } from './formats.js';
import { convertFile, imagesToOnePdf } from './convert.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'converter';
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: onLicense });
const locked = (feature) => PREMIUM_FEATURES[feature] && !shell.isPremium();

let files = [];     // [{ file, name, kind }]
let target = '';
let running = false;
let current = [];   // outputs of the last run: [{ name, data, mime }]

const formatSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const isImageToPdf = () => target === 'pdf' && files.length > 0 && files.every((f) => f.kind === 'image');

// ---------- Files ----------
function addFiles(list) {
  const note = $('drop-note');
  const messages = [];
  let incoming = [...list];
  if (!incoming.length) return;
  if (locked('batch') && (files.length + incoming.length > 1)) {
    // Free: one file at a time; a new drop replaces the current file.
    if (incoming.length > 1 || files.length) messages.push(t('drop.batchLocked'));
    files = [];
    incoming = incoming.slice(0, 1);
  }
  for (const file of incoming) {
    const kind = kindOf(file.name);
    if (!kind) { messages.push(t('drop.unsupported', { name: file.name })); continue; }
    if (file.size > MAX_BYTES) { messages.push(t('drop.tooBig', { name: file.name })); continue; }
    if (files.length >= MAX_FILES) { messages.push(t('drop.tooMany', { n: MAX_FILES })); break; }
    files.push({ file, name: file.name, kind });
  }
  note.textContent = messages.join(' ');
  note.hidden = !messages.length;
  clearResults();
  renderAll();
}

function renderFiles() {
  $('list').replaceChildren(...files.map((f, i) => {
    const li = document.createElement('li');
    li.className = 'cv-file';
    const name = document.createElement('span');
    name.className = 'cv-file__name';
    name.textContent = f.name;
    const meta = document.createElement('span');
    meta.className = 'cv-file__meta';
    meta.textContent = `${t(`kind.${f.kind}`)} · ${formatSize(f.file.size)}`;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'ow-btn ow-btn--link ow-btn--small';
    rm.setAttribute('aria-label', t('list.remove', { name: f.name }));
    rm.append(createIcon('x', { size: '1em' }));
    rm.addEventListener('click', () => { files.splice(i, 1); clearResults(); renderAll(); });
    li.append(name, meta, rm);
    return li;
  }));
}

// ---------- Targets and options ----------
function renderTargets() {
  const list = commonTargets(files);
  if (!list.includes(target)) target = list[0] ?? '';
  $('to-empty').hidden = files.length > 0 && list.length > 0;
  $('to-empty').textContent = files.length ? t('to.none') : t('to.empty');
  $('targets').replaceChildren(...list.map((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cv-chip';
    b.textContent = t(`fmt.${id}`);
    b.dataset.target = id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(target === id));
    return b;
  }));
  const lossy = target === 'jpg' || target === 'webp';
  const fromPdf = target === 'png' || target === 'jpg' ? files.some((f) => f.kind === 'pdf') : false;
  const toPdf = isImageToPdf();
  $('opt-quality').hidden = !(lossy || toPdf);
  $('opt-scale').hidden = !fromPdf;
  $('opt-page').hidden = !toPdf;
  const merge = toPdf && files.length > 1;
  $('opt-merge').hidden = !merge;
  $('options').hidden = $('opt-quality').hidden && $('opt-scale').hidden && $('opt-page').hidden && !merge;
  $('go').disabled = running || !target;
  $('quality-out').textContent = `${$('quality').value}%`;
}

function options() {
  return {
    quality: Number($('quality').value) / 100,
    scale: Number($('scale').value),
    pageMode: $('page').value,
    lang: getLang(),
    onPage: (n, total) => { $('progress').textContent = t('go.page', { n, total }); },
  };
}

// ---------- Convert ----------
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

const sizeOf = (d) => (d instanceof Blob ? d.size : d.byteLength);

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

async function run() {
  if (running || !target || !files.length) return;
  running = true;
  clearResults();
  $('go').disabled = true;
  const opts = options();
  const errors = [];
  const notes = [];
  let outputs = [];
  try {
    if (isImageToPdf() && files.length > 1 && $('merge').checked) {
      $('progress').textContent = t('go.working', { done: 1, total: 1, name: files[0].name });
      try {
        const r = await imagesToOnePdf(files.map((f) => f.file), opts);
        outputs.push(...r.outputs);
      } catch { errors.push(t('err.failed', { name: files.map((f) => f.name).join(', ') })); }
    } else {
      for (const [i, f] of files.entries()) {
        $('progress').textContent = t('go.working', { done: i + 1, total: files.length, name: f.name });
        // Let the browser paint the progress text before a heavy conversion blocks the thread.
        await new Promise((r) => setTimeout(r, 0));
        try {
          const r = await convertFile(f.file, f.kind, target, opts);
          outputs.push(...r.outputs);
          for (const n of r.notes) notes.push({ ...n, name: f.name });
        } catch (e) {
          errors.push(t(e?.message === 'encode' ? 'err.encode' : 'err.failed', { name: f.name }));
        }
      }
    }
  } finally {
    running = false;
  }
  current = uniqueNames(outputs);
  renderResults(errors, notes);
  $('progress').textContent = current.length ? t('go.done', { n: current.length }) : '';
  renderTargets();
}

function renderResults(errors, notes) {
  const box = $('results');
  const ul = document.createElement('ul');
  ul.className = 'cv-out';
  for (const o of current) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = o.name;
    const size = document.createElement('span');
    size.className = 'size';
    size.textContent = formatSize(sizeOf(o.data));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ow-btn ow-btn--secondary ow-btn--small';
    btn.append(createIcon('download', { size: '1em' }), ` ${t('go.download')}`);
    btn.addEventListener('click', () => download(o.data, o.name, o.mime));
    li.append(name, size, btn);
    ul.append(li);
  }
  for (const msg of errors) {
    const li = document.createElement('li');
    li.className = 'is-error';
    li.textContent = msg;
    ul.append(li);
  }
  box.replaceChildren(ul);
  if (current.length > 1) {
    const zip = document.createElement('button');
    zip.type = 'button';
    zip.className = 'ow-btn cv-zip';
    zip.append(createIcon('download', { size: '1em' }), ` ${t('go.zip')}`);
    zip.addEventListener('click', downloadZip);
    box.append(zip);
  }
  const seen = new Set();
  $('notes').replaceChildren(...notes.filter((n) => !seen.has(n.key + n.name) && seen.add(n.key + n.name)).map((n) => {
    const p = document.createElement('p');
    p.className = 'ow-status ow-status--yellow';
    p.textContent = `${n.name}: ${t(n.key, n.params)}`;
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
    download(bytes, 'oneware-converted.zip', MIME.zip);
  } catch {
    showToast(t('err.failed', { name: 'ZIP' }));
  }
  $('progress').textContent = t('go.done', { n: current.length });
}

// ---------- Premium state ----------
function onLicense() {
  if (locked('batch') && files.length > 1) files = files.slice(0, 1);
  renderAll();
}
function syncUsage() {
  shell.setUsage(shell.isPremium() ? '' : t('usage.free'));
}

// ---------- Events ----------
$('file').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', (e) => addFiles(e.dataTransfer?.files ?? []));
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
$('targets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-target]');
  if (!b) return;
  target = b.dataset.target;
  clearResults();
  renderTargets();
});
$('quality').addEventListener('input', () => { $('quality-out').textContent = `${$('quality').value}%`; });
$('go').addEventListener('click', run);

// ---------- Static texts ----------
function renderAll() {
  applyTranslations();
  $('drop-icon').replaceChildren(createIcon('upload', { size: '2rem' }));
  $('privacy').textContent = t('drop.privacy');
  drop.tabIndex = 0;
  const badge = $('merge-badge');
  badge.replaceChildren();
  if (PREMIUM_FEATURES.batch) markPremium(badge, SLUG, { compact: true });
  $('limits').replaceChildren(...['good', 'layout', 'pdf', 'pdfWord', 'fonts', 'no'].map((k) => {
    const li = document.createElement('li');
    li.textContent = t(`limits.${k}`);
    return li;
  }));
  renderFiles();
  renderTargets();
  syncUsage();
}

onLangChange(() => { clearResults(); renderAll(); });
renderAll();
