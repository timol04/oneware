// Sticker-Studio: setzt den QR-Code auf einen Sticker (Form, Beschriftung) und prüft, ob er scanbar ist.
import { codeBlob } from './qr.js';

const FONT = '"Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif';

export const SHAPES = {
  square: { label: 'Quadrat' },
  rounded: { label: 'Abgerundet' },
  round: { label: 'Rund' },
};

/** Aufbau des Stickers in Einheiten der Breite 1 (Höhe = h). */
export function geometry(shape = 'square', label = '') {
  const hasLabel = !!label;
  if (shape === 'round') {
    const s = hasLabel ? 0.54 : 0.64;
    return {
      h: 1, radius: 0.5, circle: true,
      code: { x: (1 - s) / 2, y: hasLabel ? 0.13 : (1 - s) / 2, s },
      label: hasLabel ? { cy: 0.81, fs: 0.085, maxW: 0.58 } : null,
    };
  }
  const pad = shape === 'rounded' ? 0.07 : 0.06;
  const s = 1 - 2 * pad;
  const band = hasLabel ? 0.2 : 0;
  return {
    h: 1 + band, radius: shape === 'rounded' ? 0.14 : 0.03, circle: false,
    code: { x: pad, y: pad, s },
    label: hasLabel ? { cy: pad + s + (band + pad * 0.4) / 2, fs: 0.085, maxW: 1 - 2 * pad } : null,
  };
}

async function loadFont() {
  try { await document.fonts.load(`700 40px "Bricolage Grotesque"`); } catch { /* Schrift nicht verfügbar */ }
}

/** Zeichnet den Sticker auf ein Canvas der Breite w. */
export async function composeCanvas(data, w, style = {}) {
  const { shape = 'square', label = '', color = '#000000' } = style;
  const g = geometry(shape, label);
  const h = Math.round(g.h * w);
  const code = await createImageBitmap(await codeBlob(data, Math.round(g.code.s * w), style));
  if (label) await loadFont();

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  if (g.circle) ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  else ctx.roundRect(0, 0, w, h, g.radius * w);
  ctx.fill();
  ctx.drawImage(code, g.code.x * w, g.code.y * w, g.code.s * w, g.code.s * w);
  code.close?.();

  if (g.label) {
    let fs = g.label.fs * w;
    ctx.font = `700 ${fs}px ${FONT}`;
    const maxW = g.label.maxW * w;
    const measured = ctx.measureText(label).width;
    if (measured > maxW) { fs *= maxW / measured; ctx.font = `700 ${fs}px ${FONT}`; }
    ctx.fillStyle = Array.isArray(color) ? color[0] : color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, g.label.cy * w);
  }
  return canvas;
}

export async function composeBlob(data, w, style) {
  const canvas = await composeCanvas(data, w, style);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Sticker als SVG (Code als verschachteltes SVG, Beschriftung als Text). */
export async function composeSvg(data, w, style = {}) {
  const { shape = 'square', label = '', color = '#000000' } = style;
  const g = geometry(shape, label);
  const h = g.h * w;
  const inner = new DOMParser().parseFromString(await (await codeBlob(data, Math.round(g.code.s * w), style, 'svg')).text(), 'image/svg+xml').documentElement;
  const vw = inner.getAttribute('width');
  const vh = inner.getAttribute('height');
  if (!inner.getAttribute('viewBox')) inner.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  inner.setAttribute('x', g.code.x * w);
  inner.setAttribute('y', g.code.y * w);
  inner.setAttribute('width', g.code.s * w);
  inner.setAttribute('height', g.code.s * w);
  const bg = g.circle
    ? `<circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}" fill="#fff"/>`
    : `<rect width="${w}" height="${h}" rx="${g.radius * w}" fill="#fff"/>`;
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const text = g.label
    ? `<text x="${w / 2}" y="${g.label.cy * w}" text-anchor="middle" dominant-baseline="central" font-family="Bricolage Grotesque, Arial, sans-serif" font-weight="700" font-size="${g.label.fs * w}" fill="${Array.isArray(color) ? color[0] : color}" textLength="${Math.min(label.length * g.label.fs * w * 0.55, g.label.maxW * w)}" lengthAdjust="spacingAndGlyphs">${esc(label)}</text>`
    : '';
  const svg = `<?xml version="1.0" standalone="no"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg}${new XMLSerializer().serializeToString(inner)}${text}</svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

/**
 * Scan-Test: liest den Sticker mit einem echten QR-Decoder, auch stark verkleinert
 * (wie aus grösserer Distanz). Gibt 'robust', 'gut', 'knapp' oder 'fail' zurück.
 */
export async function scanTest(source, expected) {
  const jsQR = (await import('../vendor/jsqr.js')).default;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const tryAt = (w) => {
    const h = Math.round((source.height * w) / source.width);
    c.width = w;
    c.height = h;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    return jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' })?.data === expected;
  };
  if (tryAt(110)) return 'robust';
  if (tryAt(180)) return 'gut';
  if (tryAt(source.width)) return 'knapp';
  return 'fail';
}

