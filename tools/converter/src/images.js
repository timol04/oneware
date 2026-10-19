// Pictures through a canvas (browser only).
import { MIME } from './formats.js';

const MAX_PIXELS = 100e6; // above this a canvas fails on most phones

export async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('image')); img.src = url; });
    if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > MAX_PIXELS) throw new Error('image');
    return img;
  } finally {
    // The decoded image stays usable after the URL is released.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function draw(img, { flatten }) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (flatten) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** target: png | jpg | webp. JPEG has no transparency, so it is drawn on white. */
export async function encodeImage(img, target, quality = 0.92) {
  const canvas = draw(img, { flatten: target === 'jpg' });
  const blob = await new Promise((res) => canvas.toBlob(res, MIME[target].split(';')[0], quality));
  canvas.width = canvas.height = 0;
  // Some browsers cannot encode WebP and silently return PNG.
  if (!blob || blob.type !== MIME[target]) throw new Error('encode');
  return blob;
}

/** Data URL for the PDF writer; JPEG stays JPEG, everything else becomes PNG. */
export function imageForPdf(img, file, quality = 0.92) {
  const jpeg = /jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name);
  const canvas = draw(img, { flatten: jpeg });
  const out = { data: canvas.toDataURL(jpeg ? 'image/jpeg' : 'image/png', quality), format: jpeg ? 'JPEG' : 'PNG', width: canvas.width, height: canvas.height };
  canvas.width = canvas.height = 0;
  return out;
}
