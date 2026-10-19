import { analyze, fileName, MAX_BYTES } from './content.js';
import { FORMATS, renderBlob } from './qr.js';

export const MAX_BATCH = 200;

/** Liest die erste Spalte jeder Zeile (Komma, Semikolon oder Tab; Anführungszeichen erlaubt). */
export function parseCsv(text) {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (t.startsWith('"')) return t.match(/^"((?:[^"]|"")*)"/)?.[1].replace(/""/g, '"').trim() ?? '';
    return t.split(/[,;\t]/)[0].trim();
  }).filter(Boolean);
  if (rows.length && /^(text|url|link|inhalt|daten|adresse)$/i.test(rows[0])) rows.shift();
  return rows;
}

/**
 * Erzeugt aus der CSV ein ZIP mit einem Code pro Zeile.
 * Gibt { blob, count, skipped } zurück.
 */
export async function buildZip(csvText, format, style) {
  const rows = parseCsv(csvText);
  const { default: JSZip } = await import('../vendor/jszip.js');
  const zip = new JSZip();
  const used = new Map();
  let count = 0;
  let skipped = Math.max(0, rows.length - MAX_BATCH);
  for (const row of rows.slice(0, MAX_BATCH)) {
    const info = analyze(row);
    if (info.bytes > MAX_BYTES) { skipped++; continue; }
    const base = fileName(info);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const name = n === 1 ? base : `${base}-${n}`;
    zip.file(`${name}.${FORMATS[format].ext}`, await renderBlob(info.data, format, style));
    count++;
  }
  if (!count) throw new Error('empty');
  return { blob: await zip.generateAsync({ type: 'blob' }), count, skipped };
}
