# Oneware

Monorepo for a family of small, client-side web tools (no backend). Pay once, unlock with a license key.

```
index.html           home page (hero, tool catalog, how it works)
how-it-works/        explainer page; legal/imprint/, legal/privacy/; 404.html
core/                shared library
  license.js storage.js persistence.js   license keys, IndexedDB, backup reminders
  i18n.js locales/ theme.js icons.js     languages, themes, SVG icons
  site-shell.js tool-shell.js            header/footer for pages and the frame around every tool
  ui-components.css/js                   tokens, components, dialog, toast
  ui-desktop.css ui-mobile.css           layout per device (imported by ui-components.css)
hub/                 tool-registry.json (generated) and the home page scripts/styles
tools/               one folder per tool (tool.config.json + index.html + src/); published at /mydashboard/[slug]/
scripts/             build-tool-registry.js, generate-demo-tools.js
```

## Commands

| Command | Purpose |
|---|---|
| `npm install` | dev dependency for tests (fake-indexeddb) |
| `npm test` | core tests (license, storage, i18n, locale key parity, backup reminders) |
| `npm run build-registry` | generates `hub/tool-registry.json` from all `tools/*/tool.config.json` and mirrors each tool to `mydashboard/[slug]/` (git-ignored; run it before previewing locally). CI runs it with `--publish`, which also turns `tools/[slug]/index.html` into a redirect so old links keep working |

View locally: run `python3 -m http.server` in the repo root, then open `http://localhost:8000/`. ES modules need a server; `file://` does not work.

## Creating a new tool

1. Create the folder `tools/[new-slug]/` (easiest: copy `tools/_demo/`, which is the template).
2. Fill in `tool.config.json`:
   ```json
   {
     "slug": "sub-tracker",
     "name": { "en": "Subscription tracker", "de": "Abo-Tracker" },
     "shortDescription": { "en": "All your subscriptions at a glance.", "de": "Alle Abos im Überblick." },
     "category": "tracker",
     "status": "live",
     "icon": "wallet",
     "price": "CHF 5.-",
     "order": 10,
     "accent": { "light": "#c2410c", "dark": "#f0a07a" },
     "hasPremium": true,
     "stores": true,
     "about": { "en": "Two sentences about what it does.", "de": "…" },
     "features": {
       "free": [{ "en": "Up to 5 subscriptions", "de": "Bis zu 5 Abos" }],
       "premium": [{ "en": "Unlimited subscriptions", "de": "Unbegrenzt viele Abos" }]
     },
     "purchaseUrl": "https://[lemon-squeezy-link]",
     "lemonSqueezy": { "productId": 123456 }
   }
   ```
   - Required: `slug name shortDescription category status icon price hasPremium`. `slug` must equal the folder name. `status` is `live` or `coming-soon`.
   - `icon` is an **icon name** from `core/icons.js`, never an emoji.
   - `name`, `shortDescription`, `price`, `about` and `features` entries are a plain string (English) or an object per language; `en` is required.
   - Optional: `kind` (`app` for tools that keep data over time, default; `utility` for single-purpose tools; the home page and dashboard show the two groups separately), `order` (sort order in the catalog), `accent` (colours for light/dark), `about` and `features` (shown under "About this tool"), `stores` (default `true`; set `false` if the tool saves no data, which removes backup menu items and reminders).
   - A `live` tool with `hasPremium` needs a real `purchaseUrl` and `lemonSqueezy.productId`. The build fails on placeholders (allowed only for `"category": "demo"`).
3. Build the page. `tools/_demo/index.html` shows the pattern: it only contains `<main id="main" class="ow-container ow-container--tool">` with your workspace; the header (back link, name, license status, menu), notices, "About this tool" and footer come from the **tool shell**:
   ```js
   import { mountToolShell } from '../../../core/tool-shell.js';
   const shell = await mountToolShell({ slug: 'sub-tracker', config, main: document.getElementById('main'), onLicenseChange: render });
   shell.setUsage('2 of 5 free entries used');   // quiet counter
   shell.showLimit();                             // inline "free limit reached" notice with Unlock button
   ```
   Use `isPremiumUnlocked(slug)` for your own checks and `saveItem`, `getAllItems`, `updateItem`, `deleteItem` (all take the slug) for data. The shell handles license dialog, export/import, theme, language, backup reminder, storage warning and the `?purchased=1` return link.
4. Texts: put them in `tools/[slug]/src/locales/en.js` and `de.js` and register them with `registerMessages` (see Languages below).
5. Run `npm run build-registry`.
6. Deploy. The tool appears in the catalog automatically.

Folders starting with `_` (e.g. `_demo`) are not added to the registry (unless `INCLUDE_DEMO=1`). `node scripts/generate-demo-tools.js` recreates the `demo-*` tools from `_demo`.

Wide tools: use `ow-container--wide` on `<main>` and put two panels in a `.ow-split` element (two columns from 1100 px).

## Free launch phase vs license keys (one switch)

`core/site-config.js` holds `licensing.enabled`. While it is `false` (current state, Lemon Squeezy not connected yet), every premium feature is free in every tool: `isPremiumUnlocked()` returns true, the license dialog, unlock buttons, prices and premium badges are hidden, and the build does not require `purchaseUrl` or `lemonSqueezy.productId`. When Lemon Squeezy is connected, set each live tool's `purchaseUrl` and `lemonSqueezy.productId` and change that one value to `true`; premium is then unlocked only by license key. After flipping, run `npm run build-registry` (it validates the purchase fields) and publish.

## License purchase flow

