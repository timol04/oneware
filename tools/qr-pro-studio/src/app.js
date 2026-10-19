import { registerMessages, t, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { markPremium } from '../../../core/premium.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import { createIcon } from '../../../core/icons.js';
import { showToast } from '../../../core/ui-components.js';
import { SWATCHES, LONG_TEXT_LIMIT } from './config.js';
import { TYPES, TYPE_IDS, MAX_BYTES, build, fileName } from './content.js';
import { renderBlob, saveBlob, sheetInfo, pagePreview, FORMATS, DOT_STYLES } from './qr.js';
import { composeCanvas, scanTest, geometry, SHAPES } from './sticker.js';
import { buildZip } from './batch.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'qr-pro-studio';
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: onLicense });

// Free: every content type, soft dots, plain black, PNG. Premium: the rest.
const FREE_FORMATS = ['png'];
const FORMAT_IDS = ['png', 'png-large', 'svg', 'pdf', 'sheet'];
const SHEET_SIZES = [30, 40, 50, 60];
const LABEL_PRESETS = ['scan', 'menu', 'wifi'];
const PREVIEW_W = 560;

const style = { color: '#000000', logo: null, logoMode: 'shape', logoStrength: 0.5, dots: 'rounded', shape: 'square', label: '', sheetMm: 40 };
const values = Object.fromEntries(TYPE_IDS.map((id) => [id, {}]));
let kind = 'url';
let format = 'png';
let current = null; // { kind, data, bytes } or null while nothing valid is entered
let renderId = 0;
let scanTimer;
let landed = false;

const isPremium = () => shell.isPremium();
// Locked styling never reaches the preview or the export.
const activeStyle = () => (isPremium() ? { ...style } : { dots: style.dots, color: Array.isArray(style.color) ? '#000000' : style.color });
const has = (key) => t(key) !== key;

/** Returns true (and opens the license dialog) when the feature is locked. */
function gated() {
  if (isPremium()) return false;
  shell.openLicense('buy');
  return true;
}

function chip(label, pressed, attrs = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'qr-chip';
  b.textContent = label;
  b.setAttribute('aria-pressed', String(pressed));
  Object.assign(b.dataset, attrs);
  return b;
}
function press(box, selected) {
  box.querySelectorAll('.qr-chip').forEach((c) => c.setAttribute('aria-pressed', String(c === selected)));
}

// --- Content types and their form ---
function renderTypes() {
  $('types').replaceChildren(...TYPE_IDS.map((id) => {
    const b = chip(t(`type.${id}`), id === kind, { kind: id });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(id === kind));
    return b;
  }));
}

function fieldEl(f) {
  const id = `f-${kind}-${f.id}`;
  const value = values[kind][f.id];
  const wrap = document.createElement('div');
  wrap.className = f.type === 'checkbox' ? 'qr-check' : 'ow-field';
  const label = document.createElement('label');
  label.className = f.type === 'checkbox' ? '' : 'ow-label';
  label.htmlFor = id;
  label.textContent = t(`field.${kind}.${f.id}`) + (f.required || f.type === 'checkbox' || f.type === 'select' ? '' : ` (${t('field.optional')})`);
  let input;
  if (f.type === 'textarea') {
    input = document.createElement('textarea');
    input.className = 'ow-textarea';
    input.rows = 3;
  } else if (f.type === 'select') {
    input = document.createElement('select');
    input.className = 'ow-select';
    for (const o of f.options) input.add(new Option(t(`opt.${f.id}.${o}`), o));
    input.value = value ?? f.options[0];
  } else {
    input = document.createElement('input');
    input.className = f.type === 'checkbox' ? '' : 'ow-input';
    input.type = f.type === 'datetime-local' ? 'datetime-local' : f.type || 'text';
    if (f.type === 'url') input.inputMode = 'url';
    if (f.type === 'tel') input.inputMode = 'tel';
    if (f.type === 'text' && (f.id === 'lat' || f.id === 'lng')) input.inputMode = 'decimal';
  }
  input.id = id;
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (has(`ph.${kind}.${f.id}`)) input.placeholder = t(`ph.${kind}.${f.id}`);
  if (f.type === 'checkbox') input.checked = !!value;
  else if (f.type !== 'select') input.value = value ?? '';
  const onInput = () => {
    values[kind][f.id] = f.type === 'checkbox' ? input.checked : input.value;
    update();
  };
  input.addEventListener(f.type === 'checkbox' || f.type === 'select' ? 'change' : 'input', onInput);
  if (f.type === 'checkbox') wrap.append(input, label);
  else wrap.append(label, input);
  return wrap;
}

function renderFields() {
  $('fields').replaceChildren(...TYPES[kind].fields.map(fieldEl));
}

$('types').addEventListener('click', (e) => {
  const b = e.target.closest('.qr-chip');
  if (!b || b.dataset.kind === kind) return;
  kind = b.dataset.kind;
  $('types').querySelectorAll('.qr-chip').forEach((c) => c.setAttribute('aria-checked', String(c === b)));
  press($('types'), b);
  renderFields();
  update();
});

