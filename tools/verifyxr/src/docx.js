// .docx parser: unzips with JSZip and reads word/document.xml, word/styles.xml, word/theme/theme1.xml and
// docProps/app.xml. Result of parseDocx: flat paragraph list with resolved formatting, sections with page
// margins, word count and a page count estimate. The checks live in checker.js.
//
// OOXML inheritance:
//   run properties:       direct (rPr) -> character style -> paragraph style chain (basedOn) -> docDefaults
//   paragraph properties: direct (pPr) -> paragraph style chain (basedOn) -> docDefaults
import { parseXml } from './xml.js';

const nameOf = (n) => n?.name;
const kids = (n) => n?.kids ?? [];
const attrs = (n) => n?.attrs ?? {};
const child = (n, name) => kids(n).find((c) => c.name === name);
const val = (n, name) => attrs(child(n, name))['w:val'];

const TWIP_PER_CM = 567;
const twipsToCm = (t) => (t === undefined || t === '' ? undefined : Math.round((Number(t) / TWIP_PER_CM) * 100) / 100);

// Styles that are usually formatted differently on purpose (headings, tables of contents, captions).
const SPECIAL_STYLE = /^(heading|title|subtitle|überschrift|titel|untertitel|toc|verzeichnis|inhaltsverzeichnis|caption|beschriftung|tableofcontents|header|footer|kopfzeile|fusszeile|fußzeile)/i;

export async function parseDocx(data) {
  const { default: JSZip } = await import('../vendor/jszip.js');
  const zip = await JSZip.loadAsync(data);
  const read = async (path) => {
    const f = zip.file(path);
    return f ? parseXml(await f.async('string')) : null;
  };
  const [docXml, stylesXml, themeXml, appXml] = await Promise.all([
    read('word/document.xml'),
    read('word/styles.xml'),
    read('word/theme/theme1.xml'),
    zip.file('docProps/app.xml')?.async('string'),
  ]);
  if (!docXml) throw new Error('invalid');
  const relTargets = await readRelTargets(zip);

  const styles = buildStyleResolver(stylesXml, themeXml);
  const body = child(docXml.find((n) => nameOf(n) === 'w:document'), 'w:body');
  if (!body) throw new Error('invalid');

  const paragraphs = [];
  const sections = [];
  const tables = [];
  collectBlocks(kids(body), { paragraphs, sections, tables, styles, inTable: false });

  assignPages(paragraphs, sections);
  tables.forEach((tb) => { tb.page = paragraphs[tb.start]?.page ?? 1; });
  await resolvePageNumbers(sections, relTargets, zip);

  const words = paragraphs.reduce((sum, p) => sum + p.words, 0);
  const computedPages = paragraphs.reduce((m, p) => Math.max(m, p.page), 1);
  const appPages = Number(/<Pages>(\d+)<\/Pages>/.exec(appXml ?? '')?.[1]) || 0;

  return {
    paragraphs,
    sections,
    tables, // top-level tables: { start, end (exclusive), page } as indexes into paragraphs
    wordCount: words,
    pages: Math.max(appPages, computedPages),
    // Where the page count comes from, so the UI can show uncertainty.
    pagesSource: appPages >= computedPages && appPages > 0 ? 'app.xml' : paragraphs.some((p) => p.pageSource === 'lastRendered') ? 'lastRendered' : 'explicit',
  };
}

// ---------- Style resolution ----------
function buildStyleResolver(stylesXml, themeXml) {
  const root = stylesXml?.find((n) => nameOf(n) === 'w:styles');
  const list = kids(root).filter((n) => nameOf(n) === 'w:style');
  const byId = new Map(list.map((s) => [attrs(s)['w:styleId'], s]));
  const defaults = child(root, 'w:docDefaults');
  const rDef = child(child(defaults, 'w:rPrDefault'), 'w:rPr');
  const pDef = child(child(defaults, 'w:pPrDefault'), 'w:pPr');
  const defaultPara = list.find((s) => attrs(s)['w:type'] === 'paragraph' && attrs(s)['w:default'] === '1');

  // Theme-Schriften (asciiTheme="majorHAnsi" etc.) stehen in theme1.xml unter a:fontScheme.
  const fontScheme = child(child(themeXml?.find((n) => nameOf(n) === 'a:theme'), 'a:themeElements'), 'a:fontScheme');
  const themeFont = (themeName) => {
    const group = child(fontScheme, themeName.startsWith('major') ? 'a:majorFont' : 'a:minorFont');
    return attrs(child(group, 'a:latin'))['typeface'];
  };

  /** styleId -> [Stil, Basisstil, ...] (spezifischster zuerst, Zyklen abgesichert). */
  const chain = (id) => {
    const out = [];
    const seen = new Set();
    for (let s = byId.get(id); s && !seen.has(attrs(s)['w:styleId']); s = byId.get(val(s, 'w:basedOn'))) {
      seen.add(attrs(s)['w:styleId']);
      out.push(s);
    }
    return out;
  };

  return {
    chain,
    defaultParaStyleId: defaultPara ? attrs(defaultPara)['w:styleId'] : undefined,
    styleName: (id) => val(byId.get(id), 'w:name') ?? id,
    pDef,
    rDef,
    themeFont,
  };
}

