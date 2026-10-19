// PDF writers: a text document (A4, built-in Helvetica) and a picture book (one image per page).
//
// The built-in PDF fonts only cover Western European characters. Everything else is replaced by "?" and
// counted, so the caller can tell the user.

const REPLACEMENTS = { '‘': "'", '’': "'", '‚': ',', '“': '"', '”': '"', '„': '"', '–': '-', '—': '-', '…': '...', '•': '-', '€': 'EUR', ' ': ' ', '−': '-', '\t': '    ' };
const TABLE_GAP = 2;

export function toLatin(text) {
  let lost = 0;
  const out = text.replace(/[^\n\x20-\x7E\xA1-\xFF]/gu, (ch) => {
    if (ch in REPLACEMENTS) return REPLACEMENTS[ch];
    lost++;
    return '?';
  });
  return { text: out, lost };
}

const SIZES = { 1: 20, 2: 15, 3: 12.5 };

/** @returns {{ bytes: Uint8Array, pages: number, lost: number }} */
export async function textToPdf(blocks) {
  const { jsPDF } = await import('../vendor/jspdf.js');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = 210, H = 297, M = 22;
  const width = W - 2 * M;
  let lost = 0;
  let y = M;
  let pages = 1;

  const setFont = (bold, italic, size) => {
    doc.setFont('helvetica', bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal');
    doc.setFontSize(size);
  };
  const lineHeight = (size) => size * 0.3528 * 1.4;
  const need = (h) => {
    if (y + h > H - M) { doc.addPage(); pages++; y = M; }
  };

  /** Lays out styled words across lines of the given width, starting at x. */
  const writeRuns = (runs, size, { x = M, maxWidth = width, forceBold = false, bullet = '' } = {}) => {
    const lh = lineHeight(size);
    const words = [];
    for (const r of runs) {
      const t = toLatin(r.t);
      lost += t.lost;
      for (const part of t.text.split(/(\n|\s+)/)) {
        if (part === '') continue;
        words.push(part === '\n' ? { br: true } : { w: part.trim() === '' ? ' ' : part, b: forceBold || !!r.b, i: !!r.i });
      }
    }
    let line = [];
    let used = 0;
    const flush = (first) => {
      if (!line.length) return;
      need(lh);
      let cx = x;
      if (first && bullet) {
        setFont(false, false, size);
        doc.text(bullet, x - 6, y + lh * 0.72);
      }
      for (const p of line) {
        setFont(p.b, p.i, size);
        if (p.w.trim()) doc.text(p.w, cx, y + lh * 0.72);
        cx += p.width;
      }
      y += lh;
      line = [];
      used = 0;
    };
    let first = true;
    for (const word of words) {
      if (word.br) {
        if (line.length) flush(first); else { need(lh); y += lh; }
        first = false;
        continue;
      }
      setFont(word.b, word.i, size);
      let piece = word.w;
      let pw = doc.getTextWidth(piece);
      if (piece === ' ') {
        if (used === 0) continue;
        line.push({ ...word, width: pw });
        used += pw;
        continue;
      }
      if (used + pw > maxWidth && used > 0) {
        while (line.length && line[line.length - 1].w === ' ') line.pop();
        flush(first);
        first = false;
      }
      // A single word wider than the line is broken by characters.
      while (pw > maxWidth) {
        let n = piece.length;
        while (n > 1 && doc.getTextWidth(piece.slice(0, n)) > maxWidth) n--;
        line.push({ ...word, w: piece.slice(0, n), width: doc.getTextWidth(piece.slice(0, n)) });
        flush(first);
        first = false;
        piece = piece.slice(n);
        pw = doc.getTextWidth(piece);
      }
      line.push({ ...word, w: piece, width: pw });
      used += pw;
    }
    flush(first);
  };

  let number = 0;
  for (const [i, b] of blocks.entries()) {
    if (b.type === 'heading') {
      const size = SIZES[b.level];
      need(lineHeight(size) * 2);
      y += b.level === 1 ? 4 : 3;
      writeRuns(b.runs, size, { forceBold: true });
      y += 1.5;
    } else if (b.type === 'item') {
      number = b.ordered ? (blocks[i - 1]?.type === 'item' && blocks[i - 1].ordered ? number + 1 : 1) : 0;
      writeRuns(b.runs, 11, { x: M + 8, maxWidth: width - 8, bullet: b.ordered ? `${number}.` : '-' });
      y += blocks[i + 1]?.type === 'item' ? 0.8 : 2.5;
    } else if (b.type === 'table') {
      const cols = Math.max(...b.rows.map((r) => r.length));
      const colW = (width - TABLE_GAP * (cols - 1)) / cols;
      b.rows.forEach((row, k) => {
        let endY = y;
        need(lineHeight(10) * 2);
        const top = y;
        row.forEach((cell, c) => {
          y = top;
          writeRuns([{ t: cell }], 10, { x: M + c * (colW + TABLE_GAP), maxWidth: colW, forceBold: k === 0 });
          endY = Math.max(endY, y);
        });
        y = endY + 1.2;
        doc.setDrawColor(200);
        doc.line(M, y - 0.4, W - M, y - 0.4);
      });
      y += 3;
    } else {
      writeRuns(b.runs, 11);
      y += 2.8;
    }
  }
  return { bytes: new Uint8Array(doc.output('arraybuffer')), pages, lost };
}

/**
 * One page per image. mode "fit": the page has the size of the picture; "a4": picture centred on A4.
 * @param {{ data: string, format: 'JPEG'|'PNG', width: number, height: number }[]} images data-URL images
 */
export async function imagesToPdf(images, mode = 'fit') {
  const { jsPDF } = await import('../vendor/jspdf.js');
  let doc;
  images.forEach((img, i) => {
    const landscape = img.width > img.height;
    if (mode === 'a4') {
      if (i === 0) doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'l' : 'p', compress: true });
      else doc.addPage('a4', landscape ? 'l' : 'p');
      const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      const m = 10;
      const s = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
      const w = img.width * s, h = img.height * s;
      doc.addImage(img.data, img.format, (pw - w) / 2, (ph - h) / 2, w, h);
    } else {
      // 1 px = 0.2646 mm (96 dpi), capped so that huge photos do not give a metre-wide page.
      const k = Math.min(0.2646, 420 / Math.max(img.width, img.height));
      const w = img.width * k, h = img.height * k;
      if (i === 0) doc = new jsPDF({ unit: 'mm', format: [w, h], orientation: landscape ? 'l' : 'p', compress: true });
      else doc.addPage([w, h], landscape ? 'l' : 'p');
      doc.addImage(img.data, img.format, 0, 0, w, h);
    }
  });
  return new Uint8Array(doc.output('arraybuffer'));
}
