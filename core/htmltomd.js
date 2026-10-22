// Turns the HTML of the visual editor back into Markdown (the format notes are stored in).
// Only the elements the editor can produce are handled; everything else falls back to its text.

const INLINE_ESCAPE = /([\\`*_[\]])/g;
const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'PRE', 'HR', 'TABLE', 'SECTION', 'ARTICLE']);

const clean = (s) => s.replace(/ /g, ' ').replace(/​/g, '');

/** Marks that would turn into a block when a line starts with them get a backslash. */
function escapeLineStart(line) {
  if (/^\d+\. /.test(line)) return line.replace(/^(\d+)\./, '$1\\.');
  return /^(#{1,3} |>|[-+] )/.test(line) ? `\\${line}` : line;
}

function wrapMarks(inner, mark) {
  if (!inner.trim()) return inner;
  const lead = inner.match(/^\s*/)[0];
  const trail = inner.match(/\s*$/)[0];
  return `${lead}${mark}${inner.trim()}${mark}${trail}`;
}

function inline(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) { out += clean(child.nodeValue).replace(INLINE_ESCAPE, '\\$1'); continue; }
    if (child.nodeType !== 1) continue;
    const inner = () => inline(child);
    switch (child.tagName) {
      case 'STRONG': case 'B': out += wrapMarks(inner(), '**'); break;
      case 'EM': case 'I': out += wrapMarks(inner(), '*'); break;
      case 'CODE': out += clean(child.textContent) ? `\`${clean(child.textContent).replace(/`/g, "'")}\`` : ''; break;
      case 'A': {
        const href = child.getAttribute('href') ?? '';
        const text = inner();
        out += /^https?:\/\/\S+$/i.test(href) && text.trim() ? `[${text}](${href})` : text;
        break;
      }
      case 'BR': out += '\n'; break;
      default: out += inner();
    }
  }
  return out;
}

const lineStarts = (text) => text.split('\n').map(escapeLineStart).join('\n');

function blocks(parent, out) {
  let pending = [];
  const flush = () => {
    if (!pending.length) return;
    const holder = { childNodes: pending };
    const text = inline(holder).replace(/^\n+|\n+$/g, '');
    if (text.trim()) out.push(lineStarts(text));
    pending = [];
  };
  for (const child of parent.childNodes) {
    if (child.nodeType !== 1 || !BLOCKS.has(child.tagName)) { pending.push(child); continue; }
    flush();
    const tag = child.tagName;
    if (/^H[1-6]$/.test(tag)) {
      const text = inline(child).replace(/\n/g, ' ').trim();
      if (text) out.push(`${'#'.repeat(Math.min(3, Number(tag[1])))} ${text}`);
    } else if (tag === 'BLOCKQUOTE') {
      const inner = [];
      blocks(child, inner);
      const text = inner.join('\n').replace(/^\\(?=>)/gm, '');
      if (text.trim()) out.push(text.split('\n').map((l) => `> ${l}`).join('\n'));
    } else if (tag === 'UL' || tag === 'OL') {
      const items = [];
      const walk = (list) => {
        for (const li of list.children) {
          if (li.tagName !== 'LI') continue;
          const own = { childNodes: [...li.childNodes].filter((n) => !(n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL'))) };
          const text = inline(own).replace(/\n+/g, ' ').trim();
          if (text) items.push(text);
          for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') walk(sub);
        }
      };
      walk(child);
      if (items.length) out.push(items.map((text, i) => (tag === 'UL' ? `- ${text}` : `${i + 1}. ${text}`)).join('\n'));
    } else if (tag === 'PRE') {
      out.push(`\`\`\`\n${clean(child.textContent).replace(/\n$/, '')}\n\`\`\``);
    } else if (tag === 'HR') {
      out.push('---');
    } else if ([...child.children].some((c) => BLOCKS.has(c.tagName))) {
      blocks(child, out);
    } else {
      const text = inline(child).replace(/^\n+|\n+$/g, '');
      if (text.trim()) out.push(lineStarts(text));
    }
  }
  flush();
}

/** Markdown for the content of an editor element. */
export function htmlToMarkdown(root) {
  const out = [];
  blocks(root, out);
  return out.join('\n\n').trim();
}
