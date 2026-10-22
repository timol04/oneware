// Structure checks: heading hierarchy, page numbers, captions of figures and tables.
// Same result shape as checker.js: { id, status, summary, findings[] }, group "structure".
import { msg, where } from './checker.js';

// From this share of figures/tables without caption, yellow turns red (same idea as in checker.js).
const WARN_SHARE = 0.1;
const GROUP = 'structure';

const sectionLabel = (doc, i) => {
  const first = doc.paragraphs.find((p) => p.sectionIndex === i);
  return doc.sections.length > 1 ? msg(first ? 'where.sectionPage' : 'where.section', { n: i + 1, page: first?.page }) : msg('where.document');
};
/** Page and first words; an image alone has no words, then only the page is named. */
const whereAt = (p) => (p.text.trim()
  ? where(p)
  : msg(p.pageSource === 'explicit' ? 'where.pageOnlyApprox' : 'where.pageOnly', { page: p.page }));

export function checkStructure(doc) {
  return [checkHeadings(doc), checkPageNumbers(doc), checkCaptions(doc)];
}

// ---------- Heading hierarchy ----------
function checkHeadings(doc) {
  const id = 'headings';
  const heads = doc.paragraphs.filter((p) => p.headingLevel && !p.inTable && p.words > 0);
  if (!heads.length) return { id, group: GROUP, status: 'skip', summary: msg('sum.noHeadings'), findings: [] };
  const findings = [];
  let prev = 0;
  for (const p of heads) {
    const level = p.headingLevel;
    if (level > prev + 1) {
      const first = prev === 0;
      findings.push(first
        ? { severity: 'hint', where: whereAt(p), message: msg('msg.headingFirst', { found: level }), expected: msg('val.level', { n: 1 }), found: msg('val.level', { n: level }), hint: msg('hint.headingFirst') }
        : { severity: 'error', where: whereAt(p), message: msg('msg.headingSkip', { from: prev, found: level }), expected: msg('val.levelMax', { n: prev + 1 }), found: msg('val.level', { n: level }), hint: msg('hint.headingSkip') });
    }
    prev = level;
  }
  const status = findings.some((f) => f.severity === 'error') ? 'fail' : findings.length ? 'warn' : 'ok';
  return { id, group: GROUP, status, findings, summary: findings.length ? msg('sum.headings', { n: findings.length }) : msg('sum.headingsOk', { n: heads.length }) };
}

// ---------- Page numbers ----------
function checkPageNumbers(doc) {
  const id = 'pagenumbers';
  if (doc.pages < 2) return { id, group: GROUP, status: 'skip', summary: msg('sum.onePage'), findings: [] };
  const missing = doc.sections.map((s, i) => [s, i]).filter(([s]) => !s.pageNumber);
  if (!missing.length) return { id, group: GROUP, status: 'ok', findings: [], summary: msg('sum.pageNumbersOk') };
  if (missing.length === doc.sections.length) {
    return {
      id, group: GROUP, status: 'fail', summary: msg('sum.pageNumbersNone'),
      findings: [{ severity: 'error', where: msg('where.document'), message: msg('msg.pageNumbersNone'), expected: msg('val.pageNumber'), found: msg('val.noPageNumber'), hint: msg('hint.pageNumber') }],
    };
  }
  // Some sections are numbered: a missing number is often intended (title page), so only a note.
  return {
    id, group: GROUP, status: 'warn', summary: msg('sum.pageNumbersSome', { n: missing.length }),
    findings: missing.map(([, i]) => ({ severity: 'hint', where: sectionLabel(doc, i), message: msg('msg.pageNumbersSection'), expected: msg('val.pageNumber'), found: msg('val.noPageNumber'), hint: msg('hint.pageNumber') })),
  };
}

