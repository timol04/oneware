import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readGuideline, extractRules } from '../src/guideline.js';

// A minimal one-page PDF with a text layer (standard Helvetica font, no embedded data).
function makePdf(lines) {
  const content = `BT /F1 12 Tf 72 760 Td 16 TL ${lines.map((l) => `(${l.replace(/[()\\]/g, '\\$&')}) '`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n'; const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

test('reads the text layer of a PDF and finds the values', async () => {
  const lines = await readGuideline('richtlinie.pdf', makePdf(['Schrift: Arial 11 pt', 'Zeilenabstand 1.5', 'Rand: 2.5 cm']));
  assert.deepEqual(lines, ['Schrift: Arial 11 pt', 'Zeilenabstand 1.5', 'Rand: 2.5 cm']);
  const f = extractRules(lines);
  assert.equal(f.font[0].value, 'Arial');
  assert.equal(f.size[0].value, 11);
  assert.equal(f.lineSpacing[0].value, 1.5);
  assert.equal(f.left[0].value, 2.5);
});