In Lemon Squeezy, set each product's redirect after purchase to `https://[your-domain]/mydashboard/[slug]/?purchased=1`. The tool then opens the license dialog on the "I already have a key" side. (Check in the Lemon Squeezy dashboard that this option exists for your plan; it has not been verified here.)

## Design rules

- **No emojis, only icons.** Use `createIcon('name')` (inline SVG, colour follows `currentColor`). Add new icons to `core/icons.js`.
- **Two layouts.** Sizes, spacing and touch targets live in `core/ui-desktop.css` (above 720 px) and `core/ui-mobile.css`; shared colours and components in `ui-components.css`. Spacing uses the `--s-1 … --s-9` scale and type uses `--fs-*` variables; do not hard-code values. Pages set `viewport-fit=cover`; the body already respects the safe areas (notch).
- **Light and dark theme.** Default is the system preference (`prefers-color-scheme`); the user's choice is stored in `localStorage` (`ow_theme`). Include `core/theme-init.js` in `<head>` before the stylesheet to avoid a flash. Colours are CSS variables in `core/ui-components.css`; the light theme uses more saturated colours than the dark one. Per-tool accent: override both variants, e.g. `:root { --accent-l: #c2410c; --accent-d: #f0a07a; }`. Do not hard-code colours; use the variables. Text colours meet WCAG AA contrast in both themes.
- **Fonts** are self-hosted (`core/fonts/`), nothing is loaded from third parties.

## Languages (i18n)

English is the default language. The chosen language is stored in `localStorage` (`ow_lang`); the language switcher appears automatically once more than one language is registered (currently English and German). On the first visit the browser language is used if available; `?lang=de` in a URL sets the language.

- Use `t('key', { param })` for all UI text; for static HTML use `data-i18n="key"` (text) or `data-i18n-attr="placeholder:key;aria-label:key2"`. Re-render JS-built UI on the `ow:langchange` event (`onLangChange(fn)`).
- **Tool texts:** create `tools/[slug]/src/locales/en.js` and `de.js` (`export default { 'my.key': 'Text' }`) and register them with `registerMessages('en', en)`. Missing keys fall back to English, then to the key itself.
- **Add a language to the core:** copy `core/locales/en.js` to `core/locales/<code>.js`, translate it (including `'lang.name'`), and add one import and one entry in `core/locales/index.js`. Then add a `locales/<code>.js` file to each tool (optional, English is the fallback) and translations in `tool.config.json` if wanted.

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` runs `npm run build-registry` on every push to `main` (this also pre-renders the English catalog into `index.html` so it works without JavaScript) and then publishes the repo. The home page is `/`; the old `/hub/` address redirects there. `404.html` is served by GitHub Pages for unknown URLs. One-time setup: repo → Settings → Pages → Source: **GitHub Actions**.

## License keys

Two modes, chosen per tool:

- **Online (real tools): Lemon Squeezy license API.** Set `"lemonSqueezy": { "productId": 123456 }` in `tool.config.json`. When a customer enters the key, the tool activates it once at `api.lemonsqueezy.com` (public endpoint, no API key needed in the page), checks that the key belongs to this product, and stores the result in the browser. From then on the tool works offline. Once every 30 days, when online, the status is re-checked; a refunded or disabled license is locked again. Offline or server errors never lock a tool.
  - In Lemon Squeezy, turn on license keys for the product and set the **activation limit** (e.g. 3 devices). The dialog shows a clear message when the limit is reached.
  - The build requires `lemonSqueezy.productId` for every live premium tool (demo tools excepted).
  - Not verified in this repo: that the license endpoints answer browser requests (CORS) and the exact error texts. Test one real purchase (Lemon Squeezy test mode) before launch.
- **Offline (demo tools, tests): checksum keys** `XXXX-XXXX-XXXX-XXXX`. Generate one with
  ```
  node -e "import('./core/license.js').then(m => console.log(m.generateLicenseKey('demo-notes')))"
  ```
  This check runs in the browser and is not copy protection.

## Cloud folder (optional, client-side)

`core/cloud.js` and `core/cloud-ui.js` let users link a tool to a folder that their own cloud app syncs (iCloud Drive, Dropbox, OneDrive, Google Drive). The tool shell menu shows "Connect to cloud"; after linking, a backup file `oneware-<slug>.json` is written after every change and can be restored. It uses the File System Access API (`showDirectoryPicker`), so it works in desktop Chrome, Edge, Opera and Brave only; other browsers see a notice and keep the manual export/import. There is no server and no live sync between devices (planned, not built). The permission has to be re-granted by the user in a later session (a notice offers a button).

## Export format

```json
{ "tool": "sub-tracker", "version": 1, "exportedAt": "ISO date", "data": [] }
```

## QR Pro Studio

`tools/qr-pro-studio/` is a utility with a two-column page (content and style on the left, live preview and export on the right). Content types and their payload formats are in `src/content.js` (tested in `test/`). Free: all content types and PNG; Premium: colors, dot shapes, logo, sticker shapes and caption, SVG, PDF, large PNG, sticker sheet, CSV batch. The page stays `coming-soon` until a real `purchaseUrl` and `lemonSqueezy.productId` are set; it is reachable at `/mydashboard/qr-pro-studio/` meanwhile.

`vendor/` holds browser bundles (esbuild, ES modules) of `qr-code-styling` 1.9.2, `qrcode-generator` 2.0.4, `jsqr` 1.4.0, `jszip` 3.10.2 and `jspdf` 4.2.1, because the repo has no build step. Their licenses (MIT, jsQR Apache-2.0) apply; to update one, install it in a scratch folder and rebundle with `esbuild <entry> --bundle --format=esm --minify`.
