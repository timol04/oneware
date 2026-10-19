// What can be converted into what. Only conversions that work reliably in the browser are listed.
export const KINDS = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
  text: ['txt'],
  markdown: ['md', 'markdown'],
  docx: ['docx'],
  pdf: ['pdf'],
};

export const TARGETS = {
  image: ['png', 'jpg', 'webp', 'pdf'],
  text: ['pdf', 'docx', 'md', 'html'],
  markdown: ['pdf', 'docx', 'txt', 'html'],
  docx: ['txt', 'md', 'html', 'pdf'],
  pdf: ['txt', 'md', 'docx', 'png', 'jpg'],
};

export const MIME = {
  png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf',
  txt: 'text/plain;charset=utf-8', md: 'text/markdown;charset=utf-8', html: 'text/html;charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip',
};

export const extOf = (name) => (/\.([^.\\/]+)$/.exec(name)?.[1] ?? '').toLowerCase();
export const stemOf = (name) => name.replace(/\.[^.\\/]*$/, '') || name;

export function kindOf(name) {
  const ext = extOf(name);
  return Object.keys(KINDS).find((k) => KINDS[k].includes(ext)) ?? null;
}

/** Targets that every given kind can produce, without converting a format into itself. */
export function commonTargets(files) {
  const kinds = [...new Set(files.map((f) => f.kind))];
  if (!kinds.length) return [];
  let list = TARGETS[kinds[0]];
  for (const k of kinds.slice(1)) list = list.filter((t) => TARGETS[k].includes(t));
  const norm = (e) => ({ jpeg: 'jpg', markdown: 'md' }[e] ?? e);
  return list.filter((t) => files.some((f) => norm(extOf(f.name)) !== t));
}