// --- Style controls ---
function renderStyleControls() {
  const dots = $('dot-styles');
  dots.replaceChildren(...Object.keys(DOT_STYLES).map((id) => chip(t(`dots.${id}`), style.dots === id, { dots: id })));
  const shapes = $('shapes');
  shapes.replaceChildren(...Object.keys(SHAPES).map((id) => chip(t(`shape.${id}`), style.shape === id, { shape: id })));
  $('label-presets').replaceChildren(...LABEL_PRESETS.map((id) => chip(t(`preset.${id}`), false, { preset: id })));
  const sw = $('swatches');
  sw.replaceChildren(...SWATCHES.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qr-swatch';
    b.style.setProperty('--swatch', Array.isArray(s.color) ? `linear-gradient(135deg, ${s.color[0]}, ${s.color[1]})` : s.color);
    b.dataset.i = i;
    if (Array.isArray(s.color)) b.dataset.gradient = '';
    b.setAttribute('aria-label', t(`sw.${s.id}`));
    b.setAttribute('aria-pressed', String(JSON.stringify(style.color) === JSON.stringify(s.color)));
    return b;
  }));
  const formats = $('formats');
  formats.replaceChildren(...FORMAT_IDS.map((id) => chip(t(`fmt.${id}`), format === id, { format: id })));
  const sizes = $('sheet-sizes');
  sizes.replaceChildren(...SHEET_SIZES.map((mm) => chip(`${mm / 10} cm`, style.sheetMm === mm, { mm })));
  document.querySelectorAll('.qr-lock').forEach((l) => { if (!l.firstChild) l.append(createIcon('lock', { size: '.9em' })); });
}

$('dot-styles').addEventListener('click', (e) => {
  const b = e.target.closest('.qr-chip');
  if (!b) return;
  style.dots = b.dataset.dots;
  press($('dot-styles'), b);
  refresh();
});
$('swatches').addEventListener('click', (e) => {
  const b = e.target.closest('.qr-swatch');
  if (!b) return;
  const swatch = SWATCHES[Number(b.dataset.i)];
  if (Array.isArray(swatch.color) && gated()) return;
  style.color = swatch.color;
  $('swatches').querySelectorAll('.qr-swatch').forEach((s) => s.setAttribute('aria-pressed', String(s === b)));
  refresh();
});
$('shapes').addEventListener('click', (e) => {
  const b = e.target.closest('.qr-chip');
  if (!b || gated()) return;
  style.shape = b.dataset.shape;
  press($('shapes'), b);
  refresh();
});
const labelInput = $('label');
labelInput.addEventListener('focus', () => { if (gated()) labelInput.blur(); });
labelInput.addEventListener('input', () => { style.label = labelInput.value.trim(); refresh(); });
$('label-presets').addEventListener('click', (e) => {
  const b = e.target.closest('.qr-chip');
  if (!b || gated()) return;
  labelInput.value = style.label = b.textContent;
  refresh();
});

// --- Logo ---
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const logoFile = $('logo-file');
$('logo-btn').addEventListener('click', () => { if (!gated()) logoFile.click(); });
function setLogo(url) {
  style.logo = url;
  $('logo-thumb').hidden = !url;
  $('logo-thumb').src = url ?? '';
  $('logo-remove').hidden = !url;
  $('logo-modes').hidden = !url;
  syncStrength();
  refresh();
}
function syncStrength() {
  $('logo-strength-row').hidden = !style.logo || style.logoMode !== 'shape';
}
logoFile.addEventListener('change', () => {
  const file = logoFile.files[0];
  logoFile.value = '';
  if (!file) return;
  if (file.size > LOGO_MAX_BYTES) { showToast(t('logo.tooBig')); return; }
  const reader = new FileReader();
  reader.onload = () => setLogo(reader.result);
  reader.readAsDataURL(file);
});
$('logo-remove').addEventListener('click', () => setLogo(null));
$('logo-strength').addEventListener('input', (e) => { style.logoStrength = Number(e.target.value) / 100; refresh(); });
$('logo-modes').addEventListener('click', (e) => {
  const b = e.target.closest('.qr-chip');
  if (!b) return;
  style.logoMode = b.dataset.logomode;
  press($('logo-modes'), b);
  syncStrength();
  refresh();
});

// --- Format and export ---
$('formats').addEventListener('click', (e) => {
  const b = e.target.closest('.qr-chip');
  if (!b || (!FREE_FORMATS.includes(b.dataset.format) && gated())) return;
  format = b.dataset.format;
  press($('formats'), b);
  refresh();
});
$('sheet-sizes').addEventListener('click', (e) => {
  const b = e.target.closest('.qr-chip');
  if (!b) return;
  style.sheetMm = Number(b.dataset.mm);
  press($('sheet-sizes'), b);
  refresh();
});

async function busy(btn, label, fn) {
  const text = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try { await fn(); } finally { btn.disabled = btn === $('download') ? !current : false; btn.textContent = text; }
}

$('download').addEventListener('click', () => {
  if (!current) return;
  const fmt = format;
  return busy($('download'), t('dl.busy'), async () => {
    const blob = await renderBlob(current.data, fmt, activeStyle());
    saveBlob(blob, `${fileName(current)}.${FORMATS[fmt].ext}`);
    showToast(t('dl.done', { format: t(`fmt.${fmt}`) }));
  });
});

