// HTML for the report. Pure string functions; every text from a document goes through esc().
import { t, getLang } from '../../../core/i18n.js';
import { MAX_FINDINGS } from './config.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Translates a message object { k, p } (or passes a plain string / number through). */
export function tx(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return new Intl.NumberFormat(getLang(), { maximumFractionDigits: 2 }).format(v);
  if (typeof v === 'string') return v;
  const params = {};
  for (const [name, value] of Object.entries(v.p ?? {})) params[name] = tx(value);
  return t(v.k, params);
}
/** Count-dependent text: key + ".one" or ".other". */
export const tn = (key, n, params = {}) => t(`${key}.${n === 1 ? 'one' : 'other'}`, { n: tx(n), ...params });

const GLYPH = {
  ok: '<circle cx="14" cy="14" r="12" fill="currentColor"/><path d="M8.5 14.5l4 4 7-8" fill="none" stroke="var(--bg)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  warn: '<path d="M14 2.5l12.5 22h-25z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 11v6.5M14 21v.1" stroke="var(--bg)" stroke-width="2.6" stroke-linecap="round"/>',
  fail: '<circle cx="14" cy="14" r="12" fill="currentColor"/><path d="M9.5 9.5l9 9m0-9l-9 9" stroke="var(--bg)" stroke-width="2.6" stroke-linecap="round"/>',
  skip: '<circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 14h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
};
const glyph = (status) => `<svg class="mark" viewBox="0 0 28 28" aria-hidden="true">${GLYPH[status]}</svg>`;

/** Counts criteria by status (without "skip"). */
export function countStatuses(criteria) {
  const checked = criteria.filter((c) => c.status !== 'skip');
  const n = (s) => checked.filter((c) => c.status === s).length;
  return { ok: n('ok'), warn: n('warn'), fail: n('fail'), total: checked.length };
}

function findingHtml(f) {
  const message = tx(f.message) + (f.note ? ` ${tx(f.note)}` : '');
  const exp = tx(f.expected);
  const found = tx(f.found);
  const structured = f.expected !== undefined || f.found !== undefined;
  const repeats = structured && message.includes(found) && message.includes(exp);
  const where = tx(f.where) + (f.extra ? ` ${tn('rep.more', f.extra)}` : '');
  const vals = structured ? t('rep.expFound', { expected: exp || '–', found: found || '–' }) : '';
  return `<li class="${f.severity}"><span class="sev">${esc(t(`sev.${f.severity}`))}</span><span class="where">${esc(where)}</span>
    <span class="vals">${repeats ? '' : `${esc(message)}${structured ? '<br>' : ''}`}${esc(vals)}</span></li>`;
}

export function criterionHtml(c) {
  const shown = c.findings.slice(0, MAX_FINDINGS);
  const more = c.findings.length - shown.length;
  const hint = c.findings.find((f) => f.hint)?.hint;
  const list = shown.length
    ? `<details${shown.length <= 3 ? ' open' : ''}><summary>${esc(tn('rep.findings', c.findings.length))}</summary>
       <ul class="vx-findings">${shown.map(findingHtml).join('')}${more > 0 ? `<li class="hint">${esc(t('rep.moreItems', { n: tx(more) }))}</li>` : ''}</ul>
       ${hint ? `<p class="vx-fix"><strong>${esc(t('rep.fix'))}</strong> ${esc(tx(hint))}</p>` : ''}</details>`
    : '';
  return `<li class="vx-item ${c.status}">${glyph(c.status)}
    <h3>${esc(t(`crit.${c.id}`))}<span class="state">${esc(t(`status.${c.status}`))}</span></h3>
    <p>${esc(tx(c.summary) + (c.note ? ` ${tx(c.note)}` : ''))}</p>${list}</li>`;
}

const listOf = (values) => values.map(tx).join(', ');

