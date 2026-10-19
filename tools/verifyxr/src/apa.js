// APA 7 consistency check (Premium). Works on the result of parseDocx().
//
// Steps:
//   1. Split the document at the reference list heading (text before = body, after = entries)
//   2. Find in-text citations with regular expressions (parenthetical and narrative)
//   3. Parse the entries into authors + year and match citations (author + year exactly)
//   4. Check the entries' formatting (journal title italic, title case, DOI)
//
// Regex detection is an approximation: findings where detection is uncertain are 'hint',
// clear inconsistencies are 'error'. Texts are message objects { k, p } like in checker.js.
import { where, msg } from './checker.js';

// ---------- Patterns ----------
// Surname with optional particles (von, van der, de ...), e.g. "van der Berg", "Müller-Lyer".
const NAME = String.raw`(?:(?:van|von|de|der|den|di|da|le|la|zu|ter|ten)\s+)*\p{Lu}[\p{L}'’\-]*`;
// One author, two or more joined by &/und/and, or "et al."
const AUTH = String.raw`${NAME}(?:(?:\s*,\s*${NAME})*\s*,?\s*(?:&|und|and)\s*${NAME}|\s+et\s+al\.)?`;
const YEAR = String.raw`(?:(?:19|20)\d{2}[a-z]?|n\.\s?d\.|o\.\s?J\.)`;
const YEARS = String.raw`${YEAR}(?:\s*,\s*${YEAR})*`;
const PAGES = String.raw`(?:S\.|p\.|pp\.|Kap\.|ch\.)`;

// One segment inside parentheses, e.g. "cf. Meier & Huber, 2020, p. 4"
const SEGMENT = new RegExp(
  String.raw`^\s*(?:(?:vgl\.|siehe|see|cf\.|e\.\s?g\.|z\.\s?B\.)\s*)?(${AUTH}),?\s+(${YEARS})(?:\s*,\s*${PAGES}\s*[^;]*)?\s*$`, 'u');
// Running text: "Meier (2020) shows ...", "Meier and Huber (2020, p. 3)"
const NARRATIVE = new RegExp(
  String.raw`(?<![\p{L}\-])(${AUTH})\s*\(\s*(${YEARS})(?:\s*,\s*${PAGES}\s*[^)]*)?\)`, 'gu');

const REF_HEADING = /^\s*(literaturverzeichnis|literatur|quellenverzeichnis|quellen|references|reference list|bibliography|works cited)\s*$/i;

// ---------- Parsing ----------
const norm = (s) => s.toLowerCase().normalize('NFC');

/** "Meier und Huber" / "Meier, Huber & Müller" / "Meier et al." -> { surnames, etAl } */
function parseAuthors(str) {
  const etAl = /\bet\s+al\./.test(str);
  const surnames = str.replace(/\bet\s+al\./, '').split(/\s*(?:,|&|\bund\b|\band\b)\s*/).map((s) => s.trim()).filter(Boolean);
  return { surnames, etAl };
}

/** "2020a, 2021" -> [{ year:'2020', suffix:'a' }, { year:'2021', suffix:'' }] */
function parseYears(str) {
  return str.split(',').map((y) => y.trim()).filter(Boolean).map((y) => {
    const m = /^((?:19|20)\d{2})([a-z]?)$/.exec(y);
    return m ? { year: m[1], suffix: m[2] } : { year: y.replace(/\s/g, ''), suffix: '' }; // n.d. / o.J.
  });
}

const display = (c) => `${c.surnames.join(c.surnames.length === 2 ? ' & ' : ', ')}${c.etAl ? ' et al.' : ''}, ${c.year}${c.suffix}`;

/** All in-text citations of a paragraph. */
export function extractCitations(text) {
  const found = [];
  const push = (authStr, yearsStr, kind) => {
    const authors = parseAuthors(authStr);
    for (const y of parseYears(yearsStr)) found.push({ ...authors, ...y, kind, raw: `${authStr} ${yearsStr}` });
  };
  // 1) Parentheses (no nesting); multiple citations separated by ";"
  for (const m of text.matchAll(/\(([^()]*)\)/g)) {
    for (const seg of m[1].split(';')) {
      const s = SEGMENT.exec(seg);
      if (s) push(s[1], s[2], 'parenthetical');
    }
  }
  // 2) Narrative: the author precedes the parenthesis with the year
  for (const m of text.matchAll(NARRATIVE)) push(m[1], m[2], 'narrative');
  return found;
}