/** Erster definierter Wert aus [direkt, Stil..., Defaults]; getter bekommt je ein pPr/rPr. */
const firstOf = (sources, getter) => {
  for (const src of sources) {
    const v = src && getter(src);
    if (v !== undefined) return v;
  }
  return undefined;
};

// ---------- Dokument durchlaufen ----------
function collectBlocks(nodes, ctx) {
  for (const node of nodes) {
    switch (nameOf(node)) {
      case 'w:p':
        ctx.paragraphs.push(readParagraph(node, ctx));
        break;
      case 'w:tbl': { // tables: text counts as words but is not checked as body text
        const start = ctx.paragraphs.length;
        for (const tr of kids(node).filter((n) => nameOf(n) === 'w:tr'))
          for (const tc of kids(tr).filter((n) => nameOf(n) === 'w:tc'))
            collectBlocks(kids(tc), { ...ctx, inTable: true });
        if (!ctx.inTable) ctx.tables.push({ start, end: ctx.paragraphs.length });
        break;
      }
      case 'w:sdt': // Inhaltssteuerelemente (z.B. Inhaltsverzeichnis) enthalten w:sdtContent
        collectBlocks(kids(child(node, 'w:sdtContent')), ctx);
        break;
      case 'w:sectPr': // last section: sectPr directly under w:body
        ctx.sections.push(readSection(node, ctx.paragraphs.length));
        break;
    }
  }
}

const refId = (sectPr, name) => attrs(kids(sectPr).find((c) => nameOf(c) === name && (attrs(c)['w:type'] ?? 'default') === 'default'))['r:id'];

function readSection(sectPr, endsAfterParagraph) {
  const m = attrs(child(sectPr, 'w:pgMar'));
  return {
    // sectPr describes the section that ends BEFORE this element; w:type applies to its start.
    breakType: val(sectPr, 'w:type') ?? 'nextPage',
    // Header/footer parts of the default pages: relationship ids, resolved in resolvePageNumbers().
    header: refId(sectPr, 'w:headerReference'),
    footer: refId(sectPr, 'w:footerReference'),
    endsAfterParagraph, // Index (exklusiv) in paragraphs
    margins: {
      top: twipsToCm(m['w:top']),
      bottom: twipsToCm(m['w:bottom']),
      left: twipsToCm(m['w:left']),
      right: twipsToCm(m['w:right']),
    },
  };
}

function readParagraph(p, ctx) {
  const { styles } = ctx;
  const pPr = child(p, 'w:pPr');
  const styleId = val(pPr, 'w:pStyle') ?? styles.defaultParaStyleId;
  const chain = styles.chain(styleId);
  const styleName = styles.styleName(styleId);

  // Zeilenabstand: line und lineRule werden einzeln vererbt.
  const pSources = [pPr, ...chain.map((s) => child(s, 'w:pPr')), styles.pDef];
  const spacingAttr = (name) => firstOf(pSources, (src) => attrs(child(src, 'w:spacing'))[name]);
  const line = Number(spacingAttr('w:line'));
  const rule = spacingAttr('w:lineRule') ?? 'auto'; // Spec-Default: auto
  const lineSpacing = Number.isFinite(line) && line > 0
    ? (rule === 'auto' ? { kind: 'multiple', value: round2(line / 240) } : { kind: rule, value: round2(line / 20) }) // exact/atLeast in pt
    : { kind: 'multiple', value: 1 }; // nichts definiert => einfach

  const para = {
    index: ctx.paragraphs.length,
    styleId,
    styleName,
    special: SPECIAL_STYLE.test(styleName) || SPECIAL_STYLE.test(styleId ?? '') || child(pPr, 'w:outlineLvl') !== undefined,
    inTable: ctx.inTable,
    headingLevel: headingLevelOf(pPr, chain, styleName, styleId),
    hasFigure: false,
    pageBreakBefore: child(pPr, 'w:pageBreakBefore') !== undefined && val(pPr, 'w:pageBreakBefore') !== '0',
    lineSpacing,
    items: [], // Reihenfolge: Textsegmente {text,font,size,...} und Marker {marker:'lr'|'br'}
    text: '',
    words: 0,
  };

  // End of a section: its sectPr sits in the pPr of the last paragraph.
  const sectPr = child(pPr, 'w:sectPr');
  collectRuns(kids(p), para, ctx, chain);
  para.text = para.items.map((i) => i.text ?? '').join('');
  para.words = countWords(para.text);
  if (sectPr) ctx.sections.push(readSection(sectPr, ctx.paragraphs.length + 1));
  return para;
}

