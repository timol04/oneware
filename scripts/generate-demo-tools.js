#!/usr/bin/env node
/**
 * Dev helper: (re)creates the demo tools in tools/ from tools/_demo.
 * Run: node scripts/generate-demo-tools.js   (then: npm run build-registry)
 * _demo is the copy-paste template for real tools; the generated demo-* tools only exist to fill the hub.
 */
import { cp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';

const feat = {
  free: [{ en: 'Up to 3 entries', de: 'Bis zu 3 Einträge' }, { en: 'Backup export and import', de: 'Backup-Export und -Import' }],
  premium: [{ en: 'Unlimited entries', de: 'Unbegrenzt viele Einträge' }],
};
const tools = [
  { slug: 'demo-notes', icon: 'note', price: 'CHF 3.-', order: 10, accent: { light: '#2433e8', dark: '#93a0ff' },
    name: { en: 'Demo: Notes', de: 'Demo: Notizen' }, desc: { en: 'Quick notes, stored locally.', de: 'Schnelle Notizen, lokal gespeichert.' },
    en: { heading: 'Notes', ph: 'New note' }, de: { heading: 'Notizen', ph: 'Neue Notiz' } },
  { slug: 'demo-expenses', icon: 'wallet', price: 'CHF 5.-', order: 20, accent: { light: '#d9480f', dark: '#f0a07a' },
    name: { en: 'Demo: Expenses', de: 'Demo: Ausgaben' }, desc: { en: 'Log expenses without an account.', de: 'Ausgaben festhalten, ohne Konto.' },
    en: { heading: 'Expenses', ph: 'Expense (e.g. coffee 4.50)' }, de: { heading: 'Ausgaben', ph: 'Ausgabe (z. B. Kaffee 4.50)' } },
  { slug: 'demo-habits', icon: 'check', price: 'CHF 5.-', order: 30, accent: { light: '#07793c', dark: '#62b98a' },
    name: { en: 'Demo: Habit tracker', de: 'Demo: Habit-Tracker' }, desc: { en: 'Follow your habits over time.', de: 'Gewohnheiten über die Zeit verfolgen.' },
    en: { heading: 'Habits', ph: 'New habit' }, de: { heading: 'Gewohnheiten', ph: 'Neue Gewohnheit' } },
  { slug: 'demo-bookmarks', icon: 'bookmark', price: 'CHF 4.-', order: 40, accent: { light: '#9333ea', dark: '#c4a0f5' },
    name: { en: 'Demo: Bookmarks', de: 'Demo: Lesezeichen' }, desc: { en: 'Collect links and find them again.', de: 'Links sammeln und wiederfinden.' },
    en: { heading: 'Bookmarks', ph: 'New link' }, de: { heading: 'Lesezeichen', ph: 'Neuer Link' }, soon: true },
];

const demoLines = async (lang) => (await readFile(`tools/_demo/src/locales/${lang}.js`, 'utf8')).split('\n').filter((l) => l.includes("'demo."));
const locale = async (lang, d) => `export default {\n  'tool.heading': ${JSON.stringify(d.heading)},\n  'tool.placeholder': ${JSON.stringify(d.ph)},\n${(await demoLines(lang)).join('\n')}\n};\n`;

for (const t of tools) {
  const dir = `tools/${t.slug}`;
  await mkdir(dir, { recursive: true });
  if (!t.soon) {
    await rm(`${dir}/src`, { recursive: true, force: true });
    await cp('tools/_demo/src', `${dir}/src`, { recursive: true });
    const app = await readFile(`${dir}/src/app.js`, 'utf8');
    await writeFile(`${dir}/src/app.js`, app.replace("'_demo'", `'${t.slug}'`));
    for (const l of ['en', 'de']) await writeFile(`${dir}/src/locales/${l}.js`, await locale(l, t[l]));
    const title = `${t.name.en} – oneware`;
    let html = await readFile('tools/_demo/index.html', 'utf8');
    html = html.replaceAll('Demo tool – oneware', title).replace('Demo tool: shows license, storage and UI of the core library.', t.desc.en)
      .replace('data-i18n="tool.heading">Notes<', `data-i18n="tool.heading">${t.en.heading}<`);
    await writeFile(`${dir}/index.html`, html);
  }
  await writeFile(`${dir}/tool.config.json`, JSON.stringify({
    slug: t.slug, name: t.name, shortDescription: t.desc, category: 'demo', status: t.soon ? 'coming-soon' : 'live',
    icon: t.icon, price: t.price, order: t.order, accent: t.accent, hasPremium: true, stores: true,
    about: { en: `${t.desc.en} A demo tool that shows how a tool looks inside the shared frame.`, de: `${t.desc.de} Ein Demo-Tool, das zeigt, wie ein Tool im gemeinsamen Rahmen aussieht.` },
    features: feat, purchaseUrl: 'https://example.com/lemon-squeezy-link',
  }, null, 2) + '\n');
}
