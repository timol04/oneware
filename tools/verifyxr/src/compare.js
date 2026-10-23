// Before/after: what the fixer changed. Compares the parsed original with the parsed corrected copy
// (same paragraphs, same order, so they are matched by index) and lists the changed values.
//
// Row: { kind: 'font'|'size'|'spacing'|'margin', side?, before, after, places[], count }
//   before/after: arrays of values (string or message object), rendered joined by ", ".
//   places: where messages of the changed paragraphs/sections (one per paragraph).
import { msg, where } from './checker.js';

const uniq = (list) => [...new Set(list)];

const fontsOf = (p) => uniq(p.items.filter((i) => i.text !== undefined && i.text.trim()).map((i) => i.font ?? '')).sort();
const sizesOf = (p) => uniq(p.items.filter((i) => i.text !== undefined && i.text.trim()).map((i) => i.size ?? -1)).sort((a, b) => a - b);

const fontValue = (f) => (f === '' ? msg('val.unknown') : f);
const sizeValue = (n) => (n === -1 ? msg('val.unknown') : msg('val.pt', { n }));
const spacingValue = (ls) => (ls.kind === 'multiple'
  ? msg('val.times', { n: ls.value })
  : msg('val.fixedPt', { pt: ls.value, kind: msg(ls.kind === 'exact' ? 'val.exact' : 'val.atLeast') }));

/**
 * @param before  parseDocx() of the original
 * @param after   parseDocx() of the corrected copy
 * @returns {{ rows: Array, paragraphs: number, sections: number }}
 */
export function compareDocs(before, after) {
  const rows = new Map(); // key -> row
  const add = (kind, side, b, a, place) => {
    const key = JSON.stringify([kind, side, b, a]);
    const row = rows.get(key) ?? { kind, side, before: b, after: a, places: [], count: 0 };
    row.places.push(place);
    row.count++;
    rows.set(key, row);
  };

  const changedParagraphs = new Set();
  before.paragraphs.forEach((p, i) => {
    const q = after.paragraphs[i];
    if (!q) return;
    const place = where(p);
    const fb = fontsOf(p); const fa = fontsOf(q);
    if (JSON.stringify(fb) !== JSON.stringify(fa)) { add('font', undefined, fb.map(fontValue), fa.map(fontValue), place); changedParagraphs.add(i); }
    const sb = sizesOf(p); const sa = sizesOf(q);
    if (JSON.stringify(sb) !== JSON.stringify(sa)) { add('size', undefined, sb.map(sizeValue), sa.map(sizeValue), place); changedParagraphs.add(i); }
    if (JSON.stringify(p.lineSpacing) !== JSON.stringify(q.lineSpacing)) { add('spacing', undefined, [spacingValue(p.lineSpacing)], [spacingValue(q.lineSpacing)], place); changedParagraphs.add(i); }
  });

  let changedSections = 0;
  before.sections.forEach((sec, i) => {
    const other = after.sections[i];
    if (!other) return;
    const first = before.paragraphs.find((p) => p.sectionIndex === i);
    const place = before.sections.length > 1 ? msg(first ? 'where.sectionPage' : 'where.section', { n: i + 1, page: first?.page }) : msg('where.document');
    let changed = false;
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const b = sec.margins[side]; const a = other.margins[side];
      if (b === a) continue;
      add('margin', side, [b === undefined ? msg('val.unknown') : msg('val.cm', { n: b })], [msg('val.cm', { n: a })], place);
      changed = true;
    }
    if (changed) changedSections++;
  });

  return { rows: [...rows.values()], paragraphs: changedParagraphs.size, sections: changedSections };
}
