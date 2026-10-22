import { registerMessages, t, applyTranslations, onLangChange } from '../../../core/i18n.js';
import { markPremium } from '../../../core/premium.js';
import { mountToolShell } from '../../../core/tool-shell.js';
import { createIcon } from '../../../core/icons.js';
import { showToast } from '../../../core/ui-components.js';
import { PREMIUM_FEATURES, MAX_BYTES } from './config.js';
import { parseDocx } from './docx.js';
import { checkDocument } from './checker.js';
import { checkApa } from './apa.js';
import { fixDocx } from './fixer.js';
import { compareDocs } from './compare.js';
import { readGuideline, extractRules, hasFindings } from './guideline.js';
import { PRESETS, PRESET_IDS, DEFAULT_PRESET } from './presets.js';
import { listProfiles, saveProfile, deleteProfile, getProfile } from './profiles.js';
import { reportHtml, batchHtml, esc, tx } from './report.js';
import en from './locales/en.js';
import de from './locales/de.js';

registerMessages('en', en);
registerMessages('de', de);

const SLUG = 'verifyxr';
const config = await (await fetch('tool.config.json')).json();
const $ = (id) => document.getElementById(id);

const shell = await mountToolShell({ slug: SLUG, config, main: $('main'), onLicenseChange: onLicense });
const isPremium = () => shell.isPremium();
/** True when the feature is Premium and not unlocked yet. */
const locked = (feature) => PREMIUM_FEATURES[feature] && !isPremium();

let entries = [];          // [{ name, doc }] or [{ name, error }]
let selection = DEFAULT_PRESET; // preset id, or "profile:<name>"
const APA_KEY = 'verifyxr:apa';
let apaOn = (() => { try { return localStorage.getItem(APA_KEY) === '1'; } catch { return false; } })();

// ---------- Requirements form ----------
const FIELDS = {
  font: 'r-font', size: 'r-size', lineSpacing: 'r-spacing',
  top: 'r-top', bottom: 'r-bottom', left: 'r-left', right: 'r-right',
  minWords: 'r-minWords', maxWords: 'r-maxWords', minPages: 'r-minPages', maxPages: 'r-maxPages',
};
const numOrNull = (id) => {
  const v = $(id).value.trim();
  return v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
};

function readRules() {
  return {
    font: $(FIELDS.font).value.trim() || PRESETS[DEFAULT_PRESET].font,
    size: numOrNull(FIELDS.size) ?? PRESETS[DEFAULT_PRESET].size,
    lineSpacing: numOrNull(FIELDS.lineSpacing) ?? PRESETS[DEFAULT_PRESET].lineSpacing,
    marginsCm: { top: numOrNull(FIELDS.top), bottom: numOrNull(FIELDS.bottom), left: numOrNull(FIELDS.left), right: numOrNull(FIELDS.right) },
    minWords: numOrNull(FIELDS.minWords), maxWords: numOrNull(FIELDS.maxWords),
    minPages: numOrNull(FIELDS.minPages), maxPages: numOrNull(FIELDS.maxPages),
    ignoreSpecial: $('r-ignore').checked,
  };
}
function writeRules(r) {
  $(FIELDS.font).value = r.font;
  $(FIELDS.size).value = r.size;
  $(FIELDS.lineSpacing).value = r.lineSpacing;
  for (const side of ['top', 'bottom', 'left', 'right']) $(FIELDS[side]).value = r.marginsCm[side] ?? '';
  for (const k of ['minWords', 'maxWords', 'minPages', 'maxPages']) $(FIELDS[k]).value = r[k] ?? '';
  $('r-ignore').checked = r.ignoreSpecial !== false;
}

