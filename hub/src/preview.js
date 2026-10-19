/**
 * preview.js – miniature of a tool's real interface (title bar, input row, list) for the catalog cards.
 * Pure string output so the build script (Node) and hub.js (browser) render identical markup.
 * Kinds: list | ledger | habits | links | qr | check | pages. Purely decorative: text is drawn as bars, no copy to translate.
 */
export const PREVIEW_KINDS = ['list', 'ledger', 'habits', 'links', 'qr', 'check', 'pages'];

const bar = (w, cls = '') => `<i class="pv-bar ${cls}" style="width:${w}%"></i>`;
const DAYS = [[1, 1, 0, 1, 1, 1, 0], [1, 1, 1, 1, 0, 1, 1], [0, 1, 1, 0, 1, 1, 1]];

const QR = [1,1,1,0,1,1,1, 1,0,1,1,1,0,1, 1,1,1,0,1,1,1, 0,1,0,1,0,1,0, 1,1,0,1,1,0,1, 1,0,1,0,0,1,1, 1,1,1,1,0,1,0];

const ROWS = {
  pages: () => `<li class="pv-pageswrap">${[0, 1, 2, 3].map((i) => `<span class="pv-page${i === 1 ? ' is-on' : ''}"><i class="pv-bar" style="width:${[70, 55, 80, 45][i]}%"></i><i class="pv-bar" style="width:${[50, 70, 40, 60][i]}%"></i></span>`).join('')}</li>`,
  qr: () => `<li class="pv-qrwrap"><span class="pv-qr">${QR.map((on) => `<i class="pv-q${on ? ' is-on' : ''}"></i>`).join('')}</span></li>`,
  list: () => [64, 82, 48].map((w) => `<li class="pv-row">${bar(w)}<i class="pv-ghost"></i></li>`).join(''),
  ledger: () => [46, 66, 38].map((w, i) => `<li class="pv-row">${bar(w)}<i class="pv-amount" style="width:${[22, 30, 18][i]}%"></i></li>`).join(''),
  habits: () => DAYS.map((d, i) => `<li class="pv-row">${bar([40, 52, 34][i])}<span class="pv-dots">${d.map((on) => `<i class="pv-dot${on ? ' is-on' : ''}"></i>`).join('')}</span></li>`).join(''),
  check: () => [[58, 1], [74, 1], [46, 0]].map(([w, on]) => `<li class="pv-row">${bar(w)}<span class="pv-dots"><i class="pv-dot${on ? ' is-on' : ''}"></i></span></li>`).join(''),
  links: () => [58, 72, 44].map((w) => `<li class="pv-row"><i class="pv-fav"></i>${bar(w)}</li>`).join(''),
};

export function previewHtml(kind = 'list') {
  const rows = (ROWS[kind] ?? ROWS.list)();
  return '<div class="pv" aria-hidden="true">'
    + '<div class="pv-head"><i class="pv-mark"></i><i class="pv-pill"></i></div>'
    + (kind === 'qr' || kind === 'pages' ? '' : '<div class="pv-title"></div>')
    + '<div class="pv-form"><i class="pv-input"></i><i class="pv-btn"></i></div>'
    + `<ul class="pv-list">${rows}</ul></div>`;
}
