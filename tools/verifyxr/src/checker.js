// Check logic: compares the result of parseDocx() with the user's rules.
//
// Every criterion returns { id, status, summary, findings[] }.
//   status: 'ok' | 'warn' | 'fail' | 'skip'
// Texts are message objects { k, p } (translation key + parameters), translated by the UI.
// Findings: { severity: 'error'|'hint', where, message, expected, found, hint }; expected/found are
// message objects or plain strings (font names, numbers with unit).

import { checkStructure } from './structure.js';

export const TOLERANCE = { size: 0.01, spacing: 0.05, marginCm: 0.1 };
// From this share of deviating words, yellow turns red.
const WARN_SHARE = 0.1;

export const msg = (k, p = {}) => ({ k, p });
export const countWords = (t) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Where a paragraph sits: page (approximate when estimated) and its first characters. */
export const where = (p) => {
  const text = p.text.trim();
  return msg(p.pageSource === 'explicit' ? 'where.pageApprox' : 'where.page', { page: p.page, text: text.slice(0, 40) + (text.length > 40 ? '…' : '') });
};

/**
 * @param doc    result of parseDocx()
 * @param rules  { font, size, lineSpacing, marginsCm:{top,bottom,left,right}, minWords, maxWords, minPages, maxPages, ignoreSpecial }
 */
export function checkDocument(doc, rules) {
  const criteria = [
    checkFont(doc, rules), checkSize(doc, rules), checkSpacing(doc, rules),
    checkMargins(doc, rules), checkWordCount(doc, rules), checkPageCount(doc, rules),
    ...checkStructure(doc),
  ];
  return { criteria, status: overall(criteria) };
}

export function overall(criteria) {
  const checked = criteria.filter((c) => c.status !== 'skip');
  return checked.some((c) => c.status === 'fail') ? 'fail' : checked.some((c) => c.status === 'warn') ? 'warn' : 'ok';
}

// ---------- Font, size, line spacing ----------
const sameFont = (a, b) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Paragraphs checked as body text (no tables, optionally no special styles, no empty ones). */
const bodyParagraphs = (doc, rules) => doc.paragraphs.filter((p) => p.words > 0 && !p.inTable && !(rules.ignoreSpecial && p.special));

/**
 * Generic run/paragraph check. `probe(item, para)` returns a deviation
 * { message, expected, found, hint, severity? } or null. Findings are merged per paragraph.
 */
function checkByRuns({ id, okMsg, doc, rules, probe, perParagraph = false }) {
  const paras = bodyParagraphs(doc, rules);
  const total = paras.reduce((s, p) => s + p.words, 0);
  if (total === 0) return { id, status: 'skip', summary: msg('sum.noBody'), findings: [] };

  let badWords = 0;
  const findings = [];
  for (const p of paras) {
    const problems = new Map(); // message key + params -> { d, words }
    const add = (d, w) => {
      const key = JSON.stringify(d.message);
      problems.set(key, { d, words: (problems.get(key)?.words ?? 0) + w });
    };
    if (perParagraph) {
      const d = probe(null, p);
      if (d) add(d, p.words);
    } else {
      for (const item of p.items) {
        if (item.text === undefined || !item.text.trim()) continue;
        const d = probe(item, p);
        if (d) add(d, countWords(item.text));
      }
    }
    for (const { d, words } of problems.values()) {
      badWords += words;
      findings.push({ severity: 'error', ...d, where: where(p), words });
    }
  }
  // Words at run boundaries can be counted twice: cap the share at 100 %.
  const share = Math.min(1, badWords / total);
  const status = badWords === 0 ? 'ok' : share <= WARN_SHARE ? 'warn' : 'fail';
  const summary = badWords === 0 ? okMsg : msg('sum.deviations', { n: findings.length, percent: Math.round(share * 100) });
  return { id, status, summary, findings };
}

function checkFont(doc, rules) {
  return checkByRuns({
    id: 'font', doc, rules, okMsg: msg('sum.fontOk', { font: rules.font }),
    probe: (item) => (sameFont(item.font, rules.font) ? null : {
      message: msg('msg.font', { found: item.font ?? msg('val.unknown'), expected: rules.font }),
      expected: rules.font, found: item.font ?? msg('val.unknown'),
      hint: msg('hint.font', { font: rules.font }),
    }),
  });
}

function checkSize(doc, rules) {
  return checkByRuns({
    id: 'size', doc, rules, okMsg: msg('sum.sizeOk', { size: rules.size }),
    probe: (item) => (item.size !== undefined && Math.abs(item.size - rules.size) <= TOLERANCE.size ? null : {
      message: msg('msg.size', { found: item.size === undefined ? msg('val.unknown') : msg('val.pt', { n: item.size }), expected: msg('val.pt', { n: rules.size }) }),
      expected: msg('val.pt', { n: rules.size }), found: item.size === undefined ? msg('val.unknown') : msg('val.pt', { n: item.size }),
      hint: msg('hint.size', { size: rules.size }),
    }),
  });
}

