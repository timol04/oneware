// Analysis widgets built with DOM calls (no innerHTML, no user data in markup).
import { t, getLang } from '../../../core/i18n.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const SVG = 'http://www.w3.org/2000/svg';

/** Bars for the last 12 months. `series` = [{ month: 'YYYY-MM', total }], `money` formats an amount. */
export function monthsChart(series, money) {
  const max = Math.max(...series.map((m) => m.total));
  const wrap = el('div');
  if (!max) { wrap.append(el('p', 'ow-muted', t('ab.chart.noData'))); return wrap; }
  const fmt = new Intl.DateTimeFormat(getLang(), { month: 'long', year: 'numeric' });
  const short = new Intl.DateTimeFormat(getLang(), { month: 'narrow' });
  const at = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1));
  const bars = el('ul', 'ab-bars');
  bars.setAttribute('aria-label', t('ab.chart.months'));
  const axis = el('ul', 'ab-axis');
  axis.setAttribute('aria-hidden', 'true');
  series.forEach((m, i) => {
    const li = el('li', 'ab-col');
    const label = t('ab.chart.monthsLabel', { month: fmt.format(at(m.month)), amount: money(m.total) });
    li.tabIndex = 0;
    li.setAttribute('aria-label', label);
    li.dataset.now = String(i === series.length - 1);
    const pct = (m.total / max) * 100;
    li.style.setProperty('--h', `${pct}%`);
    const bar = el('span', 'ab-col__bar');
    bar.style.height = `${pct}%`;
    li.append(el('span', 'ab-col__val', label), bar);
    bars.append(li);
    const tick = el('li');
    tick.append(el('span', '', short.format(at(m.month)).toUpperCase()));
    axis.append(tick);
  });
  const peak = series.reduce((a, b) => (b.total > a.total ? b : a));
  wrap.append(bars, axis, el('p', 'ab-peak ow-muted', `${fmt.format(at(peak.month))}: ${money(peak.total)}`));
  return wrap;
}

/** Horizontal bars per category. `rows` = [{ category, monthly, share }]. */
export function categoryChart(rows, money) {
  const list = el('ul', 'ab-cats');
  for (const r of rows) {
    const li = el('li', 'ab-cat');
    const row = el('div', 'ab-cat__row');
    row.append(el('span', '', t(`ab.cat.${r.category}`)), el('b', '', `${money(r.monthly)} · ${Math.round(r.share * 100)}%`));
    const track = el('div', 'ab-cat__track');
    const fill = el('span', 'ab-cat__fill');
    fill.style.width = `${Math.max(2, r.share * 100)}%`;
    track.append(fill);
    li.append(row, track);
    list.append(li);
  }
  return list;
}

/** Small step line of a subscription's prices over time. */
function sparkline(prices) {
  const w = 84;
  const h = 26;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ab-spark');
  const values = prices.map((p) => p.price);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const y = (v) => (hi === lo ? h / 2 : h - 3 - ((v - lo) / (hi - lo)) * (h - 6));
  const step = w / prices.length;
  let d = '';
  prices.forEach((p, i) => { d += `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${y(p.price).toFixed(1)}L${((i + 1) * step - (i === prices.length - 1 ? 2 : 0)).toFixed(1)} ${y(p.price).toFixed(1)}`; });
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  return svg;
}

/** Price changes. `rows` = [{ sub, first, last, change }]. */
export function priceList(rows, money) {
  const list = el('ul', 'ab-prices');
  const pct = new Intl.NumberFormat(getLang(), { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' });
  for (const r of rows) {
    const li = el('li', 'ab-price');
    const change = el('span', 'ab-price__pct', pct.format(r.change));
    change.dataset.up = String(r.change > 0);
    li.append(
      el('span', 'ab-price__name', r.sub.name),
      change,
      el('span', 'ab-price__txt', t('ab.chart.priceChange', { from: money(r.first), to: money(r.last) })),
      sparkline(r.sub.prices),
    );
    list.append(li);
  }
  return list;
}
