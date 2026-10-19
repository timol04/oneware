// PDF editing with pdf-lib (bundled in vendor/): merge, reorder, rotate, delete, split, repack.
// Pure functions on bytes; the browser-only parts (page pictures) live in raster.js and thumbs.js.
import { PDFDocument, EncryptedPDFError, degrees } from '../vendor/pdf-lib.js';

const PRODUCER = 'Oneware PDF Toolkit';

function stamp(doc) {
  doc.setProducer(PRODUCER);
  doc.setCreator(PRODUCER);
  doc.setModificationDate(new Date());
}

/** Loads a PDF. Throws Error('encrypted') for password-protected files and Error('invalid') for anything else. */
export async function loadPdf(bytes) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    throw new Error(e instanceof EncryptedPDFError || /encrypt/i.test(e?.message ?? '') ? 'encrypted' : 'invalid');
  }
}

export async function pageCount(bytes) {
  return (await loadPdf(bytes)).getPageCount();
}

/**
 * Builds a new PDF from pages of one or more source PDFs, in the given order.
 * @param {Uint8Array[]} sources
 * @param {{ src: number, index: number, rotate?: number }[]} pages  rotate = extra degrees clockwise (multiple of 90)
 * @returns {Promise<Uint8Array>}
 */
export async function buildPdf(sources, pages) {
  if (!pages.length) throw new Error('empty');
  const docs = new Map();
  for (const p of pages) if (!docs.has(p.src)) docs.set(p.src, await loadPdf(sources[p.src]));
  const out = await PDFDocument.create();
  // Copy per source in one call so shared fonts and images are stored once.
  const copied = new Map();
  for (const [src, doc] of docs) {
    const used = [...new Set(pages.filter((p) => p.src === src).map((p) => p.index))];
    const got = await out.copyPages(doc, used);
    used.forEach((index, i) => copied.set(`${src}:${index}`, got[i]));
  }
  for (const p of pages) {
    const page = copied.get(`${p.src}:${p.index}`);
    const extra = (((p.rotate ?? 0) % 360) + 360) % 360;
    if (extra) page.setRotation(degrees((page.getRotation().angle + extra) % 360));
    out.addPage(page);
  }
  stamp(out);
  return out.save({ useObjectStreams: true });
}

/**
 * Parses "1-3, 5, 7-" into groups of 0-based page indices. Pages are numbered from 1.
 * @returns {number[][]} one group per comma-separated part
 * @throws {Error} message 'range' with `.token` set to the offending part
 */
export function parseRanges(text, total) {
  const parts = String(text).split(/[,;\s]+/).filter(Boolean);
  if (!parts.length) throw Object.assign(new Error('range'), { token: '' });
  return parts.map((token) => {
    const m = /^(\d+)(?:-(\d*))?$/.exec(token);
    if (!m) throw Object.assign(new Error('range'), { token });
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : m[2] === '' ? total : Number(m[2]);
    if (from < 1 || to > total || from > to) throw Object.assign(new Error('range'), { token });
    return Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
  });
}

/** Splits the pages 0..total-1 into consecutive groups of n. */
export function everyN(total, n) {
  const size = Math.max(1, Math.floor(n));
  const groups = [];
  for (let i = 0; i < total; i += size) groups.push(Array.from({ length: Math.min(size, total - i) }, (_, k) => i + k));
  return groups;
}

/** Re-saves a PDF without unused objects and with compressed object streams. Pictures are not touched. */
export async function repack(bytes) {
  const doc = await loadPdf(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(doc, doc.getPageIndices());
  pages.forEach((p) => out.addPage(p));
  const info = { title: doc.getTitle(), author: doc.getAuthor(), subject: doc.getSubject() };
  if (info.title) out.setTitle(info.title);
  if (info.author) out.setAuthor(info.author);
  if (info.subject) out.setSubject(info.subject);
  stamp(out);
  return out.save({ useObjectStreams: true });
}

/**
 * Builds a PDF from page pictures (JPEG bytes). Page size in PDF points.
 * @param {{ jpeg: Uint8Array, width: number, height: number }[]} pictures
 */
export async function picturesToPdf(pictures) {
  const out = await PDFDocument.create();
  for (const pic of pictures) {
    const image = await out.embedJpg(pic.jpeg);
    const page = out.addPage([pic.width, pic.height]);
    page.drawImage(image, { x: 0, y: 0, width: pic.width, height: pic.height });
  }
  stamp(out);
  return out.save({ useObjectStreams: true });
}
