// Reads text from a receipt photo in the browser. The engine (Tesseract, WebAssembly) and its language data are
// bundled in vendor/ocr and load only when a scan starts. The image never leaves the device.

const BASE = new URL('../vendor/ocr/', import.meta.url).href;
const MAX_SIDE = 2400; // longer sides are scaled down: faster, and enough detail for receipt print

export const ocrSupported = () => typeof WebAssembly === 'object' && typeof createImageBitmap === 'function';

/** Draws the photo upright, scaled down if large, in grey with more contrast (helps on thermal paper). */
async function prepare(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.35)';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

/** Recognizes the text of an image file. `langs` e.g. ['deu', 'eng']; `onProgress(0..1)` for the recognition step. */
export async function readReceipt(file, langs, onProgress = () => {}) {
  const canvas = await prepare(file);
  const { default: Tesseract } = await import('../vendor/ocr/tesseract.esm.min.js');
  const worker = await Tesseract.createWorker(langs, 1, {
    workerPath: `${BASE}worker.min.js`,
    corePath: BASE,
    langPath: BASE,
    gzip: true,
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (m) => { if (m.status === 'recognizing text') onProgress(m.progress); },
  });
  try {
    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
