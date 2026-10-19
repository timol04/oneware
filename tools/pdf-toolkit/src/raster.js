// Browser-only: draws PDF pages into pictures with pdf.js (bundled in vendor/). Used for thumbnails and strong compression.
import { MAX_PIXELS } from './config.js';

let pdfjs;
async function load() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.mjs', import.meta.url).href;
  }
  return pdfjs;
}

/** Opens a PDF for drawing. The bytes are copied because pdf.js hands them to its worker. */
export async function openForDrawing(bytes) {
  const lib = await load();
  return lib.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false }).promise;
}

/** Frees a document opened with openForDrawing. */
export const closeDrawing = (pdf) => pdf.loadingTask.destroy();

/** Draws page `index` (0-based) onto `canvas`, `width` CSS pixels wide, sharp for the given pixel ratio. */
export async function drawPage(pdf, index, canvas, width, ratio = 1) {
  const page = await pdf.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (width * ratio) / base.width });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return { width: base.width, height: base.height };
}

const toJpeg = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))) : reject(new Error('encode'))), 'image/jpeg', quality);
});

/**
 * Redraws every page as a JPEG picture.
 * @returns {Promise<{ jpeg: Uint8Array, width: number, height: number }[]>} width/height in PDF points
 */
export async function pagesToJpeg(pdf, { dpi, quality }, onPage) {
  const out = [];
  const canvas = document.createElement('canvas');
  for (let i = 0; i < pdf.numPages; i++) {
    onPage?.(i + 1, pdf.numPages);
    await new Promise((r) => setTimeout(r, 0));
    const page = await pdf.getPage(i + 1);
    const base = page.getViewport({ scale: 1 });
    let scale = dpi / 72;
    const pixels = base.width * base.height * scale * scale;
    if (pixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / pixels);
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup();
    out.push({ jpeg: await toJpeg(canvas, quality), width: base.width, height: base.height });
  }
  canvas.width = canvas.height = 0;
  return out;
}
