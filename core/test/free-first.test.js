// Free-first rule: tools without Premium carry no limits, prices or purchase paths; tools with Premium keep their locks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8');
const config = (slug) => JSON.parse(read('tools', slug, 'tool.config.json'));
const FREE = ['notes', 'checklists', 'habits', 'journal', 'readlist'];
const PREMIUM = ['expenses', 'abo-tracker', 'converter', 'pdf-toolkit', 'qr-pro-studio', 'verifyxr'];

const sources = (slug) => {
  const dir = path.join(root, 'tools', slug, 'src');
  return readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => [f, read('tools', slug, 'src', f)]);
};

test('tools without Premium are exactly the five fully free tools', () => {
  const noPremium = readdirSync(path.join(root, 'tools')).filter((d) => !d.startsWith('_') && config(d).hasPremium === false).sort();
  assert.deepEqual(noPremium, [...FREE].sort());
});

for (const slug of FREE) {
  test(`${slug}: no limit, no premium list, no purchase code`, () => {
    const cfg = config(slug);
    assert.equal(cfg.countLimit, undefined);
    assert.deepEqual(cfg.features.premium, []);
    for (const [file, code] of sources(slug)) {
      assert.doesNotMatch(code, /atLimit|FREE_LIMIT|showLimit|setPremiumLimit|openLicense|isPremiumUnlocked|markPremium|isPremium\b/, `${slug}/src/${file}`);
    }
    assert.doesNotMatch(read('tools', slug, 'index.html'), /data-premium/);
    const texts = JSON.stringify(cfg) + sources(slug).map(([, c]) => c).join('') + read('tools', slug, 'src', 'locales', 'en.js') + read('tools', slug, 'src', 'locales', 'de.js');
    assert.doesNotMatch(texts, /free limit|Gratis-Limit|free (notes|checklists|habits|entries) used|Up to \d+ |Bis zu \d+ /i, slug);
  });

  test(`${slug}: public registry carries no price or purchase data`, () => {
    const entry = JSON.parse(read('hub', 'tool-registry.json')).find((x) => x.slug === slug);
    assert.ok(entry);
    for (const k of ['price', 'purchaseUrl', 'lemonSqueezy']) assert.equal(entry[k], undefined, `${slug}.${k}`);
  });
}

test('tools with Premium keep price and purchase data in the registry', () => {
  const registry = JSON.parse(read('hub', 'tool-registry.json'));
  for (const slug of PREMIUM) {
    const entry = registry.find((x) => x.slug === slug);
    assert.ok(entry.price && entry.purchaseUrl && entry.lemonSqueezy?.productId, slug);
    assert.ok(config(slug).features.premium.length > 0, slug);
  }
});

test('Premium locks of the other tools are still in place', async () => {
  const conv = await import(path.join(root, 'tools/converter/src/config.js'));
  assert.equal(conv.PREMIUM_FEATURES.batch, true);
  const pdf = await import(path.join(root, 'tools/pdf-toolkit/src/config.js'));
  assert.equal(pdf.PREMIUM_FEATURES.compressStrong, true);
  assert.equal(pdf.PREMIUM_FEATURES.splitMany, true);
  assert.match(read('tools/pdf-toolkit/src/app.js'), /\$\('level'\)\.value !== 'lossless' && locked\('compressStrong'\)/);
  assert.match(read('tools/pdf-toolkit/src/app.js'), /groups\.length > 1 && locked\('splitMany'\)/);
  const vx = await import(path.join(root, 'tools/verifyxr/src/config.js'));
  assert.deepEqual([vx.PREMIUM_FEATURES.apa, vx.PREMIUM_FEATURES.batch, vx.PREMIUM_FEATURES.fix, vx.PREMIUM_FEATURES.profiles, vx.PREMIUM_FEATURES.pdf], [true, true, true, false, false]);
  for (const slug of ['expenses', 'abo-tracker']) assert.match(read('tools', slug, 'src/app.js'), /function renderAnalysis[\s\S]*?if \(!premium\(\)\)/, slug);
});

test('QR Pro Studio: SVG and logo in the center are free, the rest stays Premium', () => {
  const app = read('tools/qr-pro-studio/src/app.js');
  const html = read('tools/qr-pro-studio/index.html');
  assert.match(app, /FREE_FORMATS = \['png', 'svg'\]/);
  assert.match(app, /logoMode: 'center'/);
  assert.match(app, /dataset\.logomode === 'shape' && gated\(\)/);
  assert.match(app, /Array\.isArray\(swatch\.color\) && gated\(\)/);
  assert.match(app, /\$\('csv-btn'\)\.addEventListener\('click', \(\) => \{ if \(!gated\(\)\)/);
  assert.doesNotMatch(html.match(/<div class="qr-row"[^>]*>\s*<span class="qr-row__label"><span data-i18n="row\.logo"/)?.[0] ?? 'x', /data-premium/);
  assert.match(html, /<div class="qr-row" data-premium>\s*<span class="qr-row__label"><span data-i18n="row\.sticker"/);
});

test('shell: stored keys are only re-checked for tools with Premium functions', () => {
  assert.match(read('core/tool-shell.js'), /if \(config\.hasPremium\) \{\s*const checkLicense/);
});
