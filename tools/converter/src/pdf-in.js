// PDF reader (pdf.js, bundled in vendor/): text per page, and pages rendered as pictures.
// pdf.js reads the text layer only. A scanned PDF has none, which is reported as an empty result.
import { run, tidy } from './blocks.js';

let pdfjs;
async function load() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdf.mjs');
    if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.mjs', import.meta.url).href;
  }
  return pdfjs;
}

export async function openPdf(data) {
  const lib = await load();
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
  return lib.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false }).promise;
}

/** Groups text items into lines by baseline, lines into paragraphs by vertical gap. */
export function pageToBlocks(items) {
  const rows = [];
  for (const it of items) {
    if (!('str' in it) || !it.str) continue;
    const y = it.transform[5];
    const size = Math.abs(it.transform[3]) || it.height || 10;
    const row = rows.find((r) => Math.abs(r.y - y) < size * 0.4);
    if (row) row.items.push(it);
    else rows.push({ y, size, items: [it] });
  }
  rows.sort((a, b) => b.y - a.y);
  const lines = rows.map((r) => {
    r.items.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = '';
    let prevEnd = null;
    for (const it of r.items) {
      if (prevEnd !== null && it.transform[4] - prevEnd > r.size * 0.15 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
      text += it.str;
      prevEnd = it.transform[4] + (it.width || 0);
    }
    return { text: text.trim(), y: r.y, size: r.size };
  }).filter((l) => l.text);

  const sizes = lines.map((l) => Math.round(l.size)).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 10;
  const blocks = [];
  let current = null;
  let prev = null;
  for (const l of lines) {
    const gap = prev ? prev.y - l.y : 0;
    const heading = l.size > body * 1.25 && l.text.length < 120;
    const bullet = /^([•▪◦\-–*]|\d+[.)])\s+/.exec(l.text);
    const newPara = !current || gap > Math.max(l.size, prev.size) * 1.7 || heading || (prev && prev.size > body * 1.25) || bullet;
    if (newPara) {
      if (current) blocks.push(current);
      if (heading) current = { type: 'heading', level: l.size > body * 1.7 ? 1 : l.size > body * 1.4 ? 2 : 3, runs: [run(l.text)] };
      else if (bullet) current = { type: 'item', ordered: /\d/.test(bullet[1]), runs: [run(l.text.slice(bullet[0].length))] };
      else current = { type: 'para', runs: [run(l.text)] };
    } else {
      // Join wrapped lines; a hyphen at the end of a line joins the word.
      const last = current.runs[0];
      last.t = /[a-zäöüß]-$/.test(last.t) ? last.t.slice(0, -1) + l.text : `${last.t} ${l.text}`;
    }
    prev = l;
  }
  if (current) blocks.push(current);
  return blocks;
}

export async function readPdf(data) {
  const pdf = await openPdf(data);
  const blocks = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    blocks.push(...pageToBlocks(content.items).map((b) => ({ ...b, runs: tidy(b.runs) })));
    page.cleanup();
  }
  const pages = pdf.numPages;
  await pdf.loadingTask.destroy();
  return { blocks, pages };
}

/** Renders every page to a canvas picture. `scale` 1 = 72 dpi, 2 = 144 dpi. Browser only. */
export async function renderPdf(data, { mime = 'image/png', quality = 0.92, scale = 2, onPage } = {}) {
  const pdf = await openPdf(data);
  const out = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    out.push(await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), mime, quality)));
    canvas.width = canvas.height = 0;
    page.cleanup();
    onPage?.(n, pdf.numPages);
  }
  await pdf.loadingTask.destroy();
  return out;
}
