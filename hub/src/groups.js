/** groups.js – Apps (personal tools that keep data) and Utilities (single-purpose tools). Shared by home, dashboard and build. */
export const KINDS = ['app', 'utility'];
export const kindOf = (tool) => (KINDS.includes(tool.kind) ? tool.kind : 'app');

/** [{ kind, items }] in display order, empty groups left out. */
export function groupTools(tools) {
  return KINDS.map((kind) => ({ kind, items: tools.filter((x) => kindOf(x) === kind) })).filter((g) => g.items.length);
}
