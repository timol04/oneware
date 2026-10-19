// Content types: what the code opens. Each type lists its form fields and builds the payload text.

// Maximum amount of data of a QR code (version 40, error correction M, byte mode).
export const MAX_BYTES = 2331;

const URL_WITH_SCHEME = /^https?:\/\/\S+$/i;
const BARE_DOMAIN = /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i;
const EMAIL = /^(mailto:)?[^\s@/]+@[^\s@/]+\.[a-z]{2,}$/i;

const bytes = (data) => new TextEncoder().encode(data).length;

/**
 * Detects what a single line is (used for CSV batches): { kind, data, bytes }.
 * kind: 'url' | 'email' | 'text'; links get https://, addresses get mailto:.
 */
export function analyze(text) {
  let kind = 'text';
  let data = text;
  if (URL_WITH_SCHEME.test(text)) kind = 'url';
  else if (EMAIL.test(text)) {
    kind = 'email';
    if (!/^mailto:/i.test(text)) data = `mailto:${text}`;
  } else if (BARE_DOMAIN.test(text)) {
    kind = 'url';
    data = `https://${text}`;
  }
  return { kind, data, bytes: bytes(data) };
}

/** File name base from the content, e.g. qr-your-shop-ch for https://www.your-shop.ch/menu. */
export function fileName({ kind, data }) {
  let base = '';
  if (kind === 'url' || kind === 'app') {
    try { base = new URL(data).hostname.replace(/^www\./, ''); } catch { /* invalid URL */ }
  } else if (kind === 'email') {
    base = data.replace(/^mailto:/i, '').split(/[@?]/)[1] ?? '';
  } else if (kind !== 'text') {
    base = kind;
  }
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return slug ? `qr-${slug}` : 'qr-code';
}

const clean = (v) => (v ?? '').trim();
const withScheme = (v) => (URL_WITH_SCHEME.test(v) ? v : `https://${v}`);

