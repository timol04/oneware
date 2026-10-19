// Category bars and the 12-month chart, built with DOM calls (no innerHTML, no user data in markup).
import { t, getLang } from '../../../core/i18n.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Horizontal bars per category. `rows` = [{ category, amount, share }]. */
export function categoryChart(rows, money) {
  const list = el('ul', 'ex-cats-list');
  for (const r of rows) {
    const li = el('li', 'ex-cat');
    const row = el('div', 'ex-cat__row');
    row.append(el('span', '', t(`ex.cat.${r.category}`)), el('b', '', `${money(r.amount)} · ${Math.round(r.share * 100)}%`));
    const track = el('div', 'ex-cat__track');
    const fill = el('span', 'ex-cat__fill');
    fill.style.width = `${Math.max(2, r.share * 100)}%`;
    track.append(fill);
    li.append(row, track);
    list.append(li);
  }
  return list;
}

/** Paired bars for the last 12 months. `series` = [{ month: 'YYYY-MM', income, expense }], `avg` = { months, income, expense }. */
export function monthsChart(series, avg, money) {
  const max = Math.max(...series.flatMap((m) => [m.income, m.expense]));
  const wrap = el('div');
  if (!max) { wrap.append(el('p', 'ow-muted', t('ex.chart.noData'))); return wrap; }
  const fmt = new Intl.DateTimeFormat(getLang(), { month: 'long', year: 'numeric' });
  const short = new Intl.DateTimeFormat(getLang(), { month: 'narrow' });
  const at = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1));
  const bars = el('ul', 'ex-bars');
  bars.setAttribute('aria-label', t('ex.chart.months'));
  const axis = el('ul', 'ex-axis');
  axis.setAttribute('aria-hidden', 'true');
  series.forEach((m, i) => {
    const li = el('li', 'ex-col');
    const label = t('ex.chart.monthsLabel', { month: fmt.format(at(m.month)), income: money(m.income), expense: money(m.expense) });
    li.tabIndex = 0;
    li.setAttribute('aria-label', label);
    li.dataset.now = String(i === series.length - 1);
    li.style.setProperty('--h', `${(Math.max(m.income, m.expense) / max) * 100}%`);
    const out = el('span', 'ex-col__bar');
    out.style.height = `${(m.expense / max) * 100}%`;
    const inn = el('span', 'ex-col__bar ex-col__bar--in');
    inn.style.height = `${(m.income / max) * 100}%`;
    li.append(el('span', 'ex-col__val', label), out, inn);
    bars.append(li);
    const tick = el('li');
    tick.append(el('span', '', short.format(at(m.month)).toUpperCase()));
    axis.append(tick);
  });
  const legend = el('ul', 'ex-legend');
  for (const key of ['ex.expenses', 'ex.income']) {
    const li = el('li');
    li.append(el('i'), document.createTextNode(t(key)));
    legend.append(li);
  }
  wrap.append(bars, axis, legend, el('p', 'ex-avg ow-muted', t('ex.chart.average', { income: money(avg.income), expense: money(avg.expense) })));
  return wrap;
}