/** Before/after view of a corrected copy. @param entry { index, fixed: { changes } } */
export function compareHtml(entry) {
  const { rows, paragraphs, sections } = entry.fixed.changes;
  const label = (r) => (r.kind === 'margin' ? `${t('crit.margins')}, ${t(`side.${r.side}`)}` : t(`crit.${r.kind}`));
  const items = rows.map((r) => {
    const shown = r.places.slice(0, MAX_FINDINGS);
    const more = r.places.length - shown.length;
    return `<li class="change"><span class="where">${esc(label(r))} · ${esc(tn(r.kind === 'margin' ? 'cmp.sections' : 'cmp.paragraphs', r.count))}</span>
      <span class="vals"><span class="vx-was">${esc(listOf(r.before))}</span> <span aria-label="${esc(t('cmp.to'))}">→</span> <strong class="vx-now">${esc(listOf(r.after))}</strong></span>
      <details><summary>${esc(t('cmp.where'))}</summary><ul class="vx-places">${shown.map((w) => `<li>${esc(tx(w))}</li>`).join('')}${more > 0 ? `<li>${esc(t('rep.moreItems', { n: tx(more) }))}</li>` : ''}</ul></details></li>`;
  }).join('');
  return `<div class="vx-compare">
    <h3 class="vx-group">${esc(t('cmp.title'))}</h3>
    <div class="vx-fixbar"><p>${esc(rows.length ? t('cmp.summary', { p: tn('cmp.paragraphs', paragraphs), s: tn('cmp.sections', sections) }) : t('cmp.nothing'))}</p>
      <button type="button" class="ow-btn" data-download="${entry.index}">${esc(t('cmp.download'))}</button></div>
    ${rows.length ? `<ul class="vx-findings vx-changes">${items}</ul>` : ''}
    <p class="vx-note">${esc(t('cmp.note'))}</p></div>`;
}

const tile = (cls, n, label) => `<div class="vx-tile ${cls}"><strong>${n}</strong><span>${esc(label)}</span></div>`;

/**
 * One full report.
 * @param entry { name, doc, result, apa|null, error? }
 */
export function reportHtml(entry) {
  if (entry.error) return `<div class="vx-error" role="alert"><h3>${esc(t('rep.errorTitle', { name: entry.name }))}</h3><p>${esc(t(entry.error))}</p></div>`;
  const { doc, result, apa } = entry;
  const all = apa ? [...result.criteria, ...apa] : result.criteria;
  const counts = countStatuses(all);
  const findings = all.flatMap((c) => c.findings);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const hints = findings.filter((f) => f.severity === 'hint').length;
  const pagesLine = t('rep.meta', { words: tn('rep.words', doc.wordCount), pages: tn('rep.pages', doc.pages) }) + (doc.pagesSource === 'explicit' ? ` ${t('rep.estimated')}` : '');

  return `
    <p class="vx-file">${esc(entry.name)}</p>
    <p class="vx-meta">${esc(pagesLine)}</p>
    <div class="vx-tiles">${tile('ok', counts.ok, t('rep.passed'))}${tile('warn', counts.warn, t('rep.hinted'))}${tile('fail', counts.fail, t('rep.failed'))}</div>
    <p class="vx-verdict">${esc(counts.fail + counts.warn === 0 ? t('rep.allGood') : t('rep.verdict', { errors: tn('rep.errors', errors), hints: tn('rep.hints', hints) }))}</p>
    ${entry.fixed ? compareHtml(entry) : entry.fixable ? `<div class="vx-fixbar"><p>${esc(t('fix.text'))}</p><button type="button" class="ow-btn" data-fix="${entry.index}">${esc(t('fix.button'))}</button></div>` : ''}
    <h3 class="vx-group">${esc(t('rep.groupFormat'))}</h3>
    <ul class="vx-list">${result.criteria.filter((c) => c.group !== 'structure').map(criterionHtml).join('')}</ul>
    <h3 class="vx-group">${esc(t('rep.groupStructure'))}</h3>
    <ul class="vx-list">${result.criteria.filter((c) => c.group === 'structure').map(criterionHtml).join('')}</ul>
    ${apa ? `<h3 class="vx-group">${esc(t('rep.groupApa'))}</h3><ul class="vx-list">${apa.map(criterionHtml).join('')}</ul>` : ''}`;
}

/** Several files: overview table plus one collapsible report per file. */
export function batchHtml(entries) {
  const rows = entries.map((e) => {
    if (e.error) return `<tr><td>${esc(e.name)}</td><td colspan="3">${esc(t(e.error))}</td></tr>`;
    const c = countStatuses(e.apa ? [...e.result.criteria, ...e.apa] : e.result.criteria);
    return `<tr><td>${esc(e.name)}</td><td class="ok">${c.ok}</td><td class="warn">${c.warn}</td><td class="fail">${c.fail}</td></tr>`;
  }).join('');
  const sections = entries.map((e, i) => `<details class="vx-batch"${i === 0 ? ' open' : ''}><summary>${esc(e.name)}</summary>${reportHtml(e)}</details>`).join('');
  return `<h3 class="vx-group">${esc(tn('rep.overview', entries.length))}</h3>
    <table class="vx-table"><thead><tr><th>${esc(t('rep.file'))}</th><th>${esc(t('rep.passed'))}</th><th>${esc(t('rep.hinted'))}</th><th>${esc(t('rep.failed'))}</th></tr></thead><tbody>${rows}</tbody></table>
    ${sections}`;
}