function checkSpacing(doc, rules) {
  const hint = msg('hint.spacing', { n: rules.lineSpacing });
  return checkByRuns({
    id: 'spacing', doc, rules, perParagraph: true, okMsg: msg('sum.spacingOk', { n: rules.lineSpacing }),
    probe: (_, p) => {
      const ls = p.lineSpacing;
      if (ls.kind === 'multiple') {
        return Math.abs(ls.value - rules.lineSpacing) <= TOLERANCE.spacing ? null : {
          message: msg('msg.spacing', { found: ls.value, expected: rules.lineSpacing }),
          expected: msg('val.times', { n: rules.lineSpacing }), found: msg('val.times', { n: ls.value }), hint,
        };
      }
      // A fixed spacing (exact/at least) in pt cannot be converted to a multiple reliably: a hint only.
      const kind = msg(ls.kind === 'exact' ? 'val.exact' : 'val.atLeast');
      return {
        message: msg('msg.spacingFixed', { pt: ls.value, kind, expected: rules.lineSpacing }),
        expected: msg('val.times', { n: rules.lineSpacing }), found: msg('val.fixedPt', { pt: ls.value, kind }),
        severity: 'hint', hint: msg('hint.spacingFixed', { n: rules.lineSpacing }),
      };
    },
  });
}

// ---------- Margins ----------
const SIDES = ['top', 'bottom', 'left', 'right'];

function checkMargins(doc, rules) {
  const findings = [];
  let worst = 0;
  doc.sections.forEach((sec, i) => {
    const firstPara = doc.paragraphs.find((p) => p.sectionIndex === i);
    const label = doc.sections.length > 1
      ? msg(firstPara ? 'where.sectionPage' : 'where.section', { n: i + 1, page: firstPara?.page })
      : msg('where.document');
    for (const side of SIDES) {
      const actual = sec.margins[side];
      const expected = rules.marginsCm[side];
      if (actual === undefined || expected === null || expected === undefined) continue;
      const diff = Math.abs(actual - expected);
      if (diff > TOLERANCE.marginCm) {
        worst = Math.max(worst, diff);
        findings.push({
          where: label, severity: diff <= 0.5 ? 'hint' : 'error',
          message: msg('msg.margin', { side: msg(`side.${side}`), found: actual, expected }),
          expected: msg('val.cm', { n: expected }), found: msg('val.cm', { n: actual }),
          hint: msg('hint.margins'),
        });
      }
    }
  });
  const status = findings.length === 0 ? 'ok' : worst <= 0.5 ? 'warn' : 'fail';
  return { id: 'margins', status, findings, summary: findings.length === 0 ? msg('sum.marginsOk') : msg('sum.margins', { n: findings.length }) };
}

// ---------- Length ----------
const limits = (min, max) => (min != null && max != null ? msg('val.limitsBoth', { min, max }) : min != null ? msg('val.limitsMin', { min }) : msg('val.limitsMax', { max }));

function checkWordCount(doc, rules) {
  const { minWords, maxWords } = rules;
  if (minWords == null && maxWords == null) return { id: 'words', status: 'skip', summary: msg('sum.noLimits'), findings: [] };
  const n = doc.wordCount;
  const tooFew = minWords != null && n < minWords;
  const bad = tooFew ? msg('msg.wordsMin', { n, min: minWords }) : maxWords != null && n > maxWords ? msg('msg.wordsMax', { n, max: maxWords }) : null;
  return {
    id: 'words', status: bad ? 'fail' : 'ok',
    summary: bad ?? msg('sum.wordsOk', { n }),
    findings: bad ? [{
      where: msg('where.document'), severity: 'error', message: bad,
      expected: limits(minWords, maxWords), found: msg('val.words', { n }),
      hint: msg(tooFew ? 'hint.wordsMin' : 'hint.wordsMax'),
    }] : [],
  };
}

function checkPageCount(doc, rules) {
  const { minPages, maxPages } = rules;
  if (minPages == null && maxPages == null) return { id: 'pages', status: 'skip', summary: msg('sum.noLimits'), findings: [] };
  const n = doc.pages;
  // Without a layout engine the page count is only reliable if Word stored it.
  const reliable = doc.pagesSource !== 'explicit';
  const bad = minPages != null && n < minPages ? msg('msg.pagesMin', { n, min: minPages }) : maxPages != null && n > maxPages ? msg('msg.pagesMax', { n, max: maxPages }) : null;
  const estimate = reliable ? null : msg('sum.pagesEstimate');
  return {
    id: 'pages', status: bad ? (reliable ? 'fail' : 'warn') : 'ok',
    summary: bad ?? msg('sum.pagesOk', { n }), note: bad || !reliable ? estimate : null,
    findings: bad ? [{
      where: msg('where.document'), severity: reliable ? 'error' : 'hint', message: bad, note: estimate,
      expected: limits(minPages, maxPages), found: msg(reliable ? 'val.pages' : 'val.pagesEst', { n }),
      hint: msg('hint.pages'),
    }] : [],
  };
}