function collectRuns(nodes, para, ctx, paraChain) {
  for (const n of nodes) {
    const name = nameOf(n);
    if (name === 'w:r') readRun(n, para, ctx, paraChain);
    // Containers around runs. w:del (deleted text in track changes) is skipped on purpose.
    else if (['w:hyperlink', 'w:ins', 'w:smartTag', 'w:fldSimple', 'w:sdt', 'w:sdtContent'].includes(name)) collectRuns(kids(n), para, ctx, paraChain);
  }
}

function readRun(r, para, ctx, paraChain) {
  const { styles } = ctx;
  if (!para.hasFigure && isFigure(r)) para.hasFigure = true;
  const rPr = child(r, 'w:rPr');
  const charStyleId = val(rPr, 'w:rStyle');
  const sources = [
    rPr,
    ...styles.chain(charStyleId).map((s) => child(s, 'w:rPr')),
    ...paraChain.map((s) => child(s, 'w:rPr')),
    styles.rDef,
  ];
  // rFonts: a theme attribute overrides the explicit ascii attribute of the same level.
  const font = firstOf(sources, (src) => {
    const f = attrs(child(src, 'w:rFonts'));
    if (f['w:asciiTheme']) return styles.themeFont(f['w:asciiTheme']) ?? f['w:ascii'];
    return f['w:ascii'];
  });
  const szHalfPt = Number(firstOf(sources, (src) => attrs(child(src, 'w:sz'))['w:val']));
  // <w:i/> without a value (or val not 0/false/off) means italic; inherited like font and size.
  const italic = firstOf(sources, (src) => {
    const i = child(src, 'w:i');
    return i ? !['0', 'false', 'off'].includes(attrs(i)['w:val']) : undefined;
  }) ?? false;
  const base = { font, size: Number.isFinite(szHalfPt) ? szHalfPt / 2 : undefined, italic }; // sz: halbe Punkte

  let buf = '';
  const flush = () => {
    if (buf) para.items.push({ ...base, text: buf });
    buf = '';
  };
  for (const c of kids(r)) {
    switch (nameOf(c)) {
      case 'w:t': buf += kids(c).map((t) => t.text ?? '').join(''); break;
      case 'w:tab': buf += ' '; break;
      case 'w:noBreakHyphen': buf += '-'; break;
      case 'w:br':
        if (attrs(c)['w:type'] === 'page') { flush(); para.items.push({ marker: 'br' }); } else buf += ' ';
        break;
      // Word writes a lastRenderedPageBreak at every computed page boundary when saving.
      case 'w:lastRenderedPageBreak': flush(); para.items.push({ marker: 'lr' }); break;
    }
  }
  flush();
}

const countWords = (text) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const round2 = (x) => Math.round(x * 100) / 100;

