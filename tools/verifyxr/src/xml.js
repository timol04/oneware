// Minimal XML reader for OOXML parts. Runs in the browser and in Node (no DOMParser needed).
// Node: { name, attrs, kids } for elements, { name: '#text', text } for text. Whitespace-only text is
// kept only inside text elements (w:t, w:delText, w:instrText, a:t); elsewhere it is indentation.
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  }
  return ENTITIES[e] ?? m;
});

const TEXT_ELEMENT = /(^|:)(t|delText|instrText)$/;
const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** @returns {Array} top-level element nodes */
export function parseXml(source) {
  const root = { name: '#root', attrs: {}, kids: [] };
  const stack = [root];
  for (const m of source.matchAll(TOKEN)) {
    const top = stack[stack.length - 1];
    const [, cdata, closing, name, rawAttrs, selfClosing, text] = m;
    if (cdata !== undefined) top.kids.push({ name: '#text', text: cdata });
    else if (name !== undefined) {
      if (closing) { if (stack.length > 1) stack.pop(); continue; }
      const attrs = {};
      for (const a of (rawAttrs ?? '').matchAll(ATTR)) attrs[a[1]] = decode(a[2] ?? a[3] ?? '');
      const node = { name, attrs, kids: [] };
      top.kids.push(node);
      if (!selfClosing) stack.push(node);
    } else if (text !== undefined && (TEXT_ELEMENT.test(top.name) || text.trim() !== '')) {
      top.kids.push({ name: '#text', text: decode(text) });
    }
  }
  return root.kids;
}
