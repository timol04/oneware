// Small Markdown renderer for notes. All text is escaped first, so the output is safe to set as innerHTML.
// Supports headings, bold, italic, inline code, code blocks, bullet and numbered lists, quotes, rules and http(s) links.

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Inline formatting on already escaped text. */
function inline(text) {
  const codes = [];
  let out = text.replace(/`([^`\n]+)`/g, (_, c) => `\u0000${codes.push(`<code>${c}</code>`) - 1}\u0000`);
  out = out
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

/** Markdown to safe HTML. */
export function renderMarkdown(source) {
  const lines = escapeHtml(source.replace(/\r\n?/g, '\n')).split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      html.push(`<pre><code>${code.join('\n')}</code></pre>`);
    } else if (/^\s*$/.test(line)) {
      i++;
    } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      html.push('<hr>');
      i++;
    } else if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      html.push(`<h${level}>${inline(line.replace(/^#+\s+/, ''))}</h${level}>`);
      i++;
    } else if (/^&gt;\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) quote.push(lines[i++].replace(/^&gt;\s?/, ''));
      html.push(`<blockquote>${inline(quote.join('<br>'))}</blockquote>`);
    } else if (/^\s*([-*])\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const marker = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
      const items = [];
      while (i < lines.length && marker.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(marker, ''))}</li>`);
      html.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
    } else {
      const para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(```|#{1,3}\s|&gt;|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])) para.push(lines[i++]);
      html.push(`<p>${para.map(inline).join('<br>')}</p>`);
    }
  }
  return html.join('\n');
}
