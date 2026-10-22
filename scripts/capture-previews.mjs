/**
 * capture-previews.mjs – takes the screenshots used on the home page cards (hub/assets/previews/<slug>-<theme>.webp).
 * They show the real tools filled with example data. Run when a tool's look changes:
 *   python3 -m http.server 8123   (in the repo root, after npm run build-registry)
 *   node scripts/capture-previews.mjs [slug ...]
 * Needs Playwright and Pillow (python3) installed on your machine; neither is a dependency of the site.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(process.env.PLAYWRIGHT_DIR ?? '/opt/node-tools/');
const { chromium } = require('playwright');
const BASE = process.env.BASE ?? 'http://localhost:8123';
const OUT = new URL('../hub/assets/previews/', import.meta.url).pathname;
const TMP = join(tmpdir(), 'ow-previews');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const now = Date.now();

// Each seed runs in the page and returns after saving items. `pick` is the list row to open afterwards.
const SEEDS = {
  notes: { pick: '.nt-item, [data-id]', run: async (s, m) => {
    const n = (title, body, extra = {}) => ({ ...m.newNote(), title, body, ...extra });
    await s.saveItem('notes', n('Weekend trip', '## Packing\n- Passport\n- Rain jacket\n- Charger\n\nTrain leaves at **08:12**.', { tags: ['travel'], color: 'blue', pinned: true }));
    await s.saveItem('notes', n('Ideas for the garden', 'Herbs on the balcony, a small compost bin, tomatoes in May.', { tags: ['home'], color: 'green' }));
    await s.saveItem('notes', n('Meeting notes', '- Decide on the new schedule\n- Send the summary on Friday', { tags: ['work'] }));
    await s.saveItem('notes', n('Recipe: lentil soup', 'Onion, carrots, red lentils, cumin. Simmer for 25 minutes.', { tags: ['food'], color: 'orange' }));
  } },
  checklists: { pick: '[data-id]', run: async (s, m) => {
    const L = (title, items, pinned = false) => ({ ...m.newList(), title, pinned, items: items.map(([t, done, due]) => ({ ...m.newItem(t, due), done })) });
    const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return m.isoDate(x); };
    await s.saveItem('checklists', L('Moving day', [['Book the van', true, d(-2)], ['Pack the kitchen', false, d(0)], ['Cancel the old internet', false, d(3)], ['Change address at the bank', false, d(5)]], true));
    await s.saveItem('checklists', L('Groceries', [['Oats', false, d(0)], ['Tomatoes', true, d(0)], ['Coffee', false, d(0)]]));
    await s.saveItem('checklists', L('Weekly review', [['Clear the inbox', false, d(1)], ['Plan next week', false, d(2)]]));
  } },
  habits: { pick: '[data-id]', run: async (s, m) => {
    const H = (title, offsets) => { const h = { ...m.newHabit(), title }; for (const o of offsets) h.done[m.isoDate(new Date(Date.now() - o * 864e5))] = true; return h; };
    await s.saveItem('habits', H('Morning run', [0, 1, 2, 3, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20]));
    await s.saveItem('habits', H('Read 20 pages', [0, 1, 2, 4, 5, 6, 8, 9, 10, 11, 14, 15]));
    await s.saveItem('habits', H('Drink water', [0, 1, 3, 4, 5, 7, 8, 9, 10, 12, 13]));
  } },
  'abo-tracker': { pick: null, run: async (s, m) => {
    const S = (name, cycle, price, category, start) => ({ ...m.newSub(), name, cycle, category, start, prices: [{ from: start, price }], periods: [{ from: start, to: null }] });
    await s.saveItem('abo-tracker', S('Music streaming', 'monthly', 10.9, 'music', day(-200)));
    await s.saveItem('abo-tracker', S('Cloud storage', 'yearly', 29.9, 'cloud', day(-120)));
    await s.saveItem('abo-tracker', S('Gym', 'monthly', 49, 'fitness', day(-300)));
    await s.saveItem('abo-tracker', S('Newspaper', 'monthly', 12, 'news', day(-90)));
  } },
  readlist: { pick: '[data-id]', run: async (s, m) => {
    const E = (title, type, status, creator, extra = {}) => ({ ...m.newEntry(type), title, status, creator, ...extra });
    await s.saveItem('readlist', E('The Overstory', 'book', 'doing', 'Richard Powers', { current: 212, total: 640 }));
    await s.saveItem('readlist', E('Perfect Days', 'film', 'done', 'Wim Wenders', { rating: 5 }));
    await s.saveItem('readlist', E('Why we sleep', 'article', 'todo', ''));
    await s.saveItem('readlist', E('Dark', 'series', 'doing', '', { current: 6, total: 26 }));
  } },
  journal: { pick: '[data-id]', run: async (s, m) => {
    const J = (offset, title, body, mood, tags) => ({ ...m.newEntry(m.isoDate(new Date(Date.now() - offset * 864e5))), title, body, mood, tags });
    await s.saveItem('journal', J(0, 'A calm Thursday', 'Long walk after lunch, finished the draft, cooked something simple.\n\nGrateful for the quiet.', 4, ['walk']));
    await s.saveItem('journal', J(1, 'Busy day', 'Too many meetings. Short run in the evening helped.', 3, ['work']));
    await s.saveItem('journal', J(2, 'Visit', 'Dinner with friends, we laughed a lot.', 5, ['friends']));
    await s.saveItem('journal', J(4, 'Slow start', 'Slept badly. Tea and a book in the morning.', 2, []));
  } },
  expenses: { pick: null, run: async (s, m) => {
    const E = (type, amount, category, offset, note) => ({ ...m.newEntry(), type, amount, category, note, date: m.todayISO(new Date(Date.now() - offset * 864e5)) });
    const rows = [['income', 3800, 'salary', 4, 'Salary'], ['expense', 1450, 'housing', 4, 'Rent'], ['expense', 86.4, 'groceries', 3, 'Weekly shop'], ['expense', 24.5, 'eating', 2, 'Lunch'], ['expense', 61, 'transport', 2, 'Train pass'], ['expense', 39.9, 'leisure', 1, 'Cinema and dinner'], ['expense', 112.3, 'groceries', 8, 'Market'], ['expense', 95, 'bills', 6, 'Phone and internet']];
    for (const r of rows) await s.saveItem('expenses', E(...r));
  } },
  'qr-pro-studio': { pick: null, ui: async (p) => { await p.fill('#f-url-url', 'https://oneware.page'); await p.waitForTimeout(900); } },
  converter: { pick: null }, 'pdf-toolkit': { pick: null }, verifyxr: { pick: null },
};

const wanted = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
for (const slug of Object.keys(SEEDS)) {
  if (wanted.length && !wanted.includes(slug)) continue;
  for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', timezoneId: 'Europe/Zurich', colorScheme: theme });
    await ctx.addInitScript(([t]) => { try { localStorage.setItem('ow_theme', t); localStorage.setItem('oneware-licensing-preview', '0'); } catch {} }, [theme]);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/mydashboard/${slug}/`, { waitUntil: 'networkidle' });
    const seed = SEEDS[slug];
    if (seed.run) {
      await p.evaluate(async ([slug, src]) => {
        const st = await import('/core/storage.js');
        const modName = { 'abo-tracker': 'subs' }[slug] ?? slug;
        const mod = await import(`/tools/${slug}/src/${modName}.js`);
        await new Function('s', 'm', 'day', `return (${src})(s, m)`)(st, mod, null);
      }, [slug, seed.run.toString().replace(/\bday\(/g, '((n)=>{const d=new Date();d.setDate(d.getDate()+n);const q=(x)=>String(x).padStart(2,"0");return `${d.getFullYear()}-${q(d.getMonth()+1)}-${q(d.getDate())}`})(')]);
      await p.reload({ waitUntil: 'networkidle' });
      await p.waitForTimeout(500);
      if (seed.pick) { await p.locator(seed.pick).first().click().catch(() => {}); await p.waitForTimeout(400); }
    }
    if (seed.ui) await seed.ui(p);
    await p.locator('text=Dismiss').first().click({ timeout: 500 }).catch(() => {});
    await p.addStyleTag({ content: '.ow-notices{display:none!important}' });
    await p.waitForTimeout(300);
    const png = join(TMP, `${slug}-${theme}.png`);
    await p.screenshot({ path: png });
    execFileSync('python3', ['-c', `from PIL import Image;im=Image.open(${JSON.stringify(png)}).convert('RGB');im=im.resize((960,600),Image.LANCZOS);im.save(${JSON.stringify(join(OUT, `${slug}-${theme}.webp`))},quality=82,method=6)`]);
    await ctx.close();
  }
  console.log('ok', slug);
}
await b.close();
rmSync(TMP, { recursive: true, force: true });