function summaryText() {
  const r = readRules();
  const m = r.marginsCm;
  const same = m.top === m.bottom && m.bottom === m.left && m.left === m.right;
  const margins = same && m.top !== null ? `${tx(m.top)} cm` : ['top', 'bottom', 'left', 'right'].map((s) => `${t(`summary.${s}`)} ${m[s] === null ? '–' : tx(m[s])}`).join(', ');
  const limits = [];
  if (r.minWords !== null || r.maxWords !== null) limits.push(t('summary.words', { min: r.minWords === null ? '–' : tx(r.minWords), max: r.maxWords === null ? '–' : tx(r.maxWords) }));
  if (r.minPages !== null || r.maxPages !== null) limits.push(t('summary.pages', { min: r.minPages === null ? '–' : tx(r.minPages), max: r.maxPages === null ? '–' : tx(r.maxPages) }));
  return [`${r.font} ${tx(r.size)} pt`, t('summary.spacing', { n: tx(r.lineSpacing) }), t('summary.margins', { m: margins }), ...limits].join(' · ');
}

function renderPresets() {
  $('presets').replaceChildren(...PRESET_IDS.map((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vx-chip';
    b.textContent = t(`preset.${id}`);
    b.title = t(`preset.${id}.desc`);
    b.dataset.preset = id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(selection === id));
    return b;
  }));
}

async function renderProfiles() {
  const row = $('profile-row');
  const select = $('profile-select');
  const mine = await listProfiles();
  select.replaceChildren(new Option(t('rules.none'), ''), ...mine.map((p) => new Option(p.name, p.name)));
  select.value = selection.startsWith('profile:') ? selection.slice(8) : '';
  $('profile-delete').hidden = !select.value;
  // The label carries the Premium badge when saving profiles is a Premium feature.
  const label = row.querySelector('.vx-row__label');
  label.querySelector('.ow-premium')?.remove();
  if (PREMIUM_FEATURES.profiles) markPremium(label, SLUG, { compact: true });
  [$('profile-name'), $('profile-save')].forEach((el) => el.classList.toggle('is-locked', !!locked('profiles')));
}

function selectPreset(id) {
  selection = id;
  writeRules(PRESETS[id]);
  afterRulesChange();
  renderPresets();
  renderProfiles();
}

function afterRulesChange() {
  entries.forEach((e) => { delete e.fixed; }); // a corrected copy belongs to the rules it was made with
  $('rules-summary').textContent = summaryText();
  render();
}

// ---------- Import requirements from a guideline ----------
const IMPORT_FIELDS = [
  ['font', 'rules.font', (v) => v], ['size', 'rules.size', (v) => `${tx(v)} pt`], ['lineSpacing', 'rules.spacing', (v) => `${tx(v)}×`],
  ['top', 'field.top', (v) => `${tx(v)} cm`], ['bottom', 'field.bottom', (v) => `${tx(v)} cm`], ['left', 'field.left', (v) => `${tx(v)} cm`], ['right', 'field.right', (v) => `${tx(v)} cm`],
  ['minWords', 'rules.minWords', tx], ['maxWords', 'rules.maxWords', tx], ['minPages', 'rules.minPages', tx], ['maxPages', 'rules.maxPages', tx],
];
let imported = null; // result of extractRules()

function renderImport() {
  const box = $('import-result');
  if (!imported) { box.replaceChildren(); return; }
  if (imported.error) { box.innerHTML = `<p class="ow-status ow-status--yellow" role="status">${esc(t(imported.error))}</p>`; return; }
  const margin = (key) => (['top', 'bottom', 'left', 'right'].includes(key) ? `${t('rules.margins')}: ` : '');
  const rows = IMPORT_FIELDS.filter(([key]) => imported[key].length).map(([key, label, fmt]) => {
    const list = imported[key];
    const value = list.length === 1
      ? `<strong>${esc(fmt(list[0].value))}</strong>`
      : `<select class="ow-select" data-import-select="${key}" aria-label="${esc(t(label))}">${list.map((c, i) => `<option value="${i}">${esc(fmt(c.value))}</option>`).join('')}</select>`;
    return `<li class="vx-import__row"><label><input type="checkbox" data-import="${key}"${list.length === 1 ? ' checked' : ''}> <span>${esc(margin(key) + t(label))}</span></label> ${value}
      <span class="vx-import__quote" data-quote="${key}">${esc(list[0].quote)}</span></li>`;
  });
  const missing = IMPORT_FIELDS.filter(([key]) => !imported[key].length).map(([, label]) => t(label));
  box.innerHTML = `<p class="vx-desc">${esc(t('imp.found', { name: imported.name }))}</p>
    <ul class="vx-import">${rows.join('')}</ul>
    ${missing.length ? `<p class="vx-desc">${esc(t('imp.missing', { list: missing.join(', ') }))}</p>` : ''}
    <div class="ow-row"><button type="button" id="import-apply" class="ow-btn ow-btn--small">${esc(t('imp.apply'))}</button></div>`;
}

