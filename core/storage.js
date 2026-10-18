/**
 * storage.js – IndexedDB-Wrapper. Eine gemeinsame Datenbank ("oneware"),
 * pro Tool ein eigener Object Store (Name = toolSlug), Primärschlüssel `id`.
 */

const DB_NAME = 'oneware';
const EXPORT_VERSION = 1;

let dbPromise = null;

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb(version) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, version);
    r.onupgradeneeded = () => {
      if (pendingStore && !r.result.objectStoreNames.contains(pendingStore)) {
        r.result.createObjectStore(pendingStore, { keyPath: 'id' });
      }
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => { r.result.close(); dbPromise = null; };
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('IndexedDB-Upgrade blockiert (anderer Tab offen?)'));
  });
}

let pendingStore = null;

async function getDb(toolSlug) {
  if (!toolSlug || typeof toolSlug !== 'string') throw new Error('toolSlug fehlt');
  if (!dbPromise) dbPromise = openDb();
  let db = await dbPromise;
  if (!db.objectStoreNames.contains(toolSlug)) {
    const next = db.version + 1;
    db.close();
    pendingStore = toolSlug;
    dbPromise = openDb(next);
    try { db = await dbPromise; } finally { pendingStore = null; }
  }
  return db;
}

async function store(toolSlug, mode) {
  const db = await getDb(toolSlug);
  return db.transaction(toolSlug, mode).objectStore(toolSlug);
}

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Speichert ein Item (fügt `id` hinzu, falls fehlend). Gibt das gespeicherte Item zurück. */
export async function saveItem(toolSlug, item) {
  const stored = { ...item, id: item.id ?? newId() };
  await req((await store(toolSlug, 'readwrite')).add(stored));
  return stored;
}

export async function getAllItems(toolSlug) {
  return req((await store(toolSlug, 'readonly')).getAll());
}

export async function deleteItem(toolSlug, id) {
  await req((await store(toolSlug, 'readwrite')).delete(id));
}

/** Überschreibt das Item mit dieser id (die id bleibt erhalten). Fehler, wenn es nicht existiert. */
export async function updateItem(toolSlug, id, item) {
  const s = await store(toolSlug, 'readwrite');
  if ((await req(s.get(id))) === undefined) throw new Error(`Item ${id} nicht gefunden`);
  const updated = { ...item, id };
  await req(s.put(updated));
  return updated;
}

/** Export als Objekt (testbar, ohne Download). */
export async function buildExport(toolSlug) {
  return {
    tool: toolSlug,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data: await getAllItems(toolSlug),
  };
}

/** Lädt `<toolSlug>-export-YYYY-MM-DD.json` herunter. */
export async function exportData(toolSlug) {
  const payload = await buildExport(toolSlug);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${toolSlug}-export-${payload.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return payload;
}

/**
 * Importiert eine Export-Datei (File/Blob oder bereits geparstes Objekt).
 * Prüft Format und `tool`-Feld; bestehende Items mit gleicher id werden überschrieben.
 * Mit { replace: true } wird der Store vorher geleert. Gibt die Anzahl importierter Items zurück.
 */
export async function importData(toolSlug, file, { replace = false } = {}) {
  let parsed = file;
  if (typeof file?.text === 'function') {
    try { parsed = JSON.parse(await file.text()); }
    catch { throw new Error('Datei ist kein gültiges JSON'); }
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.data)
      || typeof parsed.tool !== 'string' || typeof parsed.version !== 'number') {
    throw new Error('Ungültiges Exportformat');
  }
  if (parsed.tool !== toolSlug) {
    throw new Error(`Export gehört zu "${parsed.tool}", nicht zu "${toolSlug}"`);
  }
  if (parsed.version > EXPORT_VERSION) {
    throw new Error(`Exportversion ${parsed.version} wird nicht unterstützt`);
  }
  const items = parsed.data.map((it) => ({ ...it, id: it?.id ?? newId() }));
  const s = await store(toolSlug, 'readwrite');
  if (replace) await req(s.clear());
  for (const it of items) await req(s.put(it));
  return items.length;
}
