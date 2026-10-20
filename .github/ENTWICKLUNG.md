# Ablauf: Aenderungen testen und live nehmen

**main** ist die Live-Seite (oneware.page). Jeder Push auf main wird automatisch veroeffentlicht.
**dev** ist der Arbeitsbranch. Pushes auf dev gehen nie live.

## Ablauf

1. **Auf dev arbeiten.** Aenderungen immer auf dem Branch `dev` committen und pushen, nie direkt auf main.
2. **Vorschau holen.** Nach dem Push baut GitHub unter Actions den Lauf "Vorschau (dev)" (ca. 1 Minute). Dort unter "Artifacts" `oneware-vorschau` herunterladen und entpacken.
3. **Lokal ansehen.** Im entpackten Ordner `npx serve .` ausfuehren und die angezeigte Adresse (meist http://localhost:3000) oeffnen. Die Seite laeuft genau wie live, nur lokal.
4. **Pruefen.** Betroffene Tools durchklicken, auch Lizenzschluessel-Ablauf und Seiten wie About und Datenschutz.
5. **Live nehmen.** Auf GitHub ein Pull Request von `dev` nach `main` oeffnen und mergen (oder lokal `git checkout main && git merge dev && git push`). Der bestehende Workflow "Deploy to GitHub Pages" veroeffentlicht dann automatisch.
6. **Danach** dev wieder auf main bringen (`git checkout dev && git merge main`), damit beide gleich starten.

## Nutzerdaten

Alle Daten der Nutzer liegen im Browser (localStorage bzw. IndexedDB) auf ihrem Geraet. Ein Deploy ersetzt nur die Dateien der Seite und beruehrt diese Daten nicht. Sie bleiben erhalten, solange die **Speicherschluessel** (Namen der Eintraege) und das **Datenformat** unveraendert bleiben. Wer beides aendert, muss eine Migration mitliefern, die alte Daten einliest und umwandelt. Im Zweifel: erst in der Vorschau mit bereits gefuellten Daten testen. Hinweis: Vorschau auf localhost hat einen eigenen Browserspeicher, der echte Daten der Live-Seite sind dort nicht sichtbar.

## Einmalig von Hand einrichten (GitHub-Settings)

- **Settings > Branches:** Regel fuer `main` anlegen (empfohlen: Pull Request vor dem Merge verlangen, Force-Push verbieten). Optional dasselbe leichter fuer `dev`.
- **Settings > Environments > github-pages:** unter "Deployment branches and tags" nur `main` zulassen. Damit kann technisch kein anderer Branch die Live-Seite ueberschreiben.
- **Settings > Pages:** Source auf "GitHub Actions" (falls noch nicht erledigt).

## Hinweis zur Online-Vorschau

GitHub Pages erlaubt pro Repository nur eine Seite. Eine oeffentliche Vorschau-URL waere nur mit einem zusaetzlichen Dienst moeglich (z. B. Cloudflare Pages oder Netlify, beide mit kostenlosem Tarif und automatischen Branch-Vorschauen). Das braucht ein Konto und wurde bewusst nicht ohne dein Okay eingerichtet.