/** Escapes the special characters of the WIFI: format. */
const wifiEscape = (v) => v.replace(/([\\;,:"])/g, '\\$1');
/** Escapes text values of vCard and iCalendar. */
const icsEscape = (v) => v.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([;,])/g, '\\$1');

/** datetime-local value ("2026-10-19T14:30") to iCalendar ("20261019T143000"). */
const icsDate = (v) => v.replace(/[-:]/g, '').replace(/^(\d{8}T\d{4})$/, '$100');

/**
 * Fields: { id, type?: 'text'|'password'|'email'|'tel'|'url'|'number'|'datetime-local'|'textarea'|'select',
 * required?, options?: [value, …] }. Labels and placeholders come from locales: `field.<type>.<id>`.
 * build(values) returns the payload or '' while the form is incomplete.
 */
export const TYPES = {
  url: {
    fields: [{ id: 'url', type: 'url', required: true }],
    build: (v) => (clean(v.url) && !/\s/.test(clean(v.url)) ? withScheme(clean(v.url)) : ''),
  },
  text: {
    fields: [{ id: 'text', type: 'textarea', required: true }],
    build: (v) => clean(v.text),
  },
  wifi: {
    fields: [
      { id: 'ssid', required: true },
      { id: 'password', type: 'password' },
      { id: 'security', type: 'select', options: ['WPA', 'WEP', 'nopass'] },
      { id: 'hidden', type: 'checkbox' },
    ],
    build: (v) => {
      const ssid = clean(v.ssid);
      if (!ssid) return '';
      const security = v.security || 'WPA';
      const pass = security === 'nopass' ? '' : v.password ?? '';
      return `WIFI:T:${security};S:${wifiEscape(ssid)};${pass ? `P:${wifiEscape(pass)};` : ''}${v.hidden ? 'H:true;' : ''};`;
    },
  },
  contact: {
    fields: [
      { id: 'first', required: true },
      { id: 'last' },
      { id: 'org' },
      { id: 'phone', type: 'tel' },
      { id: 'email', type: 'email' },
      { id: 'url', type: 'url' },
    ],
    build: (v) => {
      const first = clean(v.first);
      const last = clean(v.last);
      if (!first && !last) return '';
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${icsEscape(last)};${icsEscape(first)};;;`, `FN:${icsEscape(`${first} ${last}`.trim())}`];
      if (clean(v.org)) lines.push(`ORG:${icsEscape(clean(v.org))}`);
      if (clean(v.phone)) lines.push(`TEL:${clean(v.phone)}`);
      if (clean(v.email)) lines.push(`EMAIL:${clean(v.email)}`);
      if (clean(v.url)) lines.push(`URL:${withScheme(clean(v.url))}`);
      lines.push('END:VCARD');
      return lines.join('\n');
    },
  },
  email: {
    fields: [
      { id: 'to', type: 'email', required: true },
      { id: 'subject' },
      { id: 'body', type: 'textarea' },
    ],
    build: (v) => {
      const to = clean(v.to);
      if (!EMAIL.test(to)) return '';
      const params = [];
      if (clean(v.subject)) params.push(`subject=${encodeURIComponent(clean(v.subject))}`);
      if (clean(v.body)) params.push(`body=${encodeURIComponent(clean(v.body))}`);
      return `mailto:${to.replace(/^mailto:/i, '')}${params.length ? `?${params.join('&')}` : ''}`;
    },
  },
  phone: {
    fields: [{ id: 'phone', type: 'tel', required: true }],
    build: (v) => {
      const n = clean(v.phone).replace(/[\s().-]/g, '');
      return /^\+?\d{3,}$/.test(n) ? `tel:${n}` : '';
    },
  },
  sms: {
    fields: [
      { id: 'phone', type: 'tel', required: true },
      { id: 'message', type: 'textarea' },
    ],
    build: (v) => {
      const n = clean(v.phone).replace(/[\s().-]/g, '');
      return /^\+?\d{3,}$/.test(n) ? `SMSTO:${n}:${clean(v.message)}` : '';
    },
  },
  location: {
    fields: [
      { id: 'lat', type: 'text', required: true },
      { id: 'lng', type: 'text', required: true },
    ],
    build: (v) => {
      const lat = Number(clean(v.lat).replace(',', '.'));
      const lng = Number(clean(v.lng).replace(',', '.'));
      if (!clean(v.lat) || !clean(v.lng) || !Number.isFinite(lat) || !Number.isFinite(lng)) return '';
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return '';
      return `geo:${lat},${lng}`;
    },
  },
  event: {
    fields: [
      { id: 'title', required: true },
      { id: 'start', type: 'datetime-local', required: true },
      { id: 'end', type: 'datetime-local' },
      { id: 'place' },
      { id: 'notes', type: 'textarea' },
    ],
    build: (v) => {
      if (!clean(v.title) || !clean(v.start)) return '';
      const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `SUMMARY:${icsEscape(clean(v.title))}`, `DTSTART:${icsDate(v.start)}`];
      if (clean(v.end)) lines.push(`DTEND:${icsDate(v.end)}`);
      if (clean(v.place)) lines.push(`LOCATION:${icsEscape(clean(v.place))}`);
      if (clean(v.notes)) lines.push(`DESCRIPTION:${icsEscape(clean(v.notes))}`);
      lines.push('END:VEVENT', 'END:VCALENDAR');
      return lines.join('\n');
    },
  },
  app: {
    fields: [{ id: 'store', type: 'url', required: true }],
    build: (v) => {
      const raw = clean(v.store);
      if (!raw || /\s/.test(raw)) return '';
      const url = withScheme(raw);
      try {
        const host = new URL(url).hostname;
        return /(^|\.)(apps\.apple\.com|itunes\.apple\.com|play\.google\.com)$/.test(host) ? url : '';
      } catch { return ''; }
    },
  },
};

export const TYPE_IDS = Object.keys(TYPES);

/** Builds { kind, data, bytes } for a type and its form values, or null while incomplete. */
export function build(kind, values) {
  const data = TYPES[kind].build(values);
  return data ? { kind, data, bytes: bytes(data) } : null;
}
