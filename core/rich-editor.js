// Shared visual Markdown editor (contenteditable) used by Notes and Journal.
// The text is stored as Markdown; the editor shows it rendered and converts edits back.
import { registerMessages, t } from './i18n.js';
import { createIcon } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { htmlToMarkdown } from './htmltomd.js';

registerMessages('en', {
  'ed.fmt': 'Formatting',
  'ed.fmt.bold': 'Bold',
  'ed.fmt.italic': 'Italic',
  'ed.fmt.heading': 'Heading',
  'ed.fmt.ul': 'Bulleted list',
  'ed.fmt.ol': 'Numbered list',
  'ed.fmt.quote': 'Quote',
  'ed.fmt.code': 'Code',
  'ed.fmt.link': 'Link',
  'ed.link.title': 'Link',
  'ed.link.url': 'Web address',
  'ed.link.save': 'Apply',
  'ed.link.remove': 'Remove link',
  'ed.link.cancel': 'Cancel',
});
registerMessages('de', {
  'ed.fmt': 'Formatierung',
  'ed.fmt.bold': 'Fett',
  'ed.fmt.italic': 'Kursiv',
  'ed.fmt.heading': 'Überschrift',
  'ed.fmt.ul': 'Aufzählung',
  'ed.fmt.ol': 'Nummerierte Liste',
  'ed.fmt.quote': 'Zitat',
  'ed.fmt.code': 'Code',
  'ed.fmt.link': 'Link',
  'ed.link.title': 'Link',
  'ed.link.url': 'Webadresse',
  'ed.link.save': 'Übernehmen',
  'ed.link.remove': 'Link entfernen',
  'ed.link.cancel': 'Abbrechen',
});

const TOOLBAR = [['bold', 'bold'], ['italic', 'italic'], ['heading', 'heading'], ['ul', 'list'], ['ol', 'list-ordered'], ['quote', 'quote'], ['code', 'code'], ['link', 'link']];
const FLOATING = ['bold', 'italic', 'heading', 'code', 'link'];

function askLink(current) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ow-dialog';
    dialog.innerHTML = `<form method="dialog" novalidate><h2></h2><div class="ow-field"><label class="ow-label" for="ed-link-url"></label><input id="ed-link-url" class="ow-input" type="url" inputmode="url" autocomplete="off" placeholder="https://"></div><div class="ow-dialog__actions"><button type="button" class="ow-btn ow-btn--secondary" data-act="remove"></button><button type="button" class="ow-btn ow-btn--secondary" data-act="cancel"></button><button class="ow-btn" data-act="save"></button></div></form>`;
    dialog.querySelector('h2').textContent = t('ed.link.title');
    dialog.querySelector('label').textContent = t('ed.link.url');
    dialog.querySelector('[data-act=remove]').textContent = t('ed.link.remove');
    dialog.querySelector('[data-act=cancel]').textContent = t('ed.link.cancel');
    dialog.querySelector('[data-act=save]').textContent = t('ed.link.save');
    dialog.querySelector('[data-act=remove]').hidden = !current;
    const input = dialog.querySelector('input');
    input.value = current ?? '';
    let result = null;
    dialog.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'remove') { result = ''; dialog.close(); } else if (act === 'cancel' || e.target === dialog) dialog.close();
    });
    dialog.querySelector('form').addEventListener('submit', () => { result = input.value.trim(); });
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
    input.select();
  });
}

/**
 * Mounts the editor on `body` (a contenteditable element). `bar` and `float` are empty containers
 * for the fixed toolbar and the selection toolbar. `onInput(markdown)` fires after every edit.
 * `btnClass` is the CSS class of the toolbar buttons (styled by the tool).
 */
