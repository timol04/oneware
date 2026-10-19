// Shared text model for all document conversions. Readers produce it, writers consume it.
//
//   { type: 'heading', level: 1..3, runs }      runs: [{ t, b?, i? }]  ("\n" in t is a line break)
//   { type: 'para', runs }
//   { type: 'item', ordered, runs }             one list item
//   { type: 'table', rows: [[string]] }

export const run = (t, style = {}) => ({ t, ...(style.b ? { b: true } : {}), ...(style.i ? { i: true } : {}) });
export const plain = (runs) => runs.map((r) => r.t).join('');
export const para = (text) => ({ type: 'para', runs: [run(text)] });

/** Merges neighbouring runs with the same style and drops empty ones. */
export function tidy(runs) {
  const out = [];
  for (const r of runs) {
    if (!r.t) continue;
    const last = out[out.length - 1];
    if (last && !!last.b === !!r.b && !!last.i === !!r.i) last.t += r.t;
    else out.push({ ...r });
  }
  return out;
}

export function isEmpty(blocks) {
  return !blocks.some((b) => (b.type === 'table' ? b.rows.length : plain(b.runs).trim()));
}