async function importGuideline(file) {
  if (!file) return;
  try {
    const found = extractRules(await readGuideline(file.name, await file.arrayBuffer()));
    imported = hasFindings(found) ? { ...found, name: file.name } : { error: 'imp.none' };
  } catch (e) {
    imported = { error: e.message === 'unsupported' ? 'imp.unsupported' : 'imp.unreadable' };
  }
  renderImport();
}

function applyImport() {
  const rules = readRules();
  let n = 0;
  $('import-result').querySelectorAll('[data-import]:checked').forEach((box) => {
    const key = box.dataset.import;
    const select = $('import-result').querySelector(`[data-import-select="${key}"]`);
    const value = imported[key][select ? Number(select.value) : 0].value;
    if (['top', 'bottom', 'left', 'right'].includes(key)) rules.marginsCm[key] = value; else rules[key] = value;
    n++;
  });
  if (!n) { showToast(t('imp.nothing')); return; }
  writeRules(rules);
  selection = '';
  renderPresets();
  renderProfiles();
  afterRulesChange();
  showToast(t('imp.applied', { n: tx(n) }));
}

// ---------- Files ----------
async function readEntry(file) {
  if (!/\.docx$/i.test(file.name)) return { name: file.name, error: 'err.notDocx' };
  if (file.size > MAX_BYTES) return { name: file.name, error: 'err.tooBig' };
  try {
    const buffer = await file.arrayBuffer();
    return { name: file.name, buffer, doc: await parseDocx(buffer) };
  } catch {
    return { name: file.name, error: 'err.unreadable' };
  }
}

async function handleFiles(fileList) {
  let files = [...fileList];
  if (!files.length) return;
  const note = $('drop-note');
  note.hidden = true;
  if (files.length > 1 && locked('batch')) {
    files = files.slice(0, 1);
    note.textContent = t('drop.batchLocked');
    note.hidden = false;
  }
  entries = await Promise.all(files.map(readEntry));
  $('file-names').textContent = files.map((f) => f.name).join(', ');
  render();
}

// ---------- Report ----------
const FIXABLE = ['font', 'size', 'spacing', 'margins'];

function compute(entry) {
  if (entry.error) return entry;
  const apa = apaOn && !locked('apa') ? checkApa(entry.doc) : null;
  const result = checkDocument(entry.doc, readRules());
  const fixable = result.criteria.some((c) => FIXABLE.includes(c.id) && (c.status === 'warn' || c.status === 'fail'));
  return { ...entry, result, apa, fixable };
}

function render() {
  const box = $('report');
  const has = entries.length > 0;
  $('empty').hidden = has;
  $('actions').hidden = !has || entries.every((e) => e.error);
  if (!has) { box.innerHTML = ''; return; }
  const computed = entries.map((e, i) => ({ ...compute(e), index: i }));
  box.innerHTML = computed.length === 1 ? reportHtml(computed[0]) : batchHtml(computed);
  box.querySelectorAll('[data-fix]').forEach((b) => {
    if (PREMIUM_FEATURES.fix) markPremium(b.parentElement.querySelector('p'), SLUG);
    b.addEventListener('click', () => fix(entries[Number(b.dataset.fix)], b));
  });
  box.querySelectorAll('[data-download]').forEach((b) => {
    b.addEventListener('click', () => {
      const entry = entries[Number(b.dataset.download)];
      if (entry?.fixed) download(entry.fixed.bytes, `${entry.name.replace(/\.docx$/i, '')}-fixed.docx`);
    });
  });
  const printBtn = $('print');
  printBtn.classList.toggle('is-locked', !!locked('pdf'));
  if (PREMIUM_FEATURES.pdf) markPremium(printBtn, SLUG, { compact: true });
}