export function mountRichEditor({ body, bar, float, onInput, btnClass = 'nt-fmt__btn' }) {
  const inEditor = (node) => !!node && body.contains(node);
  const currentRange = () => {
    const sel = getSelection();
    return sel.rangeCount && inEditor(sel.anchorNode) ? sel.getRangeAt(0) : null;
  };
  const closestTag = (...tags) => {
    let node = getSelection().anchorNode;
    while (node && node !== body) {
      if (node.nodeType === 1 && tags.includes(node.tagName)) return node;
      node = node.parentNode;
    }
    return null;
  };

  function formatButtons(kinds) {
    return kinds.map((kind) => {
      const icon = TOOLBAR.find(([k]) => k === kind)[1];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = btnClass;
      b.dataset.format = kind;
      b.title = t(`ed.fmt.${kind}`);
      b.setAttribute('aria-label', t(`ed.fmt.${kind}`));
      b.append(createIcon(icon, { size: '1.1rem' }));
      return b;
    });
  }

  /** (Re)builds both toolbars, e.g. after a language change. */
  function renderBars() {
    bar.setAttribute('aria-label', t('ed.fmt'));
    float.setAttribute('aria-label', t('ed.fmt'));
    bar.replaceChildren(...formatButtons(TOOLBAR.map(([k]) => k)));
    float.replaceChildren(...formatButtons(FLOATING));
  }

  function syncFormatState() {
    const active = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      heading: !!closestTag('H1', 'H2', 'H3'),
      ul: !!closestTag('UL'),
      ol: !!closestTag('OL'),
      quote: !!closestTag('BLOCKQUOTE'),
      code: !!closestTag('CODE'),
      link: !!closestTag('A'),
    };
    for (const root of [bar, float]) root.querySelectorAll('[data-format]').forEach((b) => b.setAttribute('aria-pressed', String(!!active[b.dataset.format])));
  }

  async function editLink() {
    const range = currentRange();
    if (!range) return;
    const saved = range.cloneRange();
    const existing = closestTag('A');
    const url = await askLink(existing?.getAttribute('href'));
    body.focus();
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(saved);
    if (url === null) return;
    if (!url) { if (existing) document.execCommand('unlink'); return; }
    const href = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
    if (!/^https?:\/\/\S+$/i.test(href)) return;
    if (existing) existing.setAttribute('href', href);
    else if (sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${href.replace(/"/g, '&quot;')}">${href.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a>`);
    else document.execCommand('createLink', false, href);
  }

  function toggleCode() {
    const existing = closestTag('CODE');
    if (existing) {
      existing.replaceWith(...existing.childNodes);
      return;
    }
    const sel = getSelection();
    if (sel.isCollapsed) return;
    const text = sel.toString().replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    document.execCommand('insertHTML', false, `<code>${text}</code>`);
  }

  function format(kind) {
    body.focus();
    if (!currentRange()) return;
    if (kind === 'bold') document.execCommand('bold');
    else if (kind === 'italic') document.execCommand('italic');
    else if (kind === 'ul') document.execCommand('insertUnorderedList');
    else if (kind === 'ol') document.execCommand('insertOrderedList');
    else if (kind === 'code') toggleCode();
    else if (kind === 'quote') {
      if (closestTag('BLOCKQUOTE')) document.execCommand('outdent'); else document.execCommand('formatBlock', false, '<blockquote>');
    } else if (kind === 'heading') {
      const level = Number(closestTag('H1', 'H2', 'H3')?.tagName[1] ?? 0);
      document.execCommand('formatBlock', false, level >= 3 ? '<p>' : `<h${level + 1}>`);
    } else if (kind === 'link') { editLink().then(afterFormat); return; }
    afterFormat();
  }

  function afterFormat() {
    body.dispatchEvent(new Event('input', { bubbles: true }));
    syncFormatState();
    updateFloat();
  }

  const hideFloat = () => { float.hidden = true; };

  function updateFloat() {
    const sel = getSelection();
    const range = currentRange();
    if (!range || sel.isCollapsed || document.activeElement !== body) { hideFloat(); return; }
    float.hidden = false;
    const rect = range.getBoundingClientRect();
    const wrap = body.parentElement.getBoundingClientRect();
    const above = rect.top - wrap.top - float.offsetHeight - 8;
    float.style.top = `${above >= 0 ? above : rect.bottom - wrap.top + 8}px`;
    float.style.left = `${Math.max(0, Math.min(rect.left - wrap.left, wrap.width - float.offsetWidth))}px`;
  }

  for (const root of [bar, float]) {
    root.addEventListener('mousedown', (e) => { if (e.target.closest('[data-format]')) e.preventDefault(); });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-format]');
      if (b) format(b.dataset.format);
    });
  }
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== body) { hideFloat(); return; }
    syncFormatState();
    updateFloat();
  });
  body.addEventListener('blur', () => setTimeout(() => { if (!float.contains(document.activeElement)) hideFloat(); }));
  body.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'k') return;
    e.preventDefault();
    format('link');
  });
  // Links open on Ctrl/Cmd+click; a plain click only places the cursor
  body.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && (e.ctrlKey || e.metaKey)) window.open(a.href, '_blank', 'noopener');
  });
  body.addEventListener('input', () => {
    if (!body.textContent.trim() && !body.querySelector('li, hr, pre')) body.replaceChildren();
    onInput(htmlToMarkdown(body));
  });
  // Paste as plain text so foreign formatting never ends up in the text
  body.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });

  renderBars();
  return {
    renderBars,
    /** Shows Markdown in the editor. */
    setMarkdown(md) { body.innerHTML = renderMarkdown(md); },
    focus() { body.focus(); },
  };
}
