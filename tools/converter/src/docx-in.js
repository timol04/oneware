// .docx reader: text, headings, bold/italic, lists and simple tables. Images, text boxes, headers, footers,
// footnotes and layout are not carried over.
import { parseXml } from './xml.js';
import { tidy } from './blocks.js';

const kids = (n) => n?.kids ?? [];
const child = (n, name) => kids(n).find((c) => c.name === name);
const attr = (n, name) => n?.attrs?.[name];
const textOf = (n) => kids(n).map((k) => (k.name === '#text' ? k.text : '')).join('');
/** w:b / w:i are on unless w:val says off. */
const flag = (rPr, name) => {
  const n = child(rPr, name);
  if (!n) return false;
  const v = attr(n, 'w:val');
  return !(v === '0' || v === 'false' || v === 'off');
};

function collectRuns(nodes, style, out) {
  for (const n of nodes) {
    if (n.name === 'w:r') {
      const rPr = child(n, 'w:rPr');
      const s = { b: style.b || flag(rPr, 'w:b'), i: style.i || flag(rPr, 'w:i') };
      for (const k of kids(n)) {
        if (k.name === 'w:t') out.push({ t: textOf(k), ...(s.b ? { b: true } : {}), ...(s.i ? { i: true } : {}) });
        else if (k.name === 'w:tab') out.push({ t: '\t' });
        else if (k.name === 'w:br' || k.name === 'w:cr') out.push({ t: attr(k, 'w:type') === 'page' ? '' : '\n' });
      }
    } else if (['w:hyperlink', 'w:ins', 'w:smartTag', 'w:sdt', 'w:sdtContent', 'w:fldSimple'].includes(n.name)) {
      collectRuns(kids(n), style, out);
    }
  }
}

function parseNumbering(xml) {
  // numId -> ordered? (decided by the number format of the first level)
  const ordered = new Map();
  const root = xml?.find((n) => n.name === 'w:numbering');
  if (!root) return ordered;
  const abstract = new Map();
  for (const a of kids(root).filter((n) => n.name === 'w:abstractNum')) {
    const lvl = kids(a).find((l) => l.name === 'w:lvl');
    abstract.set(attr(a, 'w:abstractNumId'), attr(child(lvl, 'w:numFmt'), 'w:val') !== 'bullet');
  }
  for (const num of kids(root).filter((n) => n.name === 'w:num')) {
    ordered.set(attr(num, 'w:numId'), abstract.get(attr(child(num, 'w:abstractNumId'), 'w:val')) ?? false);
  }
  return ordered;
}

function parseStyles(xml) {
  // styleId -> heading level (1..3) for headings and titles
  const levels = new Map();
  const root = xml?.find((n) => n.name === 'w:styles');
  for (const s of kids(root).filter((n) => n.name === 'w:style')) {
    const id = attr(s, 'w:styleId') ?? '';
    const name = (attr(child(s, 'w:name'), 'w:val') ?? '').toLowerCase();
    let m = /^(?:heading|überschrift)\s*(\d)$/.exec(name);
    if (m) levels.set(id, Math.min(Number(m[1]), 3));
    else if (name === 'title' || name === 'titel') levels.set(id, 1);
    else if (name === 'subtitle' || name === 'untertitel') levels.set(id, 2);
  }
  return levels;
}

export async function readDocx(data) {
  const { default: JSZip } = await import('../vendor/jszip.js');
  const zip = await JSZip.loadAsync(data);
  const read = async (path) => {
    const f = zip.file(path);
    return f ? parseXml(await f.async('string')) : null;
  };
  const [docXml, stylesXml, numXml] = await Promise.all([read('word/document.xml'), read('word/styles.xml'), read('word/numbering.xml')]);
  const body = child(docXml?.find((n) => n.name === 'w:document'), 'w:body');
  if (!body) throw new Error('invalid');
  const headings = parseStyles(stylesXml);
  const ordered = parseNumbering(numXml);

  const blocks = [];
  const paragraph = (p) => {
    const pPr = child(p, 'w:pPr');
    const runs = [];
    collectRuns(kids(p), {}, runs);
    const clean = tidy(runs);
    const text = clean.map((r) => r.t).join('');
    if (!text.trim()) return null;
    const styleId = attr(child(pPr, 'w:pStyle'), 'w:val');
    const level = headings.get(styleId) ?? (Number(/^(?:Heading|berschrift)(\d)$/.exec(styleId ?? '')?.[1]) || 0);
    if (level) return { type: 'heading', level: Math.min(level, 3), runs: clean.map(({ b, ...r }) => r) };
    const numPr = child(pPr, 'w:numPr');
    if (numPr) return { type: 'item', ordered: ordered.get(attr(child(numPr, 'w:numId'), 'w:val')) ?? false, runs: clean };
    return { type: 'para', runs: clean };
  };
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.name === 'w:p') {
        const b = paragraph(n);
        if (b) blocks.push(b);
      } else if (n.name === 'w:tbl') {
        const rows = kids(n).filter((r) => r.name === 'w:tr').map((tr) => kids(tr).filter((c) => c.name === 'w:tc').map((tc) => {
          const parts = [];
          for (const p of kids(tc).filter((x) => x.name === 'w:p')) {
            const runs = [];
            collectRuns(kids(p), {}, runs);
            parts.push(runs.map((r) => r.t).join(''));
          }
          return parts.filter(Boolean).join(' ').trim();
        }));
        if (rows.length) blocks.push({ type: 'table', rows });
      } else if (n.name === 'w:sdt' || n.name === 'w:sdtContent') {
        walk(kids(n));
      }
    }
  };
  walk(kids(body));
  return blocks;
}
