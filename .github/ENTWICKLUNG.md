# Ablauf: Aenderungen testen und live nehmen

**main** ist die Live-Seite (oneware.page). Jeder Push auf main wird automatisch veroeffentlicht.
**dev** ist der Arbeitsbranch. Pushes auf dev gehen nie live.

## Ablauf

1. **Auf dev arbeiten.** Aenderungen immer auf dem Branch `dev` committen und pushen, nie direkt auf main.
2. **Vorschau ansehen.** Nach dem Push baut Cloudflare `dev` automatisch (ca. 1 bis 2 Minuten) und zeigt es unter der Adresse des Cloudflare-Projekts `oneware-vorschau-dev` (endet auf `.workers.dev`). Diese Adresse im Browser oeffnen.
3. **Pruefen.** Betroffene Tools durchklicken, auch Lizenzschluessel-Ablauf und Seiten wie About und Datenschutz.
4. **Live nehmen.** Auf GitHub ein Pull Request von `dev` nach `main` oeffnen und mergen (oder lokal `git checkout main && git merge dev && git push`). Der bestehende Workflow "Deploy to GitHub Pages" veroeffentlicht dann automatisch.
5. **Danach** dev wieder auf main bringen (`git checkout dev && git merge main`), damit beide gleich starten.

Reserve: Der Lauf "Vorschau (dev)" unter GitHub Actions legt den Build zusaetzlich als Download ab (`oneware-vorschau`, mit `npx serve .` lokal ansehbar).

## Nutzerdaten

Alle Daten der Nutzer liegen im Browser (localStorage bzw. IndexedDB) auf ihrem Geraet. Ein Deploy ersetzt nur die Dateien der Seite und beruehrt diese Daten nicht. Sie bleiben erhalten, solange die **Speicherschluessel** (Namen der Eintraege) und das **Datenformat** unveraendert bleiben. Wer beides aendert, muss eine Migration mitliefern, die alte Daten einliest und umwandelt. Im Zweifel: erst in der Vorschau mit bereits gefuellten Daten testen. Hinweis: Die Vorschau-Adresse hat einen eigenen Browserspeicher, die echten Daten der Live-Seite sind dort nicht sichtbar.

## Einmalig eingerichtete Einstellungen

- **GitHub, Settings > Environments > github-pages:** nur `main` darf deployen. Damit kann kein anderer Branch die Live-Seite ueberschreiben.
- **GitHub, Settings > Pages:** Source steht auf "GitHub Actions".
- **Cloudflare, Projekt oneware-vorschau-dev:** Production branch steht auf `dev`. Die Live-Domain oneware.page ist dort nicht angehaengt und darf es nicht werden.
- Optional: Schutzregel fuer `main` (Settings > Branches), dann nur noch per Pull Request.
