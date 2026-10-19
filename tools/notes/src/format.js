// Text formatting for the Markdown editor: pure functions on (text, selection start, selection end).
// Each returns { text, start, end } with the new text and selection.

const WRAP = { bold: '**', italic: '*', code: '`' };
const LINE = {
  ul: { re: /^[-*] /, make: () => '- ' },
  ol: { re: /^\d+\. /, make: (i) => `${i + 1}. ` },
  quote: { re: /^> /, make: () => '> ' },
};
const ANY_PREFIX = /^([-*] |\d+\. |> |#{1,3} )/;

const isWordChar = (c) => c !== undefined && /[\p{L}\p{N}_]/u.test(c);

function wrap(text, s, e, mark, kind) {
  const n = mark.length;
  if (s === e) { // no selection: use the word at the cursor, else insert an empty pair
    while (s > 0 && isWordChar(text[s - 1])) s--;
    while (e < text.length && isWordChar(text[e])) e++;
    if (s === e) return { text: text.slice(0, s) + mark + mark + text.slice(e), start: s + n, end: s + n };
  }
  const before = text.slice(s - n, s);
  const after = text.slice(e, e + n);
  // italic must not mistake the inner * of ** for its own marks
  const single = kind === 'italic';
  const outer = before === mark && after === mark && !(single && (text[s - 2] === '*' || text[e + 1] === '*'));
  if (outer) return { text: text.slice(0, s - n) + text.slice(s, e) + text.slice(e + n), start: s - n, end: e - n };
  const sel = text.slice(s, e);
  if (sel.length > 2 * n && sel.startsWith(mark) && sel.endsWith(mark) && !(single && (sel.startsWith('**') || sel.endsWith('**')))) {
    return { text: text.slice(0, s) + sel.slice(n, -n) + text.slice(e), start: s, end: e - 2 * n };
  }
  return { text: text.slice(0, s) + mark + sel + mark + text.slice(e), start: s + n, end: e + n };
}

function link(text, s, e) {
  const sel = text.slice(s, e) || 'text';
  const out = `${text.slice(0, s)}[${sel}](https://)${text.slice(e)}`;
  const urlStart = s + sel.length + 3;
  return { text: out, start: urlStart, end: urlStart + 8 };
}

function lines(text, s, e, kind) {
  const from = text.lastIndexOf('\n', s - 1) + 1;
  const stop = e > s && text[e - 1] === '\n' ? e - 1 : e;
  const nl = text.indexOf('\n', stop);
  const to = nl === -1 ? text.length : nl;
  const rows = text.slice(from, to).split('\n');
  let next;
  if (kind === 'heading') {
    const level = rows[0].match(/^(#{1,3}) /)?.[1].length ?? 0;
    const prefix = level >= 3 ? '' : '#'.repeat(level + 1) + ' ';
    next = rows.map((r) => prefix + r.replace(/^#{1,3} /, ''));
  } else {
    const { re, make } = LINE[kind];
    const all = rows.every((r) => re.test(r));
    next = rows.map((r, i) => (all ? r.replace(re, '') : make(i) + r.replace(ANY_PREFIX, '')));
  }
  const block = next.join('\n');
  return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length };
}

/** kind: 'bold' | 'italic' | 'code' | 'link' | 'heading' | 'ul' | 'ol' | 'quote'. */
export function applyFormat(text, start, end, kind) {
  if (WRAP[kind]) return wrap(text, start, end, WRAP[kind], kind);
  if (kind === 'link') return link(text, start, end);
  return lines(text, start, end, kind);
}
