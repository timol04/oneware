// Logo-Form: Die Punkte des QR-Codes bilden die Form des Logos, in der Logo-Farbe.
// Innerhalb der Form liegt das (abgedunkelte) Logo als Hintergrund, dunkle Module sind
// schwarze, helle Module weisse Punkte. Ausserhalb bleibt der Code schwarz auf Weiss.
import { qrcode } from '../vendor/qrcode-generator.js';

const imageCache = new Map();
function loadImage(url) {
  if (!imageCache.has(url)) {
    imageCache.set(url, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    }));
  }
  return imageCache.get(url);
}

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const QUIET = 3; // Ruhezone in Modulen
const FINDER = 7;
const DOT_OUT = 0.42; // Punkte ausserhalb der Form (Modul-Anteil)

const lerp = (a, b, t) => a + (b - a) * t;

/** Logo-Stärke 0 (sicher scanbar) bis 1 (kräftiges, grosses Logo) in konkrete Werte übersetzen. */
export function tuningFor(strength = 0.5) {
  const t = Math.min(1, Math.max(0, strength));
  return {
    bg: lerp(0.7, 1, t), // Helligkeit des Logo-Hintergrunds (1 = Originalfarben)
    darkLum: lerp(0.05, 0.2, t), // Helligkeit der dunklen Punkte (Logo-Farbe, abgedunkelt)
    lightMix: lerp(0.94, 0.75, t), // Anteil Weiss in den hellen Punkten
    r: lerp(0.5, 0.42, t), // Punktgrösse innerhalb der Form
    fill: lerp(0.78, 1, t), // Anteil der Codefläche, den das Logo ausfüllen darf
  };
}

const darkened = ([r, g, b], target) => {
  const f = Math.min(1, target / Math.max(lum(r, g, b), 0.001));
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
};
const lightened = ([r, g, b], mix) =>
  `rgb(${Math.round(r + (255 - r) * mix)},${Math.round(g + (255 - g) * mix)},${Math.round(b + (255 - b) * mix)})`;

function buildMatrix(data) {
  // UTF-8-Bytes als Latin-1-Zeichenkette, damit auch Umlaute korrekt kodiert werden
  const bin = String.fromCharCode(...new TextEncoder().encode(data));
  for (const level of ['Q', 'M', 'L']) {
    try {
      const qr = qrcode(0, level);
      qr.addData(bin, 'Byte');
      qr.make();
      return qr;
    } catch { /* zu viele Daten für diese Stufe, nächste versuchen */ }
  }
  throw new Error('too long');
}