/** Reference list entry: authors before "(year)". Returns null if the paragraph is no entry. */
export function parseReference(text) {
  const m = /^(.+?)\s*\(\s*((?:19|20)\d{2}[a-z]?|n\.\s?d\.|o\.\s?J\.)(?:\s*,[^)]*)?\)/u.exec(text);
  if (!m) return null;
  const authorPart = m[1];
  // "Meier, A. B." -> surname before a comma followed by initials
  const surnames = [...authorPart.matchAll(new RegExp(String.raw`(${NAME})\s*,\s*(?:\p{Lu}\.[\s\-]*)+`, 'gu'))].map((x) => x[1]);
  const { year, suffix } = parseYears(m[2])[0];
  return {
    // Without initials (e.g. an organization): the whole author part is one name
    surnames: surnames.length ? surnames : [authorPart.replace(/[.\s]+$/, '')],
    year, suffix,
    yearEnd: m.index + m[0].length, // position after "(year)" for the format check
  };
}

/** Splits the document into body paragraphs and reference list paragraphs. */
export function splitDocument(doc) {
  const headingIdx = doc.paragraphs.findIndex((p) => !p.inTable && REF_HEADING.test(p.text));
  if (headingIdx === -1) return { body: doc.paragraphs.filter((p) => !p.inTable && !p.special), refParas: null, headingIdx };
  const after = doc.paragraphs.slice(headingIdx + 1);
  // The list ends at the next heading (e.g. appendix)
  const endRel = after.findIndex((p) => p.special && p.words > 0);
  const refParas = (endRel === -1 ? after : after.slice(0, endRel)).filter((p) => p.words > 0 && !p.inTable);
  return { body: doc.paragraphs.slice(0, headingIdx).filter((p) => !p.inTable && !p.special), refParas, headingIdx };
}

// ---------- Matching ----------
const same = (a, b) => norm(a) === norm(b);

function matchCitation(c, refs) {
  const sameAuthor = refs.filter((r) => same(r.surnames[0], c.surnames[0]));
  const exact = sameAuthor.filter((r) => r.year === c.year && r.suffix === c.suffix);
  const shown = display(c);
  if (exact.length === 0) {
    if (sameAuthor.length === 0) {
      return { problem: { severity: 'error', message: msg('apa.noEntry', { c: shown }), expected: msg('apa.expEntry'), found: msg('apa.foundNone'), hint: msg('apa.hintNoEntry') } };
    }
    const sameYear = sameAuthor.find((r) => r.year === c.year);
    const listed = sameAuthor.map((r) => `${r.year}${r.suffix}`).join(', ');
    return {
      problem: {
        severity: 'error',
        message: msg(sameYear ? 'apa.suffixMismatch' : 'apa.yearMismatch', { c: shown }),
        expected: msg('apa.expEntryOf', { author: c.surnames[0], year: `${c.year}${c.suffix}` }), found: msg('apa.foundListed', { author: c.surnames[0], years: listed }),
        hint: msg('apa.hintYear'),
      },
    };
  }
  // Number of authors: APA 7 names only the first author + "et al." from 3 authors on
  const ref = exact.find((r) => c.surnames.length < 2 || (r.surnames[1] && same(r.surnames[1], c.surnames[1]))) ?? exact[0];
  const n = ref.surnames.length;
  let problem = null;
  if (c.etAl && n < 3) {
    problem = { severity: 'hint', message: msg('apa.etAlFew', { c: shown, n }), expected: msg('apa.expAllNames'), found: 'et al.', hint: msg('apa.hintAllNames') };
  } else if (!c.etAl && c.surnames.length === 1 && n >= 2) {
    problem = { severity: 'error', message: msg('apa.oneOfMany', { c: shown, n }), expected: n >= 3 ? `${ref.surnames[0]} et al.` : `${ref.surnames[0]} & ${ref.surnames[1]}`, found: c.surnames[0], hint: msg('apa.hintAuthors') };
  } else if (!c.etAl && c.surnames.length >= 2 && n >= 2 && !same(ref.surnames[1], c.surnames[1])) {
    problem = { severity: 'error', message: msg('apa.secondMismatch', { c: shown }), expected: ref.surnames[1], found: c.surnames[1], hint: msg('apa.hintNames') };
  } else if (!c.etAl && c.surnames.length === 2 && n >= 3) {
    problem = { severity: 'hint', message: msg('apa.useEtAl', { c: shown }), expected: `${ref.surnames[0]} et al.`, found: shown, hint: msg('apa.hintEtAl') };
  }
  return { ref, problem };
}