// ---------- Assign pages and sections ----------
// Without a layout engine page numbers are an approximation. Two strategies:
//  - 'lastRendered': Word markers from the last save (good when present)
//  - 'explicit': hard breaks and section changes only (underestimates the page count)
function assignPages(paragraphs, sections) {
  // Section per paragraph: the first section that ends after the paragraph.
  const sorted = sections.slice().sort((a, b) => a.endsAfterParagraph - b.endsAfterParagraph);
  sections.length = 0;
  sections.push(...sorted);
  paragraphs.forEach((p) => {
    const idx = sections.findIndex((s) => p.index < s.endsAfterParagraph);
    p.sectionIndex = idx === -1 ? Math.max(sections.length - 1, 0) : idx;
  });

  let lr = 1; let ex = 1; let hasContent = false; let prevSection = 0;
  const hasLR = paragraphs.some((p) => p.items.some((i) => i.marker === 'lr'));
  for (const p of paragraphs) {
    // A section change (except "continuous") starts a new page.
    if (p.sectionIndex !== prevSection && sections[p.sectionIndex]?.breakType !== 'continuous') ex++;
    prevSection = p.sectionIndex;
    if (p.pageBreakBefore && hasContent) ex++;
    for (const item of p.items) {
      if (item.marker === 'lr') { if (hasContent) lr++; }
      else if (item.marker === 'br') ex++;
      else { item.pageLR = lr; item.pageEx = ex; if (item.text.trim()) hasContent = true; }
    }
    // Paragraph without text (e.g. markers only): pin the page to the current state.
    const first = p.items.find((i) => i.text !== undefined);
    p.page = hasLR ? (first?.pageLR ?? lr) : (first?.pageEx ?? ex);
    p.pageSource = hasLR ? 'lastRendered' : 'explicit';
    for (const item of p.items) if (item.text !== undefined) item.page = hasLR ? item.pageLR : item.pageEx;
  }
}

// ---------- Headings and figures ----------
const HEADING_NAME = /^(?:heading|überschrift)\s*([1-9])$/i;

/** Heading level 1..9 of a paragraph (outline level or heading style), or null for body text. */
function headingLevelOf(pPr, chain, styleName, styleId) {
  // The outline level is inherited like other paragraph properties; 9 means "body text".
  const outline = firstOf([pPr, ...chain.map((s) => child(s, 'w:pPr'))], (src) => val(src, 'w:outlineLvl'));
  if (outline !== undefined) {
    const n = Number(outline);
    return Number.isInteger(n) && n >= 0 && n <= 8 ? n + 1 : null;
  }
  const m = HEADING_NAME.exec(styleName ?? '') ?? HEADING_NAME.exec(styleId ?? '');
  return m ? Number(m[1]) : null;
}

// Pictures smaller than this in both directions (EMU) are icons or logos, not figures.
const MIN_FIGURE_EMU = 2 * 360000;

const findDeep = (nodes, pred) => nodes.some((n) => pred(n) || findDeep(kids(n), pred));

/** True if the run holds an inline picture (or an old-style picture) of figure size. */
function isFigure(run) {
  return findDeep(kids(run), (n) => {
    if (nameOf(n) === 'wp:inline') {
      const ext = attrs(child(n, 'wp:extent'));
      const cx = Number(ext.cx); const cy = Number(ext.cy);
      return !(cx < MIN_FIGURE_EMU && cy < MIN_FIGURE_EMU);
    }
    return nameOf(n) === 'v:imagedata';
  });
}

// ---------- Page numbers ----------
async function readRelTargets(zip) {
  const f = zip.file('word/_rels/document.xml.rels');
  const map = new Map();
  if (!f) return map;
  for (const rel of parseXml(await f.async('string')).flatMap((n) => kids(n))) {
    const a = attrs(rel);
    if (a.Id && a.Target) map.set(a.Id, a.Target.replace(/^\//, '').replace(/^(?!word\/)/, 'word/'));
  }
  return map;
}

const PAGE_FIELD = /^\s*PAGE(\s|$)/i;
const hasPageField = (nodes) => findDeep(nodes, (n) => (nameOf(n) === 'w:fldSimple' && PAGE_FIELD.test(attrs(n)['w:instr'] ?? ''))
  || (nameOf(n) === 'w:instrText' && PAGE_FIELD.test(kids(n).map((t) => t.text ?? '').join(''))));

/**
 * Sets section.pageNumber: true if the header or footer of the section's default pages holds a PAGE field.
 * Sections without their own reference inherit it from the previous section.
 */
async function resolvePageNumbers(sections, relTargets, zip) {
  const cache = new Map();
  const partHasField = async (rid) => {
    const path = relTargets.get(rid);
    if (!path || !/word\/(header|footer)/.test(path)) return false;
    if (!cache.has(path)) {
      const f = zip.file(path);
      cache.set(path, f ? hasPageField(parseXml(await f.async('string'))) : false);
    }
    return cache.get(path);
  };
  let header; let footer; // a section without its own reference inherits the previous section's
  for (const sec of sections) {
    header = sec.header ?? header;
    footer = sec.footer ?? footer;
    sec.pageNumber = (await Promise.all([header, footer].filter(Boolean).map(partHasField))).some(Boolean);
  }
}
