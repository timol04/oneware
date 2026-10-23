// Writes fixtures/struktur.docx: a small document with deliberate structure problems (skipped heading level,
// no page numbers, figure and table without caption, wrong numbering) for trying the checks by hand.
import { writeFile } from 'node:fs/promises';
import { buildDocx, para, heading, caption, picture, table, pageBreak } from './helpers.js';

const body = heading(1, 'Einleitung') + para('Dieser Text steht im Stil Normal.')
  + heading(3, 'Methode (Ebene 2 fehlt)') + para('Noch ein Absatz.')
  + picture() + caption('Abbildung 1: Aufbau') + para('Text zwischen den Objekten.')
  + picture() + para('Diese Abbildung hat keine Beschriftung.')
  + pageBreak + heading(1, 'Ergebnisse') + table() + para('Die Tabelle darüber hat keine Beschriftung.')
  + picture() + caption('Abbildung 3: Springt von 1 auf 3');
await writeFile(new URL('../fixtures/struktur.docx', import.meta.url), await buildDocx({ body }));