// ---------- Format check of the entries ----------
const GERMAN = /[äöüß]|\b(und|der|die|das|von|für|mit|im|ein|eine|zur|zum|bei|auf|über|nach|zu)\b/i;

/** Share of italic letters in the range [start, end) of the paragraph text. */
function italicShare(para, start, end) {
  let pos = 0; let letters = 0; let italics = 0;
  for (const item of para.items) {
    if (item.text === undefined) continue;
    for (const ch of item.text) {
      if (pos >= start && pos < end && /\p{L}/u.test(ch)) { letters++; if (item.italic) italics++; }
      pos += ch.length;
    }
  }
  return letters === 0 ? 1 : italics / letters;
}

function checkReferenceFormat(p, ref) {
  const out = [];
  const text = p.text;
  const after = text.slice(ref.yearEnd);
  const lead = after.length - after.replace(/^[\s.]+/, '').length;
  const body = after.slice(lead);
  const bodyStart = ref.yearEnd + lead;

  // Title = up to the first sentence end, then the source (journal, volume(issue), pages)
  const titleEnd = body.search(/[.?!]\s/);
  const title = titleEnd === -1 ? '' : body.slice(0, titleEnd + 1);
  const rest = titleEnd === -1 ? '' : body.slice(titleEnd + 2);
  const restStart = bodyStart + (titleEnd === -1 ? 0 : titleEnd + 2);
  const journal = /^([^,]+?),\s*(\d+)(?:\(\s*[^)]*\))?\s*,\s*[\w\-–]+/.exec(rest);

  // 1) Journal title italic
  if (journal) {
    const share = italicShare(p, restStart, restStart + journal[1].length);
    if (share < 0.8) {
      out.push({ severity: 'error', message: msg('apa.journalItalic', { title: journal[1].trim() }), expected: msg('apa.expItalic'), found: msg('apa.foundNotItalic'), hint: msg('apa.hintItalic') });
    }
  }

  // 2) Title case: APA 7 sets article titles in sentence case (first word and proper nouns capitalized).
  //    German titles are not checked: nouns are capitalized there anyway.
  if (journal && title && !GERMAN.test(title)) {
    const words = title.replace(/[.?!]$/, '').split(/\s+/);
    const considered = words.filter((w, i) => i > 0 && w.length > 3 && !/:$/.test(words[i - 1]) && !/^[\p{Lu}\d\-]+$/u.test(w) && /^\p{L}/u.test(w));
    const caps = considered.filter((w) => /^\p{Lu}/u.test(w)).length;
    if (considered.length >= 3 && caps / considered.length >= 0.5) {
      out.push({ severity: 'hint', message: msg('apa.titleCase', { title: title.slice(0, 50) + (title.length > 50 ? '…' : '') }), expected: msg('apa.expSentenceCase'), found: msg('apa.foundManyCaps'), hint: msg('apa.hintSentenceCase') });
    }
  }

  // 3) DOI format: https://doi.org/10.xxxx/yyyy (no "doi:", no dx., no trailing period)
  const goodDoi = /https:\/\/doi\.org\/10\.\d{4,9}\/\S+/i.exec(text);
  const anyDoi = /(?:\bdoi:?\s*|https?:\/\/(?:dx\.)?doi\.org\/|\b)(10\.\d{4,9}\/\S+)/i.exec(text);
  if (anyDoi && !goodDoi) {
    out.push({ severity: 'error', message: msg('apa.doiFormat'), expected: `https://doi.org/${anyDoi[1].replace(/[.,;]$/, '')}`, found: anyDoi[0].trim(), hint: msg('apa.hintDoi') });
  } else if (goodDoi && /\.$/.test(text.trimEnd())) {
    out.push({ severity: 'hint', message: msg('apa.doiPeriod'), expected: msg('apa.expNoPeriod'), found: msg('apa.foundPeriod'), hint: msg('apa.hintDoiPeriod') });
  } else if (journal && !anyDoi && !/https?:\/\//i.test(text)) {
    out.push({ severity: 'hint', message: msg('apa.noDoi'), expected: msg('apa.expDoi'), found: msg('apa.foundMissing'), hint: msg('apa.hintNoDoi') });
  }
  return out;
}

