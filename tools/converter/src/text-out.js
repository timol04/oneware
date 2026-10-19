// Writers for plain text, Markdown and HTML.
import { plain } from './blocks.js';

const mdEscape = (s) => s.replace(/([\\*_`#])/g, '\\$1');
const mdRuns = (runs) => runs.map((r) => {
  const t = mdEscape(r.t).replace(/\n/g, '  \n');
  if (!t.trim()) return t;
  const lead = /^\s*/.exec(t)[0];
  const trail = /\s*$/.exec(t)[0];
  const core = t.trim();
  const mark = r.b && r.i ? '***' : r.b ? '**' : r.i ? '*' : '';
  return `${lead}${mark}${core}${mark}${trail}`;
}).join('');

export function toText(blocks) {
  const out = [];
  let n = 0;
  for (const [i, b] of blocks.entries()) {
    if (b.type === 'table') out.push(b.rows.map((r) => r.join('\t')).join('\n'));
    else if (b.type === 'item') {
      n = b.ordered ? (blocks[i - 1]?.type === 'item' && blocks[i - 1].ordered ? n + 1 : 1) : 0;
      out.push(`${b.ordered ? `${n}.` : '-'} ${plain(b.runs)}`);
    } else out.push(plain(b.runs));
  }
  // List items stay together; everything else is separated by a blank line.
  return out.reduce((acc, line, i) => acc + (i ? (blocks[i].type === 'item' && blocks[i - 1].type === 'item' ? '\n' : '\n\n') : '') + line, '') + '\n';
}

export function toMarkdown(blocks) {
  const out = [];
  let n = 0;
  for (const [i, b] of blocks.entries()) {
    if (b.type === 'heading') out.push(`${'#'.repeat(b.level)} ${mdRuns(b.runs).replace(/\s*\n\s*/g, ' ')}`);
    else if (b.type === 'item') {
      n = b.ordered ? (blocks[i - 1]?.type === 'item' && blocks[i - 1].ordered ? n + 1 : 1) : 0;
      out.push(`${b.ordered ? `${n}.` : '-'} ${mdRuns(b.runs).replace(/\s*\n\s*/g, ' ')}`);
    } else if (b.type === 'table') {
      const esc = (c) => c.replace(/\|/g, '\\|');
      const width = Math.max(...b.rows.map((r) => r.length));
      const row = (r) => `| ${Array.from({ length: width }, (_, k) => esc(r[k] ?? '')).join(' | ')} |`;
      out.push([row(b.rows[0]), `|${' --- |'.repeat(width)}`, ...b.rows.slice(1).map(row)].join('\n'));
    } else out.push(mdRuns(b.runs));
  }
  return out.reduce((acc, line, i) => acc + (i ? (blocks[i].type === 'item' && blocks[i - 1].type === 'item' ? '\n' : '\n\n') : '') + line, '') + '\n';
}

export const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const htmlRuns = (runs) => runs.map((r) => {
  let t = escapeHtml(r.t).replace(/\n/g, '<br>');
  if (r.i) t = `<em>${t}</em>`;
  if (r.b) t = `<strong>${t}</strong>`;
  return t;
}).join('');

export function toHtml(blocks, title = '') {
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'heading') out.push(`<h${b.level}>${htmlRuns(b.runs)}</h${b.level}>`);
    else if (b.type === 'item') {
      const tag = b.ordered ? 'ol' : 'ul';
      const items = [];
      while (i < blocks.length && blocks[i].type === 'item' && blocks[i].ordered === b.ordered) items.push(`<li>${htmlRuns(blocks[i++].runs)}</li>`);
      i--;
      out.push(`<${tag}>\n${items.join('\n')}\n</${tag}>`);
    } else if (b.type === 'table') {
      out.push(`<table>\n${b.rows.map((r, k) => `<tr>${r.map((c) => `<${k ? 'td' : 'th'}>${escapeHtml(c)}</${k ? 'td' : 'th'}>`).join('')}</tr>`).join('\n')}\n</table>`);
    } else out.push(`<p>${htmlRuns(b.runs)}</p>`);
  }
  return `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${escapeHtml(title)}</title>\n`
    + '<style>body{font:16px/1.6 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:.3rem .6rem;text-align:left}</style>\n'
    + `</head>\n<body>\n${out.join('\n')}\n</body>\n</html>\n`;
}
