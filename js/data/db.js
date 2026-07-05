// IndexedDB foundation for ExamCoach.
// All user data lives locally in the browser. Nothing is sent to any server
// except the Anthropic API calls made explicitly during course generation.
//
// Schema (v1) – object stores and their indexes:
//   settings   key: 'key'                     – apiKey, streak, flags, ...
//   modules    key: 'id'                       – ein Uni-Modul
//   topics     key: 'id'  idx: moduleId        – Thema innerhalb eines Moduls
//   tasks      key: 'id'  idx: topicId,moduleId – Übungsaufgabe
//   reviews    key: 'taskId'                    – Spaced-Repetition-Zustand + Historie
//   sessions   key: 'id'  idx: moduleId,day     – Lern-Session-Protokoll (für Mastery)
//   attempts   key: 'id'  idx: taskId,sessionId – einzelne Versuche (für Fehler-Statistik)

const DB_NAME = 'examcoach';
const DB_VERSION = 2;

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const oldVersion = e.oldVersion;

      if (oldVersion < 1) {
        db.createObjectStore('settings', { keyPath: 'key' });

        db.createObjectStore('modules', { keyPath: 'id' });

        const topics = db.createObjectStore('topics', { keyPath: 'id' });
        topics.createIndex('moduleId', 'moduleId', { unique: false });

        const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
        tasks.createIndex('topicId', 'topicId', { unique: false });
        tasks.createIndex('moduleId', 'moduleId', { unique: false });

        const reviews = db.createObjectStore('reviews', { keyPath: 'taskId' });
        reviews.createIndex('moduleId', 'moduleId', { unique: false });
        reviews.createIndex('topicId', 'topicId', { unique: false });

        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('moduleId', 'moduleId', { unique: false });
        sessions.createIndex('day', 'day', { unique: false });

        const attempts = db.createObjectStore('attempts', { keyPath: 'id' });
        attempts.createIndex('taskId', 'taskId', { unique: false });
        attempts.createIndex('sessionId', 'sessionId', { unique: false });
        attempts.createIndex('moduleId', 'moduleId', { unique: false });
      }

      if (oldVersion < 2) {
        // Nachträglich fehlende Indizes für bestehende Datenbanken ergänzen.
        const reviews = req.transaction.objectStore('reviews');
        if (!reviews.indexNames.contains('moduleId')) reviews.createIndex('moduleId', 'moduleId', { unique: false });
        if (!reviews.indexNames.contains('topicId')) reviews.createIndex('topicId', 'topicId', { unique: false });
        const attempts = req.transaction.objectStore('attempts');
        if (!attempts.indexNames.contains('moduleId')) attempts.createIndex('moduleId', 'moduleId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ---------- Generic CRUD ---------- */

export async function get(store, key) {
  return wrap((await tx(store)).get(key));
}

export async function getAll(store) {
  return wrap((await tx(store)).getAll());
}

/** getAll rows where an index equals a value. */
export async function getAllBy(store, index, value) {
  const os = await tx(store);
  return wrap(os.index(index).getAll(IDBKeyRange.only(value)));
}

export async function put(store, value) {
  await wrap((await tx(store, 'readwrite')).put(value));
  return value;
}

/** Put many values in a single transaction. */
export async function putAll(store, values) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    for (const v of values) os.put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  return values;
}

export async function del(store, key) {
  return wrap((await tx(store, 'readwrite')).delete(key));
}

/** Delete a module and everything belonging to it (cascade). */
export async function deleteModuleCascade(moduleId) {
  const [topics, tasks, sessions] = await Promise.all([
    getAllBy('topics', 'moduleId', moduleId),
    getAllBy('tasks', 'moduleId', moduleId),
    getAllBy('sessions', 'moduleId', moduleId),
  ]);
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const t = db.transaction(['modules', 'topics', 'tasks', 'reviews', 'sessions', 'attempts'], 'readwrite');
    t.objectStore('modules').delete(moduleId);
    topics.forEach((x) => t.objectStore('topics').delete(x.id));
    tasks.forEach((x) => {
      t.objectStore('tasks').delete(x.id);
      t.objectStore('reviews').delete(x.id);
    });
    sessions.forEach((x) => t.objectStore('sessions').delete(x.id));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/* ---------- Settings convenience ---------- */

export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row ? row.value : fallback;
}
export async function setSetting(key, value) {
  return put('settings', { key, value });
}

/** Short random id. */
export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