// ---------- Main function ----------
const statusOf = (findings) => (findings.some((f) => f.severity === 'error') ? 'fail' : findings.length ? 'warn' : 'ok');
const IDS = ['apa-citations', 'apa-unused', 'apa-format'];

/** Returns criteria in the same shape as checkDocument() (for a shared display). */
export function checkApa(doc) {
  const { body, refParas, headingIdx } = splitDocument(doc);

  const citations = [];
  for (const p of body) for (const c of extractCitations(p.text)) citations.push({ ...c, para: p });

  if (citations.length === 0 && headingIdx === -1) {
    return IDS.map((id) => ({ id, status: 'skip', summary: msg('apa.sumNothing'), findings: [] }));
  }

  // Parse entries
  const refs = [];
  const unparsed = [];
  for (const p of refParas ?? []) {
    const r = parseReference(p.text);
    if (r) refs.push({ ...r, para: p, used: false });
    else unparsed.push(p);
  }

  // Match citations; the same message only once, with a count
  const cFindings = new Map();
  for (const c of citations) {
    const { ref, problem } = headingIdx === -1 ? { problem: null } : matchCitation(c, refs);
    if (ref) ref.used = true;
    if (problem) {
      const key = JSON.stringify(problem.message);
      const prev = cFindings.get(key);
      if (prev) prev.count++;
      else cFindings.set(key, { ...problem, where: where(c.para), count: 1 });
    }
  }
  const citationFindings = [...cFindings.values()].map((f) => (f.count > 1 ? { ...f, extra: f.count - 1 } : f));
  if (headingIdx === -1) {
    citationFindings.push({ where: msg('where.document'), severity: 'error', message: msg('apa.noList'), expected: msg('apa.expHeading'), found: msg('apa.foundNoHeading'), hint: msg('apa.hintNoList') });
  }

  const unusedFindings = refs.filter((r) => !r.used).map((r) => ({
    where: where(r.para), severity: 'hint', message: msg('apa.unused', { author: r.surnames[0], year: `${r.year}${r.suffix}` }),
    expected: msg('apa.expAllCited'), found: msg('apa.foundNoCitation'), hint: msg('apa.hintUnused'),
  }));

  const formatFindings = refs.flatMap((r) => checkReferenceFormat(r.para, r).map((f) => ({ ...f, where: where(r.para) })));
  for (const p of unparsed) {
    formatFindings.push({ where: where(p), severity: 'hint', message: msg('apa.unparsed'), expected: 'Author, A. (Year). Title.', found: p.text.slice(0, 40), hint: msg('apa.hintUnparsed') });
  }

  const noRefs = headingIdx !== -1 && refs.length === 0;
  const nCit = citations.length;
  return [
    { id: IDS[0], status: statusOf(citationFindings), findings: citationFindings,
      summary: citationFindings.length ? msg('apa.sumCitProblems', { n: nCit, problems: citationFindings.length }) : msg('apa.sumCitOk', { n: nCit }) },
    { id: IDS[1], status: noRefs ? 'skip' : statusOf(unusedFindings), findings: unusedFindings,
      summary: noRefs ? msg('apa.sumNoEntries') : unusedFindings.length ? msg('apa.sumUnused', { n: unusedFindings.length }) : msg('apa.sumAllCited', { n: refs.length }) },
    { id: IDS[2], status: noRefs ? 'skip' : statusOf(formatFindings), findings: formatFindings,
      summary: noRefs ? msg('apa.sumNoEntries') : formatFindings.length ? msg('apa.sumFormat', { n: formatFindings.length, entries: refs.length }) : msg('apa.sumFormatOk', { n: refs.length }) },
  ];
}
