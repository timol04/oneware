// Readers for plain text and Markdown.
import { run, tidy, para } from './blocks.js';

/** Plain text: paragraphs are separated by blank lines; single line breaks stay line breaks. */
export function readText(source) {
  const text = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  return text.split(/\n{2,}/).map((p) => p.replace(/^\n+|\n+$/g, '')).filter((p) => p.trim()).map(para);
}

/** Inline Markdown: **bold**, __bold__, *italic*, _italic_, `code` (kept as text), [label](url) (label only). */
export function inlineRuns(source) {
  const text = source.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`([^`]+)`/g, '$1');
  const runs = [];
  const re = /(\*\*|__)(?=\S)([\s\S]*?\S)\1|(\*|_)(?=\S)([\s\S]*?\S)\3/g;
  let pos = 0;
  for (const m of text.matchAll(re)) {
    // Underscores inside words (snake_case) are not emphasis.
    if (m[3] === '_' && /\w/.test(text[m.index - 1] ?? '')) continue;
    if (m.index > pos) runs.push(run(text.slice(pos, m.index)));
    if (m[1]) runs.push(...inlineRuns(m[2]).map((r) => ({ ...r, b: true })));
    else runs.push(...inlineRuns(m[4]).map((r) => ({ ...r, i: true })));
    pos = m.index + m[0].length;
  }
  if (pos < text.length) runs.push(run(text.slice(pos)));
  return tidy(runs);
}

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function readMarkdown(source) {
  const lines = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let buffer = [];
  const flush = () => {
    if (buffer.length) blocks.push({ type: 'para', runs: inlineRuns(buffer.join('\n')) });
    buffer = [];
  };
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { flush(); inFence = !inFence; continue; }
    if (inFence) { blocks.push(para(line)); continue; }
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      flush();
      blocks.push({ type: 'heading', level: Math.min(m[1].length, 3), runs: inlineRuns(m[2]) });
    } else if ((m = /^\s*([-*+])\s+(.*)$/.exec(line)) || (m = /^\s*(\d+)[.)]\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ type: 'item', ordered: /\d/.test(m[1]), runs: inlineRuns(m[2]) });
    } else if (/^\s*>\s?/.test(line)) {
      flush();
      blocks.push({ type: 'para', runs: inlineRuns(line.replace(/^\s*>\s?/, '')) });
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
    } else if (line.includes('|') && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1] ?? '')) {
      flush();
      const rows = [cells(line)];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      i--;
      blocks.push({ type: 'table', rows });
    } else {
      buffer.push(line.trim());
    }
  }
  flush();
  return blocks;
}