/** Zeichnet den Code mit Logo-Form auf ein Quadrat der Kantenlänge size. */
export async function shapeCodeCanvas(data, size, logoUrl, darkColor = '#000000', strength = 0.5, dotStyle = 'rounded') {
  const tuning = tuningFor(strength);
  const img = await loadImage(logoUrl);
  const qr = buildMatrix(data);
  const n = qr.getModuleCount();
  const m = size / (n + 2 * QUIET);
  const origin = QUIET * m;
  const area = n * m;

  // Logo vorbereiten: weisse und fast weisse Pixel (auch Kompressionsränder bei JPG) freistellen,
  // auf den sichtbaren Bereich zuschneiden und so gross wie möglich einpassen
  const wscale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
  const ww = Math.max(1, Math.round(img.naturalWidth * wscale));
  const wh = Math.max(1, Math.round(img.naturalHeight * wscale));
  const work = document.createElement('canvas');
  work.width = ww;
  work.height = wh;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  wctx.drawImage(img, 0, 0, ww, wh);
  const px = wctx.getImageData(0, 0, ww, wh);
  const edge = Math.max(3, Math.round(Math.max(ww, wh) * 0.006)); // dünne Ränder im Bild ignorieren
  const cols = new Uint32Array(ww);
  const rows = new Uint32Array(wh);
  for (let y = 0; y < wh; y++) {
    for (let x = 0; x < ww; x++) {
      const i = (y * ww + x) * 4;
      const l = lum(px.data[i], px.data[i + 1], px.data[i + 2]);
      if (l > 0.93 || x < edge || y < edge || x >= ww - edge || y >= wh - edge) px.data[i + 3] = 0;
      else if (l > 0.86) px.data[i + 3] *= (0.93 - l) / 0.07;
      if (px.data[i + 3] > 40) {
        cols[x]++;
        rows[y]++;
      }
    }
  }
  // Sichtbarer Bereich: Zeilen und Spalten mit genug Bildpunkten (einzelne Ausreisser zählen nicht)
  const minCount = Math.max(3, Math.round(Math.max(ww, wh) * 0.004));
  const first = (arr) => arr.findIndex((v) => v >= minCount);
  const last = (arr) => arr.length - 1 - [...arr].reverse().findIndex((v) => v >= minCount);
  let x0 = first(cols), x1 = last(cols), y0 = first(rows), y1 = last(rows);
  if (x0 < 0 || y0 < 0 || x1 < x0 || y1 < y0) { x0 = 0; y0 = 0; x1 = ww - 1; y1 = wh - 1; }
  wctx.putImageData(px, 0, 0);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const scale = Math.min(area / bw, area / bh) * tuning.fill;
  const lw = Math.max(1, Math.round(bw * scale));
  const lh = Math.max(1, Math.round(bh * scale));
  const lx = origin + (area - lw) / 2;
  const ly = origin + (area - lh) / 2;
  const logo = document.createElement('canvas');
  logo.width = lw;
  logo.height = lh;
  logo.getContext('2d').drawImage(work, x0, y0, bw, bh, 0, 0, lw, lh);

  // Pro Modul: liegt es in der Logo-Form? Dazu Durchschnittsfarbe für die Eck-Markierungen.
  const mask = document.createElement('canvas');
  mask.width = n;
  mask.height = n;
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  mctx.drawImage(logo, (lx - origin) / m, (ly - origin) / m, lw / m, lh / m);
  const md = mctx.getImageData(0, 0, n, n).data;
  const inside = (r, c) => md[(r * n + c) * 4 + 3] > 140;
  let sr = 0, sg = 0, sb = 0, count = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!inside(r, c)) continue;
    const i = (r * n + c) * 4;
    sr += md[i]; sg += md[i + 1]; sb += md[i + 2]; count++;
  }
  let accent = [0, 0, 0];
  if (count) {
    accent = [sr / count, sg / count, sb / count];
    const f = Math.min(1, 0.32 / Math.max(lum(...accent), 0.001));
    accent = accent.map((v) => v * f);
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.filter = `brightness(${tuning.bg})`;
  ctx.drawImage(logo, lx, ly, lw, lh);
  ctx.restore();

  const inFinder = (r, c) =>
    (r < FINDER + 1 && c < FINDER + 1) || (r < FINDER + 1 && c >= n - FINDER - 1) || (r >= n - FINDER - 1 && c < FINDER + 1);
  // Punktform folgt der gewählten Gestaltung: dots = Kreis, rounded = weiches Quadrat, classy = stärker gerundet, square = Quadrat
  const dot = (r, c, radius, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    const cx = origin + (c + 0.5) * m;
    const cy = origin + (r + 0.5) * m;
    const half = radius * m;
    if (dotStyle === 'dots') ctx.arc(cx, cy, half, 0, Math.PI * 2);
    else if (dotStyle === 'square') ctx.rect(cx - half, cy - half, 2 * half, 2 * half);
    else ctx.roundRect(cx - half, cy - half, 2 * half, 2 * half, half * (dotStyle === 'classy' ? 0.85 : 0.5));
    ctx.fill();
  };
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (inFinder(r, c)) continue;
      if (!inside(r, c)) {
        if (qr.isDark(r, c)) dot(r, c, DOT_OUT, darkColor);
        continue;
      }
      // In der Form tragen die Punkte die Farbe des Logos: dunkel für dunkle, hell für helle Module
      const i = (r * n + c) * 4;
      const col = [md[i], md[i + 1], md[i + 2]];
      dot(r, c, tuning.r, qr.isDark(r, c) ? darkened(col, tuning.darkLum) : lightened(col, tuning.lightMix));
    }
  }

  // Eck-Markierungen samt weissem Rand freihalten, das Logo darf nicht hineinragen
  ctx.fillStyle = '#ffffff';
  const pad = (FINDER + 1) * m;
  ctx.fillRect(origin - m, origin - m, pad + m, pad + m);
  ctx.fillRect(origin + area - pad, origin - m, pad + m, pad + m);
  ctx.fillRect(origin - m, origin + area - pad, pad + m, pad + m);

  // Eck-Markierungen: schwarzer Ring, weisser Rand, Mitte in der Logo-Farbe
  const eye = (r0, c0) => {
    const x = origin + c0 * m;
    const y = origin + r0 * m;
    ctx.fillStyle = darkColor;
    ctx.fillRect(x, y, FINDER * m, FINDER * m);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + m, y + m, (FINDER - 2) * m, (FINDER - 2) * m);
    ctx.fillStyle = `rgb(${accent.map(Math.round).join(',')})`;
    ctx.fillRect(x + 2 * m, y + 2 * m, (FINDER - 4) * m, (FINDER - 4) * m);
  };
  eye(0, 0);
  eye(0, n - FINDER);
  eye(n - FINDER, 0);
  return canvas;
}
