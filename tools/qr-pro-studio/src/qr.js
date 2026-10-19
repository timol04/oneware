import QRCodeStyling from '../vendor/qr-code-styling.js';
import { QR_SIZE, QR_SIZE_LARGE } from './config.js';
import { shapeCodeCanvas } from './logoshape.js';
import { composeBlob, composeCanvas, composeSvg, geometry } from './sticker.js';

export const FORMATS = {
  png: { label: 'PNG', ext: 'png', size: QR_SIZE, caption: `${QR_SIZE} px breit · PNG` },
  'png-large': { label: 'PNG gross', ext: 'png', size: QR_SIZE_LARGE, caption: `${QR_SIZE_LARGE} px breit · PNG` },
  svg: { ext: 'svg', size: QR_SIZE },
  pdf: { ext: 'pdf', size: QR_SIZE_LARGE },
  sheet: { ext: 'pdf', size: 800 },
};

/** Punktformen: Form der Module und passend dazu die Form der drei Eck-Markierungen. */
export const DOT_STYLES = {
  rounded: { dots: 'rounded', eye: 'square', eyeDot: 'dot' },
  dots: { dots: 'dots', eye: 'square', eyeDot: 'dot' },
  classy: { dots: 'classy-rounded', eye: 'square', eyeDot: 'dot' },
  square: { dots: 'square', eye: 'square', eyeDot: 'square' },
};

/** Optionen für qr-code-styling: Farbe der Module und optionales Logo (Data-URL). */
function options({ data, size, color = '#000000', logo = null, dots = 'rounded' }) {
  const d = DOT_STYLES[dots] ?? DOT_STYLES.rounded;
  // color: ein Hex-Wert oder [von, bis] für einen Verlauf über den ganzen Code
  const paint = Array.isArray(color)
    ? { gradient: { type: 'linear', rotation: Math.PI / 4, colorStops: [{ offset: 0, color: color[0] }, { offset: 1, color: color[1] }] } }
    : { color };
  return {
    width: size,
    height: size,
    margin: Math.round(size * 0.027),
    data,
    // Mit Logo in der Mitte braucht der Code mehr Fehlerkorrektur, damit er scanbar bleibt.
    qrOptions: { errorCorrectionLevel: logo ? 'H' : 'M' },
    dotsOptions: { ...paint, type: d.dots },
    cornersSquareOptions: { ...paint, type: d.eye },
    cornersDotOptions: { ...paint, type: d.eyeDot },
    backgroundOptions: { color: '#ffffff' },
    image: logo || undefined,
    imageOptions: { hideBackgroundDots: true, imageSize: 0.26, margin: Math.round(size * 0.01), crossOrigin: 'anonymous' },
  };
}

/** Nur der QR-Code (ohne Sticker) als Blob. */
export async function codeBlob(data, size, style = {}, type = 'png') {
  if (style.logo && style.logoMode === 'shape') {
    const dark = Array.isArray(style.color) ? style.color[0] : style.color;
    const canvas = await shapeCodeCanvas(data, size, style.logo, dark, style.logoStrength, style.dots);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (type !== 'svg') return png;
    // Logo-Form ist ein Pixelbild; für SVG wird es eingebettet
    const url = await blobToDataUrl(png);
    return new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><image href="${url}" width="${size}" height="${size}"/></svg>`], { type: 'image/svg+xml' });
  }
  return new QRCodeStyling(options({ data, size, color: style.color, logo: style.logo, dots: style.dots })).getRawData(type);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

const A4 = { w: 210, h: 297, margin: 10, gap: 5 };

/** Wie viele Sticker passen auf den A4-Bogen? */
export function sheetInfo(mm, style = {}) {
  const g = geometry(style.shape, style.label);
  const h = mm * g.h;
  const cols = Math.max(1, Math.floor((A4.w - 2 * A4.margin + A4.gap) / (mm + A4.gap)));
  const rows = Math.max(1, Math.floor((A4.h - 2 * A4.margin + A4.gap) / (h + A4.gap)));
  return { cols, rows, count: cols * rows, h, g };
}

/** Vorschau der A4-Seite für PDF und Stickerbogen (gleiche Anordnung wie im Export). */
export function pagePreview(stickerCanvas, format, style = {}) {
  const k = 4; // Pixel pro mm
  const c = document.createElement('canvas');
  c.width = A4.w * k;
  c.height = A4.h * k;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  const g = geometry(style.shape, style.label);
  if (format === 'pdf') {
    ctx.drawImage(stickerCanvas, 45 * k, 40 * k, 120 * k, 120 * g.h * k);
  } else {
    const mm = style.sheetMm ?? 40;
    const { cols, rows, h } = sheetInfo(mm, style);
    const x0 = (A4.w - (cols * mm + (cols - 1) * A4.gap)) / 2;
    const y0 = (A4.h - (rows * h + (rows - 1) * A4.gap)) / 2;
    ctx.strokeStyle = '#969696';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = (x0 + col * (mm + A4.gap)) * k;
        const y = (y0 + r * (h + A4.gap)) * k;
        ctx.drawImage(stickerCanvas, x, y, mm * k, h * k);
        ctx.beginPath();
        if (g.circle) ctx.arc(x + (mm * k) / 2, y + (h * k) / 2, (mm * k) / 2, 0, Math.PI * 2);
        else ctx.roundRect(x, y, mm * k, h * k, g.radius * mm * k);
        ctx.stroke();
      }
    }
  }
  return c;
}

async function sheetPdf(data, style) {
  const { jsPDF } = await import('../vendor/jspdf.js');
  const mm = style.sheetMm ?? 40;
  const { cols, rows, h, g } = sheetInfo(mm, style);
  const png = (await composeCanvas(data, 800, style)).toDataURL('image/png');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const gridW = cols * mm + (cols - 1) * A4.gap;
  const gridH = rows * h + (rows - 1) * A4.gap;
  const x0 = (A4.w - gridW) / 2;
  const y0 = (A4.h - gridH) / 2;
  pdf.setDrawColor(150);
  pdf.setLineWidth(0.15);
  pdf.setLineDashPattern([1, 1], 0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (mm + A4.gap);
      const y = y0 + r * (h + A4.gap);
      pdf.addImage(png, 'PNG', x, y, mm, h, 'sticker');
      // Schnittlinie genau am Rand des Stickers
      if (g.circle) pdf.circle(x + mm / 2, y + h / 2, mm / 2, 'S');
      else pdf.roundedRect(x, y, mm, h, g.radius * mm, g.radius * mm, 'S');
    }
  }
  return pdf.output('blob');
}

/** Erzeugt die Datei (Blob) für einen Inhalt im gewählten Format. */
export async function renderBlob(data, format, style = {}) {
  if (format === 'sheet') return sheetPdf(data, style);
  const { size } = FORMATS[format];
  if (format === 'svg') return composeSvg(data, size, style);
  const png = await composeBlob(data, size, style);
  if (format !== 'pdf') return png;
  const { jsPDF } = await import('../vendor/jspdf.js');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const g = geometry(style.shape, style.label);
  pdf.addImage(await blobToDataUrl(png), 'PNG', 45, 40, 120, 120 * g.h);
  return pdf.output('blob');
}

/** Speichert einen Blob als Datei im Browser. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
