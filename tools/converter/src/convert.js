// Conversion paths. Everything is local; nothing is uploaded.
//
// convertText/convertDocx/convertPdf return { outputs: [{ name, data, mime }], notes: [{ key, params }] }.
import { kindOf, stemOf, MIME } from './formats.js';
import { isEmpty } from './blocks.js';
import { readText, readMarkdown } from './text-in.js';
import { readDocx } from './docx-in.js';
import { readPdf, renderPdf } from './pdf-in.js';
import { toText, toMarkdown, toHtml } from './text-out.js';
import { toDocx } from './docx-out.js';
import { textToPdf, imagesToPdf } from './pdf-out.js';
import { loadImage, encodeImage, imageForPdf } from './images.js';

const out = (name, data, target) => ({ name, data, mime: MIME[target] });

/** Document blocks -> target file. */
export async function writeBlocks(blocks, target, stem, { lang = 'en' } = {}) {
  const notes = [];
  let data;
  if (target === 'txt') data = new TextEncoder().encode(toText(blocks));
  else if (target === 'md') data = new TextEncoder().encode(toMarkdown(blocks));
  else if (target === 'html') data = new TextEncoder().encode(toHtml(blocks, stem));
  else if (target === 'docx') data = await toDocx(blocks, { lang: lang === 'de' ? 'de-CH' : 'en-US' });
  else if (target === 'pdf') {
    const r = await textToPdf(blocks);
    data = r.bytes;
    if (r.lost) notes.push({ key: 'note.pdfChars', params: { n: r.lost } });
  } else throw new Error('target');
  return { outputs: [out(`${stem}.${target}`, data, target)], notes };
}

export async function readBlocks(file, kind) {
  if (kind === 'text') return { blocks: readText(await file.text()), notes: [] };
  if (kind === 'markdown') return { blocks: readMarkdown(await file.text()), notes: [] };
  if (kind === 'docx') return { blocks: await readDocx(await file.arrayBuffer()), notes: [] };
  if (kind === 'pdf') {
    const { blocks } = await readPdf(await file.arrayBuffer());
    return { blocks, notes: isEmpty(blocks) ? [{ key: 'note.pdfScan', params: {} }] : [] };
  }
  throw new Error('kind');
}

/** One file to one target. Pictures and PDF pages are handled here as well. Several outputs are possible (PDF pages). */
export async function convertFile(file, kind, target, opts = {}) {
  const stem = stemOf(file.name);
  if (kind === 'image') {
    const img = await loadImage(file);
    if (target === 'pdf') {
      const bytes = await imagesToPdf([imageForPdf(img, file, opts.quality)], opts.pageMode);
      return { outputs: [out(`${stem}.pdf`, bytes, 'pdf')], notes: [] };
    }
    const blob = await encodeImage(img, target, opts.quality);
    return { outputs: [out(`${stem}.${target}`, blob, target)], notes: [] };
  }
  if (kind === 'pdf' && (target === 'png' || target === 'jpg')) {
    const blobs = await renderPdf(await file.arrayBuffer(), { mime: MIME[target], scale: opts.scale ?? 2, quality: opts.quality, onPage: opts.onPage });
    const pad = String(blobs.length).length;
    return { outputs: blobs.map((b, i) => out(blobs.length === 1 ? `${stem}.${target}` : `${stem}-${String(i + 1).padStart(pad, '0')}.${target}`, b, target)), notes: [] };
  }
  const { blocks, notes } = await readBlocks(file, kind);
  if (isEmpty(blocks) && kind !== 'pdf') notes.push({ key: 'note.empty', params: {} });
  const written = await writeBlocks(blocks, target, stem, opts);
  return { outputs: written.outputs, notes: [...notes, ...written.notes] };
}

/** Several pictures into one PDF. */
export async function imagesToOnePdf(files, opts = {}) {
  const pages = [];
  for (const f of files) pages.push(imageForPdf(await loadImage(f), f, opts.quality));
  const bytes = await imagesToPdf(pages, opts.pageMode);
  return { outputs: [out(`${stemOf(files[0].name)}-${files.length}.pdf`, bytes, 'pdf')], notes: [] };
}

export { kindOf };
