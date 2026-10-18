# Oneware

Monorepo für eine Familie kleiner, client-seitiger Web-Tools (kein Backend). Einmal zahlen, Freischaltung per Lizenzschlüssel.

```
core/      gemeinsame Bibliothek (license.js, storage.js, ui-components.css/js)
hub/       Landingpage, liest hub/tool-registry.json
tools/     ein Ordner pro Tool (tool.config.json + index.html + src/)
scripts/   build-tool-registry.js
```

## Befehle

| Befehl | Zweck |
|---|---|
| `npm install` | Dev-Abhängigkeit für Tests (fake-indexeddb) |
| `npm test` | Core-Tests |
| `npm run build-registry` | erzeugt `hub/tool-registry.json` aus allen `tools/*/tool.config.json` |

Lokal ansehen: `python3 -m http.server` im Repo-Root, dann `http://localhost:8000/`. (ES-Module brauchen einen Server, `file://` geht nicht.)

## Neues Tool anlegen

1. Ordner `tools/[neuer-slug]/` anlegen (am einfachsten `tools/_demo/` kopieren).
2. `tool.config.json` ausfüllen:
   ```json
   {
     "slug": "abo-tracker",
     "name": "Abo-Tracker",
     "shortDescription": "Alle Abos im Überblick, einmalig bezahlt.",
     "category": "tracker",
     "status": "live",
     "icon": "📋",
     "price": "CHF 5.-",
     "hasPremium": true,
     "purchaseUrl": "https://[lemon-squeezy-link]"
   }
   ```
   `slug` muss dem Ordnernamen entsprechen. `status`: `live` oder `coming-soon`. Bei `live` + `hasPremium` ist `purchaseUrl` Pflicht.
3. Core-Module importieren (von `tools/[slug]/src/` aus):
   ```html
   <link rel="stylesheet" href="../../core/ui-components.css">
   ```
   ```js
   import { isPremiumUnlocked } from '../../../core/license.js';
   import { saveItem, getAllItems } from '../../../core/storage.js';
   import { createPrivacyBanner, showLicenseDialog, createUpgradeButton } from '../../../core/ui-components.js';
   ```
   (Aus `tools/[slug]/index.html` heraus lautet der Pfad `../../core/...`.) Akzentfarbe pro Tool: `:root { --accent: #7c3aed; }` nach dem CSS-Import.
4. Tool-Logik bauen. Immer den eigenen `slug` an `isPremiumUnlocked`, `unlockPremium` und alle Storage-Funktionen übergeben, damit sich Tools nicht überschreiben.
5. `npm run build-registry` ausführen.
6. Deployen. Das Tool erscheint automatisch im Hub.

Ordner mit `_` am Anfang (z. B. `_demo`) werden nicht in die Registry aufgenommen (Ausnahme: `INCLUDE_DEMO=1`).

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` führt bei jedem Push auf `main` zuerst `npm run build-registry` aus und veröffentlicht dann das Repo. Einmalig nötig: Repo → Settings → Pages → Source: **GitHub Actions**.

## Lizenzschlüssel

Format `XXXX-XXXX-XXXX-XXXX`: 12 Zeichen Nutzlast + 4 Zeichen Prüfsumme (FNV-1a, abhängig vom Tool-Slug). Eigene Schlüssel erzeugen:

```
node -e "import('./core/license.js').then(m => console.log(m.generateLicenseKey('abo-tracker')))"
```

Die Prüfung läuft im Browser und ist kein Kopierschutz, sie fängt nur Tippfehler ab. Lemon Squeezy muss dafür mit eigenen Schlüsseln (statt der Standard-UUIDs) befüllt werden, oder man nutzt dessen Lizenz-API (Online-Call).

## Export-Format

```json
{ "tool": "abo-tracker", "version": 1, "exportedAt": "ISO-Datum", "data": [] }
```