// ---------- Captions ----------
const CAPTION_TEXT = /^\s*(Abbildung|Abb\.?|Figure|Fig\.?|Tabelle|Tab\.?|Table)\s*(\d+(?:[.\-–]\d+)*)/i;
const CAPTION_STYLE = /^(caption|beschriftung)/i;
const MAX_CAPTION_WORDS = 30; // longer paragraphs starting with "Table 2 shows" are running text

/** { type: 'figure'|'table'|null, number: '3' | null } for a caption paragraph, else null. */
function captionOf(p) {
  if (p.inTable) return null;
  const m = CAPTION_TEXT.exec(p.text);
  const byStyle = CAPTION_STYLE.test(p.styleName ?? '') || CAPTION_STYLE.test(p.styleId ?? '');
  if (!byStyle && !(m && p.words <= MAX_CAPTION_WORDS)) return null;
  return { type: m ? (/^(abb|fig)/i.test(m[1]) ? 'figure' : 'table') : null, number: m ? m[2] : null };
}

function checkCaptions(doc) {
  const id = 'captions';
  const ps = doc.paragraphs;
  const caps = ps.map(captionOf);
  const figures = ps.filter((p) => p.hasFigure && !p.inTable);
  const tables = doc.tables ?? [];
  if (!figures.length && !tables.length) return { id, group: GROUP, status: 'skip', summary: msg('sum.noCaptionable'), findings: [] };

  // Nearest paragraph with content in a direction. Empty paragraphs and neighbouring pictures (stacked
  // figures share one caption) are skipped; a table ends the search.
  const neighbour = (from, step) => {
    for (let i = from; i >= 0 && i < ps.length; i += step) {
      if (ps[i].inTable) return null;
      if (ps[i].text.trim() || (ps[i].hasFigure && caps[i])) return i;
    }
    return null;
  };
  const accepts = (cap, type) => cap && (cap.type === null || cap.type === type);

  const findings = [];
  const missing = [];
  for (const p of figures) {
    const near = [p.index, neighbour(p.index - 1, -1), neighbour(p.index + 1, 1)];
    if (!near.some((i) => i !== null && accepts(caps[i], 'figure'))) missing.push({ type: 'figure', p });
  }
  for (const tb of tables) {
    const near = [neighbour(tb.start - 1, -1), neighbour(tb.end, 1)];
    if (!near.some((i) => i !== null && accepts(caps[i], 'table'))) missing.push({ type: 'table', p: ps[tb.start] ?? { text: '', page: tb.page, pageSource: 'explicit' } });
  }
  for (const { type, p } of missing.sort((a, b) => a.p.page - b.p.page)) {
    findings.push({
      severity: 'error', where: whereAt(p), message: msg(`msg.captionMissing.${type}`),
      expected: msg(`val.caption.${type}`), found: msg('val.noCaption'), hint: msg('hint.caption'),
    });
  }

  // Numbering: Abbildung 1, 2, 3 ... without gaps or repeats (only plain numbers; "2.1" style is not judged).
  let numbering = 0;
  for (const type of ['figure', 'table']) {
    const numbered = ps.map((p, i) => [p, caps[i]]).filter(([, c]) => c?.type === type && c.number !== null);
    if (!numbered.every(([, c]) => /^\d+$/.test(c.number))) continue;
    numbered.forEach(([p, c], i) => {
      if (Number(c.number) === i + 1) return;
      numbering++;
      findings.push({
        severity: 'error', where: whereAt(p), message: msg(`msg.captionNumber.${type}`, { found: Number(c.number), expected: i + 1 }),
        expected: String(i + 1), found: c.number, hint: msg('hint.captionNumber'),
      });
    });
  }

  const total = figures.length + tables.length;
  const share = missing.length / total;
  const status = missing.length === 0 && numbering === 0 ? 'ok' : numbering === 0 && share <= WARN_SHARE ? 'warn' : 'fail';
  const summary = missing.length ? msg('sum.captionsMissing', { n: missing.length, total })
    : numbering ? msg('sum.captionNumbers', { n: numbering }) : msg('sum.captionsOk', { n: total });
  return { id, group: GROUP, status, findings, summary };
}
