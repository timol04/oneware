// Pure receipt parsing: turns OCR text into a suggested booking (amount, date, merchant, category, currency). No DOM, no OCR.
// OCR output is noisy, so every field is a suggestion that may be null; the user always checks it before saving.
import { isISODate, todayISO } from './expenses.js';

const AMOUNT = /(\d{1,3}(?:[ '’.,]\d{3})+|\d+)\s?[.,]\s?(\d{2})(?!\d)/g;
const TOTAL = /\b(gesamt\w*|summe|total|totale|zu zahlen|zahlbetrag|endbetrag|rechnungsbetrag|betrag|amount due|balance due|grand total|à payer|a payer|importo|to pay)\b/i;
const NOT_TOTAL = /(zwischen|sub\s?-?total|mwst|mw\.?st|ust\b|vat|tax|steuer|tva|iva|rabatt|discount|rückgeld|rueckgeld|change|wechselgeld|gegeben|bar\b|cash|punkte|points)/i;
const MONTHS = { jan: 1, feb: 2, mar: 3, mär: 3, maer: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12 };
const SKIP_LINE = /(kassenbon|kassenzettel|quittung|rechnung|receipt|invoice|beleg|datum|date|tel\b|telefon|www\.|\.com|\.ch|@|mwst|uid|chf|eur|total|summe|strasse|str\.|platz|gasse|weg\b)/i;

const CATEGORY_HINTS = [
  ['groceries', /(migros|coop|denner|aldi|lidl|spar\b|volg|rewe|edeka|kaufland|carrefour|tesco|supermarkt|supermarket)/i],
  ['eating', /(restaurant|café|cafe|bistro|pizz|kebab|bäckerei|baeckerei|bakery|starbucks|mcdonald|burger|imbiss|bar\b)/i],
  ['transport', /(sbb|bahn|tankstelle|shell|esso|avia|bp\b|parkhaus|parking|taxi|uber|tankstop)/i],
  ['health', /(apotheke|pharmacy|arzt|zahnarzt|drogerie|dm\b)/i],
  ['bills', /(versicherung|insurance|swisscom|sunrise|salt\b|strom|elektrizit)/i],
  ['shopping', /(ikea|h&m|zara|manor|interdiscount|digitec|galaxus|mediamarkt|amazon|jumbo)/i],
];

const clean = (s) => s.replace(/\s+/g, ' ').trim();

/** "1'234,50" / "12.90" / "1.234,50" to a number; null if it is not a plausible amount. */
function toNumber(whole, cents) {
  const n = Number(`${whole.replace(/[ '’.,]/g, '')}.${cents}`);
  return Number.isFinite(n) && n > 0 && n < 1e7 ? n : null;
}

function amountsIn(line) {
  const out = [];
  for (const m of line.matchAll(AMOUNT)) {
    const n = toNumber(m[1], m[2]);
    if (n !== null) out.push(n);
  }
  return out;
}

/** Total of the receipt: the biggest amount on a "total" line (not subtotal, VAT or change), else the biggest amount overall. */
export function findAmount(lines) {
  const totals = [];
  lines.forEach((line, i) => {
    if (!TOTAL.test(line) || NOT_TOTAL.test(line.replace(TOTAL, ''))) return;
    // the figure is on the same line or, on narrow receipts, on the next one
    const found = amountsIn(line);
    totals.push(...(found.length ? found : amountsIn(lines[i + 1] ?? '')));
  });
  if (totals.length) return Math.max(...totals);
  const all = lines.flatMap((line) => (NOT_TOTAL.test(line) ? [] : amountsIn(line)));
  return all.length ? Math.max(...all) : null;
}

function toISO(y, m, d) {
  const year = y < 100 ? 2000 + y : y;
  const iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isISODate(iso) ? iso : null;
}

/** First plausible date (2000 up to tomorrow) in the text; day-first, as on Swiss and European receipts. */
export function findDate(text, today = todayISO()) {
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 1);
  const max = limit.toISOString().slice(0, 10);
  const candidates = [];
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) candidates.push([m.index, toISO(+m[1], +m[2], +m[3])]);
  for (const m of text.matchAll(/\b(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{4}|\d{2})\b/g)) {
    let [d, mo] = [+m[1], +m[2]];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // month-first (US) receipts
    candidates.push([m.index, toISO(+m[3], mo, d)]);
  }
  for (const m of text.matchAll(/\b(\d{1,2})\.?\s?([A-Za-zäÄ]{3,5})\.?\s?(\d{4})\b/g)) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) candidates.push([m.index, toISO(+m[3], mo, +m[1])]);
  }
  const valid = candidates.filter(([, iso]) => iso && iso >= '2000-01-01' && iso <= max).sort((a, b) => a[0] - b[0]);
  return valid.length ? valid[0][1] : null;
}

/** Merchant: the first of the top lines that looks like a name (letters, not an address, date or keyword). */
export function findMerchant(lines) {
  for (const line of lines.slice(0, 8)) {
    const letters = (line.match(/\p{L}/gu) ?? []).length;
    if (letters < 3 || letters < line.length * 0.5 || SKIP_LINE.test(line)) continue;
    return clean(line.replace(/[^\p{L}\p{N}&'.,\- ]/gu, ' ')).slice(0, 60);
  }
  return null;
}

export function findCurrency(text) {
  if (/\bCHF\b|\bFr\.\s?\d/i.test(text)) return 'CHF';
  if (/€|\bEUR\b/i.test(text)) return 'EUR';
  if (/£|\bGBP\b/i.test(text)) return 'GBP';
  if (/\$|\bUSD\b/i.test(text)) return 'USD';
  return null;
}

export function guessCategory(merchant, text = '') {
  const hay = `${merchant ?? ''} ${text.slice(0, 200)}`;
  return CATEGORY_HINTS.find(([, re]) => re.test(hay))?.[0] ?? null;
}

/** OCR text to { amount, date, merchant, category, currency }; fields that were not found are null. */
export function parseReceipt(text, today = todayISO()) {
  const lines = String(text ?? '').split(/\r?\n/).map(clean).filter(Boolean);
  const merchant = findMerchant(lines);
  return {
    amount: findAmount(lines),
    date: findDate(lines.join('\n'), today),
    merchant,
    category: guessCategory(merchant, lines.join(' ')),
    currency: findCurrency(lines.join(' ')),
  };
}
