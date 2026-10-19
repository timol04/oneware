// Fixer: writes a corrected copy of a .docx. It sets font, size and line spacing directly on every body
// paragraph (the same paragraphs the checker looks at) and the page margins on every section.
// The original file is never touched; everything else in the package is copied unchanged.
//
// Word is strict about the order of child elements, so new elements are inserted at the position the
// OOXML schema expects. Only word/document.xml is rewritten.
import { parseXml } from './xml.js';
import { parseDocx } from './docx.js';

const RUN_CONTAINERS = new Set(['w:hyperlink', 'w:ins', 'w:smartTag', 'w:fldSimple', 'w:sdt', 'w:sdtContent']);
const THEME_FONT_ATTRS = ['w:asciiTheme', 'w:hAnsiTheme', 'w:eastAsiaTheme', 'w:cstheme', 'w:hint'];
const TWIP_PER_CM = 567;

// Elements that come AFTER the one being inserted (schema order).
const AFTER_SPACING = new Set(['w:ind', 'w:contextualSpacing', 'w:mirrorIndents', 'w:suppressOverlap', 'w:jc', 'w:textDirection', 'w:textAlignment', 'w:textboxTightWrap', 'w:outlineLvl', 'w:divId', 'w:cnfStyle', 'w:rPr', 'w:sectPr', 'w:pPrChange']);
const AFTER_SZ = new Set(['w:szCs', 'w:highlight', 'w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout', 'w:specVanish', 'w:oMath', 'w:rPrChange']);
const AFTER_SZCS = new Set([...AFTER_SZ].filter((n) => n !== 'w:szCs'));
// Elements that come BEFORE w:rFonts inside w:rPr: only w:rStyle.

const el = (name, attrs = {}) => ({ name, attrs, kids: [] });
const child = (n, name) => n.kids.find((c) => c.name === name);

/** Inserts `node` before the first kid whose name is in `after`, else at the end. */
function insertBefore(parent, node, after) {
  const i = parent.kids.findIndex((c) => after.has(c.name));
  parent.kids.splice(i === -1 ? parent.kids.length : i, 0, node);
}
function ensure(parent, name, after) {
  let n = child(parent, name);
  if (!n) { n = el(name); insertBefore(parent, n, after); }
  return n;
}

// ---------- serializer ----------
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');
function serialize(n) {
  if (n.name === '#text') return escText(n.text);
  const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
  return n.kids.length ? `<${n.name}${attrs}>${n.kids.map(serialize).join('')}</${n.name}>` : `<${n.name}${attrs}/>`;
}

// ---------- fixes ----------
function runsOf(nodes, out = []) {
  for (const n of nodes) {
    if (n.name === 'w:r') out.push(n);
    else if (RUN_CONTAINERS.has(n.name)) runsOf(n.kids, out);
  }
  return out;
}

function fixRun(run, rules) {
  let rPr = run.kids.find((c) => c.name === 'w:rPr');
  if (!rPr) { rPr = el('w:rPr'); run.kids.unshift(rPr); }
  const fonts = child(rPr, 'w:rFonts') ?? (() => {
    const f = el('w:rFonts');
    const at = rPr.kids[0]?.name === 'w:rStyle' ? 1 : 0;
    rPr.kids.splice(at, 0, f);
    return f;
  })();
  for (const a of THEME_FONT_ATTRS) delete fonts.attrs[a];
  for (const a of ['w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia']) fonts.attrs[a] = rules.font;
  const half = String(Math.round(rules.size * 2));
  ensure(rPr, 'w:sz', AFTER_SZ).attrs['w:val'] = half;
  ensure(rPr, 'w:szCs', AFTER_SZCS).attrs['w:val'] = half;
}

function fixParagraph(p, rules) {
  let pPr = p.kids.find((c) => c.name === 'w:pPr');
  if (!pPr) { pPr = el('w:pPr'); p.kids.unshift(pPr); }
  const spacing = ensure(pPr, 'w:spacing', AFTER_SPACING);
  spacing.attrs['w:line'] = String(Math.round(rules.lineSpacing * 240));
  spacing.attrs['w:lineRule'] = 'auto';
  for (const run of runsOf(p.kids)) if (run.kids.some((c) => c.name === 'w:t')) fixRun(run, rules);
}

/**
 * Walks the body in the same order as the parser (paragraphs, tables, content controls), so the n-th
 * w:p is the n-th entry of `paras`. Body paragraphs get the fixes; every sectPr gets the margins.
 */
function walk(nodes, rules, stats, paras) {
  for (const n of nodes) {
    if (n.name === 'w:p') {
      const info = paras[stats.seen++];
      if (info && info.words > 0 && !info.inTable && !(rules.ignoreSpecial && info.special)) { fixParagraph(n, rules); stats.paragraphs++; }
      const sect = child(child(n, 'w:pPr') ?? el('x'), 'w:sectPr');
      if (sect) fixSection(sect, rules, stats);
    } else if (n.name === 'w:tbl') {
      for (const tr of n.kids.filter((c) => c.name === 'w:tr')) for (const tc of tr.kids.filter((c) => c.name === 'w:tc')) walk(tc.kids, rules, stats, paras);
    } else if (n.name === 'w:sdt') {
      const content = child(n, 'w:sdtContent');
      if (content) walk(content.kids, rules, stats, paras);
    } else if (n.name === 'w:sectPr') {
      fixSection(n, rules, stats);
    }
  }
}

function fixSection(sectPr, rules, stats) {
  const mar = child(sectPr, 'w:pgMar');
  if (!mar) return;
  let changed = false;
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const cm = rules.marginsCm[side];
    if (cm === null || cm === undefined) continue;
    const twips = String(Math.round(cm * TWIP_PER_CM));
    if (mar.attrs[`w:${side}`] !== twips) { mar.attrs[`w:${side}`] = twips; changed = true; }
  }
  if (changed) stats.sections++;
}

/**
 * @param data   .docx bytes (ArrayBuffer or Uint8Array)
 * @param rules  same rules object as for the checker
 * @returns {{ bytes: Uint8Array, stats: { paragraphs: number, sections: number } }}
 */
export async function fixDocx(data, rules) {
  const { default: JSZip } = await import('../vendor/jszip.js');
  const zip = await JSZip.loadAsync(data);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('invalid');
  const root = parseXml(await file.async('string')).find((n) => n.name === 'w:document');
  const body = root && child(root, 'w:body');
  if (!body) throw new Error('invalid');
  const { paragraphs } = await parseDocx(data);
  const stats = { paragraphs: 0, sections: 0, seen: 0 };
  walk(body.kids, rules, stats, paragraphs);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${serialize(root)}`);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return { bytes, stats: { paragraphs: stats.paragraphs, sections: stats.sections } };
}
