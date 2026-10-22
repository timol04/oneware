// Import of requirements from a guideline document (PDF, Word or text): reads the text and looks for
// clearly worded values (font, size, line spacing, margins, length). Nothing is guessed: every value comes
// with the sentence it was found in, and the user confirms it in the UI before it is applied.
import { parseDocx } from './docx.js';

// ---------- Reading ----------
let pdfjs;
async function loadPdf() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdf.mjs');
    if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.mjs', import.meta.url).href;
  }
  return pdfjs;
}

/** Text lines of a PDF (text layer only; a scanned PDF has none and gives an empty result). */
async function pdfLines(data) {
  const lib = await loadPdf();
  const doc = await lib.getDocument({ data: new Uint8Array(data).slice(), isEvalSupported: false, useSystemFonts: false }).promise;
  const lines = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const items = (await (await doc.getPage(n)).getTextContent()).items.filter((i) => 'str' in i && i.str);
    const rows = [];
    for (const it of items) {
      const y = it.transform[5];
      const size = Math.abs(it.transform[3]) || 10;
      const row = rows.find((r) => Math.abs(r.y - y) < size * 0.4);
      if (row) row.items.push(it); else rows.push({ y, size, items: [it] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.transform[4] - b.transform[4]);
      let text = ''; let end = null;
      for (const it of r.items) {
        if (end !== null && it.transform[4] - end > r.size * 0.15 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
        text += it.str; end = it.transform[4] + (it.width || 0);
      }
      if (text.trim()) lines.push(text.trim());
    }
  }
  return lines;
}

/** @returns {Promise<string[]>} text lines; throws 'unsupported' or 'unreadable'. */
export async function readGuideline(name, data) {
  try {
    if (/\.pdf$/i.test(name)) return await pdfLines(data);
    if (/\.docx$/i.test(name)) return (await parseDocx(data)).paragraphs.map((p) => p.text.trim()).filter(Boolean);
    if (/\.(txt|md)$/i.test(name)) return new TextDecoder().decode(data).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch { throw new Error('unreadable'); }
  throw new Error('unsupported');
}

// ---------- Finding values ----------
const FONTS = ['Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Garamond', 'Georgia', 'Helvetica', 'Verdana', 'Palatino Linotype', 'Palatino', 'Book Antiqua', 'Century Gothic', 'Tahoma', 'Courier New', 'Computer Modern', 'Open Sans', 'Liberation Serif'];
const FONT_RE = new RegExp(`\\b(${FONTS.join('|')})\\b`, 'gi');
const FONT_CASE = new Map(FONTS.map((f) => [f.toLowerCase(), f]));

const SKIP_SIZE = /fussnote|fußnote|fussnoten|footnote|überschrift|ueberschrift|heading|titel|title|beschriftung|caption|tabelle|abbildung|literatur|zitat|quote|seitenzahl/i;
const SIZE_KEY = /schrift|font|typeface|schriftgr|size|textgr|fliesstext|fließtext|body text|haupttext|text/i;
const SPACING_KEY = /zeilenabstand|zeilenschaltung|zeilenabst|line[\s-]?spacing|spacing|zeilig|-?fach/i;
const MARGIN_KEY = /rand|ränder|raender|seitenrand|margin|seitenränder|bundsteg/i;

const SIDES = { oben: 'top', unten: 'bottom', links: 'left', rechts: 'right', top: 'top', bottom: 'bottom', left: 'left', right: 'right', innen: 'left', inside: 'left', aussen: 'right', außen: 'right', outside: 'right' };
const SIDE_WORD = '(oben|unten|links|rechts|top|bottom|left|right|innen|inside|aussen|außen|outside)';

const toNumber = (s) => {
  let x = s.replace(/[  ]/g, ' ').trim();
  if (/^\d{1,3}(?:[ '’.,]\d{3})+$/.test(x)) x = x.replace(/[ '’.,]/g, ''); // thousands separators
  else x = x.replace(',', '.');
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const NUM = "(\\d{1,3}(?:[ '’.,\\u00a0]\\d{3})+|\\d+(?:[.,]\\d+)?)";

/** Splits text lines into sentences/segments. */
function segments(lines) {
  return lines.flatMap((l) => l.replace(/\s+/g, ' ').split(/(?<=\S{3}[.;])\s+/)).map((s) => s.trim()).filter(Boolean);
}

const add = (map, value, quote) => {
  if (!map.has(value)) map.set(value, quote.length > 200 ? `${quote.slice(0, 197)}…` : quote);
};

/**
 * @param lines text lines of the guideline
 * @returns {{ font, size, lineSpacing, top, bottom, left, right, minWords, maxWords, minPages, maxPages }}
 *   each field is a list of candidates { value, quote } (empty = not found); several candidates mean the
 *   document names more than one value and the user has to choose.
 */
export function extractRules(lines) {
  const found = Object.fromEntries(['font', 'size', 'lineSpacing', 'top', 'bottom', 'left', 'right', 'minWords', 'maxWords', 'minPages', 'maxPages'].map((k) => [k, new Map()]));

  for (const seg of segments(lines)) {
    // Font names
    if (!SKIP_SIZE.test(seg) || /schrift|font/i.test(seg)) {
      for (const m of seg.matchAll(FONT_RE)) add(found.font, FONT_CASE.get(m[1].toLowerCase()), seg);
    }
    // Font size: a number with "pt" next to a word about the font; footnotes, headings etc. are skipped.
    if (SIZE_KEY.test(seg) && !SKIP_SIZE.test(seg)) {
      for (const m of seg.matchAll(/(\d{1,2}(?:[.,]\d)?)\s*(?:pt\b|pkt\b|punkt|point)/gi)) add(found.size, toNumber(m[1]), seg);
    }
    // Line spacing
    if (SPACING_KEY.test(seg) && !/fussnote|fußnote|footnote|literatur|zitat|quote/i.test(seg)) {
      const after = /(?:zeilenabstand|zeilenschaltung|line[\s-]?spacing)\D{0,40}?(\d(?:[.,]\d{1,2})?)(?!\d|\s*(?:pt|cm|mm|%))/i.exec(seg);
      const before = /(\d(?:[.,]\d{1,2})?)\s*-?\s*(?:fach\w*|zeilig\w*|×|x\b|lines?\b|-spaced)/i.exec(seg);
      const m = after ?? before;
      let v = m ? toNumber(m[1]) : null;
      if (v === null) {
        if (/eineinhalb|anderthalb|one and a half/i.test(seg)) v = 1.5;
        else if (/(?:doppel|double)/i.test(seg)) v = 2;
        else if (/einfach\w*\s+zeilenabstand|zeilenabstand\W{0,3}einfach|single[\s-]spac/i.test(seg)) v = 1;
      }
      if (v !== null && v >= 1 && v <= 3) add(found.lineSpacing, v, seg);
    }
    // Margins
    if (MARGIN_KEY.test(seg)) {
      let any = false;
      const toCm = (n, unit) => Math.round((/mm/i.test(unit) ? n / 10 : n) * 100) / 100;
      for (const m of seg.matchAll(new RegExp(`${SIDE_WORD}\\s*[:=]?\\s*(?:je\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(cm|mm)`, 'gi'))) {
        add(found[SIDES[m[1].toLowerCase()]], toCm(toNumber(m[2]), m[3]), seg); any = true;
      }
      for (const m of seg.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(cm|mm)\\s*${SIDE_WORD}`, 'gi'))) {
        add(found[SIDES[m[3].toLowerCase()]], toCm(toNumber(m[1]), m[2]), seg); any = true;
      }
      if (!any && !/korrekturrand|bundsteg|binding|innen|aussen|außen/i.test(seg)) {
        const all = [...seg.matchAll(/(\d+(?:[.,]\d+)?)\s*(cm|mm)\b/gi)];
        if (all.length === 1) for (const side of ['top', 'bottom', 'left', 'right']) add(found[side], toCm(toNumber(all[0][1]), all[0][2]), seg);
      }
    }
    // Length: only with a clear "at least / at most / between" wording.
    for (const [unit, minKey, maxKey] of [['w(?:ö|oe)rter\\w*|worte\\w*|words?', 'minWords', 'maxWords'], ['seiten|pages?', 'minPages', 'maxPages']]) {
      const u = `(?:${unit})`;
      const range = new RegExp(`(?:zwischen|between)?\\s*${NUM}\\s*(?:und|bis|to|and|[-–—])\\s*${NUM}\\s*${u}`, 'i').exec(seg);
      const min = new RegExp(`(?:mindestens|min\\.?|at least|minimum(?: of)?)\\s*${NUM}\\s*${u}`, 'i').exec(seg);
      const max = new RegExp(`(?:h(?:ö|oe)chstens|maximal|max\\.?|at most|not exceed|nicht mehr als|bis zu|up to|maximum(?: of)?)\\s*${NUM}\\s*${u}`, 'i').exec(seg);
      if (range && toNumber(range[1]) < toNumber(range[2])) { add(found[minKey], toNumber(range[1]), seg); add(found[maxKey], toNumber(range[2]), seg); }
      else {
        if (min) add(found[minKey], toNumber(min[1]), seg);
        if (max) add(found[maxKey], toNumber(max[1]), seg);
      }
    }
  }
  return Object.fromEntries(Object.entries(found).map(([k, map]) => [k, [...map].map(([value, quote]) => ({ value, quote }))]));
}

/** True if at least one value was found. */
export const hasFindings = (f) => Object.values(f).some((list) => list.length);
