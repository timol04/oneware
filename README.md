# Oneware

Monorepo for a family of small, client-side web tools (no backend). Pay once, unlock with a license key.

```
core/      shared library: license.js, storage.js, i18n.js, theme.js, icons.js, ui-components.css/js
hub/       landing page, renders hub/tool-registry.json
tools/     one folder per tool (tool.config.json + index.html + src/)
scripts/   build-tool-registry.js
```

## Commands

| Command | Purpose |
|---|---|
| `npm install` | dev dependency for tests (fake-indexeddb) |
| `npm test` | core tests |
| `npm run build-registry` | generates `hub/tool-registry.json` from all `tools/*/tool.config.json` |

View locally: run `python3 -m http.server` in the repo root, then open `http://localhost:8000/`. ES modules need a server; `file://` does not work.

## Creating a new tool

1. Create the folder `tools/[new-slug]/` (easiest: copy `tools/_demo/`).
2. Fill in `tool.config.json`:
   ```json
   {
     "slug": "sub-tracker",
     "name": "Subscription tracker",
     "shortDescription": "All your subscriptions at a glance, paid once.",
     "category": "tracker",
     "status": "live",
     "icon": "wallet",
     "price": "CHF 5.-",
     "hasPremium": true,
     "purchaseUrl": "https://[lemon-squeezy-link]"
   }
   ```
   - `slug` must equal the folder name. `status` is `live` or `coming-soon`. A `live` tool with `hasPremium` needs a valid `purchaseUrl`.
   - `icon` is an **icon name** from `core/icons.js` (never an emoji). Available: `lock key star note wallet check bookmark flask download upload trash link sun moon globe`.
   - `name`, `shortDescription` and `price` can be a plain string (English) or an object per language: `"name": { "en": "Subscription tracker", "de": "Abo-Tracker" }`. The `en` entry is required.
3. Import the core modules (paths from `tools/[slug]/index.html`; from `tools/[slug]/src/` use `../../../core/...`):
   ```html
   <script src="../../core/theme-init.js"></script>
   <link rel="stylesheet" href="../../core/ui-components.css">
   ```
   ```js
   import { isPremiumUnlocked } from '../../../core/license.js';
   import { saveItem, getAllItems } from '../../../core/storage.js';
   import { createIcon } from '../../../core/icons.js';
   import { registerMessages, t } from '../../../core/i18n.js';
   import { mountToolbar, createPrivacyBanner, showLicenseDialog, createUpgradeButton } from '../../../core/ui-components.js';
   ```
   Call `mountToolbar(element)` once: it applies the theme and adds the theme toggle (and the language switcher).
4. Build the tool logic. Always pass your own `slug` to `isPremiumUnlocked`, `unlockPremium` and all storage functions so tools do not overwrite each other.
5. Run `npm run build-registry`.
6. Deploy. The tool appears in the hub automatically.

Folders starting with `_` (e.g. `_demo`) are not added to the registry (unless `INCLUDE_DEMO=1`).

## Design rules

- **No emojis, only icons.** Use `createIcon('name')` (inline SVG, colour follows `currentColor`). Add new icons to `core/icons.js`.
- **Light and dark theme.** Default is the system preference (`prefers-color-scheme`); the user's choice is stored in `localStorage` (`ow_theme`). Include `core/theme-init.js` in `<head>` before the stylesheet to avoid a flash. Colours are CSS variables in `core/ui-components.css`; the light theme uses more saturated colours than the dark one. Per-tool accent: override both variants, e.g. `:root { --accent-l: #c2410c; --accent-d: #f0a07a; }`. Do not hard-code colours; use the variables.
- **Fonts** are self-hosted (`core/fonts/`), nothing is loaded from third parties.

## Languages (i18n)

English is the default language. The chosen language is stored in `localStorage` (`ow_lang`); the language switcher appears automatically once more than one language is registered (currently English and German).

- Use `t('key', { param })` for all UI text; for static HTML use `data-i18n="key"` (text) or `data-i18n-attr="placeholder:key;aria-label:key2"`. Re-render JS-built UI on the `ow:langchange` event (`onLangChange(fn)`).
- **Tool texts:** create `tools/[slug]/src/locales/en.js` and `de.js` (`export default { 'my.key': 'Text' }`) and register them with `registerMessages('en', en)`. Missing keys fall back to English, then to the key itself.
- **Add a language to the core:** copy `core/locales/en.js` to `core/locales/<code>.js`, translate it (including `'lang.name'`), and add one import and one entry in `core/locales/index.js`. Then add a `locales/<code>.js` file to each tool (optional, English is the fallback) and translations in `tool.config.json` if wanted.

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` runs `npm run build-registry` on every push to `main` and then publishes the repo. One-time setup: repo → Settings → Pages → Source: **GitHub Actions**.

## License keys

Format `XXXX-XXXX-XXXX-XXXX`: 12 payload characters + 4 checksum characters (FNV-1a, depends on the tool slug). Generate your own keys:

```
node -e "import('./core/license.js').then(m => console.log(m.generateLicenseKey('sub-tracker')))"
```

Validation runs in the browser and is not copy protection; it only catches typos. For Lemon Squeezy, fill the license keys with your own generated keys (instead of the default UUIDs), or use its license API (needs an online call).

## Export format

```json
{ "tool": "sub-tracker", "version": 1, "exportedAt": "ISO date", "data": [] }
```