const csvFile = $('csv-file');
$('csv-btn').addEventListener('click', () => { if (!gated()) csvFile.click(); });
csvFile.addEventListener('change', async () => {
  const file = csvFile.files[0];
  csvFile.value = '';
  if (!file) return;
  await busy($('csv-btn'), t('batch.busy'), async () => {
    try {
      const fmt = ['pdf', 'svg', 'png-large'].includes(format) ? format : 'png';
      const { blob, count, skipped } = await buildZip(await file.text(), fmt, activeStyle());
      saveBlob(blob, 'qr-codes.zip');
      showToast(t('batch.done', { n: count }) + (skipped ? t('batch.skipped', { n: skipped }) : ''));
    } catch {
      showToast(t('batch.empty'));
    }
  });
});

// --- Preview ---
function caption() {
  const s = activeStyle();
  if (format === 'sheet') return t('cap.sheet', { count: sheetInfo(style.sheetMm, s).count, cm: style.sheetMm / 10 });
  if (format === 'png' || format === 'png-large') {
    const w = FORMATS[format].size;
    return t('cap.png', { w, h: Math.round(w * geometry(s.shape, s.label).h) });
  }
  return t(`cap.${format}`);
}

function describe() {
  const text = TYPES[kind].fields.map((f) => values[kind][f.id]).join('');
  if (!text.trim()) return ' ';
  if (!current) return t('status.incomplete');
  if (current.bytes > MAX_BYTES) return t('status.tooLong');
  return current.bytes > LONG_TEXT_LIMIT ? t('status.long') : t('status.ok', { kind: t(`type.${kind}`), n: current.bytes });
}

async function refresh() {
  const download = $('download');
  download.textContent = t('dl.btn', { format: t(`fmt.${format}`) });
  $('caption').textContent = caption();
  $('sheet-row').hidden = format !== 'sheet';
  const id = ++renderId;
  clearTimeout(scanTimer);
  const stage = $('stage');
  const tooLong = !!current && current.bytes > MAX_BYTES;
  const code = current && !tooLong ? current : null;
  download.disabled = !code;
  $('empty-note').textContent = t(tooLong ? 'mat.tooMuch' : 'mat.empty');
  stage.classList.toggle('is-error', tooLong);
  if (!code) {
    stage.classList.add('is-empty');
    $('scan').hidden = true;
    return;
  }
  const canvas = await composeCanvas(code.data, PREVIEW_W, activeStyle());
  if (id !== renderId) return;
  const page = format === 'pdf' || format === 'sheet';
  $('preview').replaceChildren(page ? pagePreview(canvas, format, activeStyle()) : canvas);
  stage.classList.toggle('is-page', page);
  stage.classList.remove('is-empty');
  if (!landed && !reduceMotion.matches) {
    stage.classList.add('is-landing');
    stage.addEventListener('animationend', () => stage.classList.remove('is-landing'), { once: true });
  }
  landed = true;
  // Scan test after a short pause so typing stays smooth
  scanTimer = setTimeout(async () => {
    const level = await scanTest(canvas, code.data);
    if (id !== renderId) return;
    const scan = $('scan');
    scan.hidden = false;
    scan.dataset.level = level;
    scan.className = `ow-status ow-status--${level === 'fail' ? 'red' : level === 'knapp' ? 'yellow' : 'green'}`;
    scan.textContent = t(`scan.${level}`);
  }, 150);
}

function update() {
  current = build(kind, values[kind]);
  $('status').textContent = describe();
  $('status').classList.toggle('is-error', !!current && current.bytes > MAX_BYTES);
  refresh();
}

// --- Premium state ---
function syncLocks() {
  const premium = isPremium();
  document.querySelectorAll('[data-premium]').forEach((row) => row.classList.toggle('is-locked', !premium));
  // Premium markers (visible in the free launch phase too; see core/premium.js)
  document.querySelectorAll('[data-premium] .qr-row__label').forEach((l) => markPremium(l, SLUG, { compact: true }));
  document.querySelectorAll('.qr-chip[data-format]:not([data-format="png"])').forEach((c) => markPremium(c, SLUG, { compact: true }));
  markPremium($('csv-btn'), SLUG, { compact: true });
  document.querySelectorAll('.qr-chip[data-format], #csv-btn').forEach((b) => {
    b.classList.toggle('is-locked', !premium && !FREE_FORMATS.includes(b.dataset.format ?? ''));
  });
  document.querySelectorAll('.qr-swatch[data-gradient]').forEach((b) => { markPremium(b, SLUG, { compact: true }); b.classList.toggle('is-locked', !premium); });
  shell.setUsage(premium ? '' : t('usage.free'));
}
function onLicense() {
  syncLocks();
  refresh();
}

function renderAll() {
  applyTranslations();
  renderTypes();
  renderFields();
  renderStyleControls();
  syncLocks();
  $('status').textContent = describe();
  refresh();
}

onLangChange(renderAll);
renderAll();