// ---------- Fix ----------
function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function fix(entry, button) {
  if (!entry?.buffer) return;
  if (locked('fix')) { shell.openLicense('buy'); return; }
  button.disabled = true;
  try {
    const { bytes } = await fixDocx(entry.buffer, readRules());
    entry.fixed = { bytes, changes: compareDocs(entry.doc, await parseDocx(bytes)) };
    render();
    showToast(t('fix.ready'));
  } catch {
    showToast(t('fix.failed'));
  } finally {
    button.disabled = false;
  }
}

// ---------- APA option ----------
function renderApa() {
  $('r-apa').checked = apaOn && !locked('apa');
  const text = $('r-apa').nextElementSibling;
  text.querySelector('.ow-premium')?.remove();
  if (PREMIUM_FEATURES.apa) markPremium(text, SLUG);
}

// ---------- Premium state ----------
function onLicense() {
  renderProfiles();
  renderApa();
  if (entries.length) render();
  syncUsage();
}
function syncUsage() {
  shell.setUsage(isPremium() ? '' : t('usage.free'));
}

// ---------- Events ----------
$('presets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-preset]');
  if (b) selectPreset(b.dataset.preset);
});
$('profile-select').addEventListener('change', async (e) => {
  const name = e.target.value;
  if (!name) { selectPreset(DEFAULT_PRESET); return; }
  const p = await getProfile(name);
  if (!p) return;
  selection = `profile:${name}`;
  writeRules(p.rules);
  afterRulesChange();
  renderPresets();
  renderProfiles();
});
$('profile-save').addEventListener('click', async () => {
  if (locked('profiles')) { shell.openLicense('buy'); return; }
  const name = $('profile-name').value.trim();
  if (!name) { $('profile-name').focus(); return; }
  if (!(await saveProfile(name, readRules()))) { showToast(t('rules.saveFailed')); return; }
  selection = `profile:${name}`;
  $('profile-name').value = '';
  renderPresets();
  renderProfiles();
  showToast(t('rules.saved', { name }));
});
$('profile-delete').addEventListener('click', async () => {
  const name = $('profile-select').value;
  if (!name || !(await deleteProfile(name))) return;
  selectPreset(DEFAULT_PRESET);
});
$('rules-summary').closest('section').addEventListener('input', (e) => {
  if (!e.target.matches('.vx-advanced input')) return;
  // A manual change leaves the preset/profile; the values stay as typed.
  if (selection !== '') { selection = ''; renderPresets(); renderProfiles(); }
  afterRulesChange();
});
$('import-btn').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', (e) => { importGuideline(e.target.files[0]); e.target.value = ''; });
$('import-result').addEventListener('click', (e) => { if (e.target.id === 'import-apply') applyImport(); });
$('import-result').addEventListener('change', (e) => {
  const key = e.target.dataset.importSelect;
  if (!key) return; // a choice in the list ticks the row and shows the matching sentence
  $('import-result').querySelector(`[data-import="${key}"]`).checked = true;
  $('import-result').querySelector(`[data-quote="${key}"]`).textContent = imported[key][Number(e.target.value)].quote;
});
$('r-apa').addEventListener('change', (e) => {
  if (e.target.checked && locked('apa')) { e.target.checked = false; shell.openLicense('buy'); return; }
  apaOn = e.target.checked;
  try { localStorage.setItem(APA_KEY, apaOn ? '1' : '0'); } catch { /* storage unavailable */ }
  render();
});
$('file').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', (e) => handleFiles(e.dataTransfer?.files ?? []));
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
$('print').addEventListener('click', () => {
  if (locked('pdf')) { shell.openLicense('buy'); return; }
  window.print();
});

// ---------- Static texts ----------
function renderAll() {
  applyTranslations();
  $('drop-icon').replaceChildren(createIcon('upload', { size: '2rem' }));
  $('privacy').textContent = t('drop.privacy');
  drop.tabIndex = 0;
  renderPresets();
  renderProfiles();
  renderApa();
  renderImport();
  $('rules-summary').textContent = summaryText();
  syncUsage();
  render();
}

writeRules(PRESETS[DEFAULT_PRESET]);
onLangChange(renderAll);
renderAll();
