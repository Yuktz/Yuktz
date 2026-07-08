// Domänenlogik: Modelle anlegen, KI-Kurs speichern, Bereitschaft & Mastery.
import { put, putAll, getAllBy, get, uid } from './db.js';

export const MASTERY_SESSIONS = 3;   // versch. Sessions mit richtiger Antwort
export const UNLOCK_READINESS = 50;  // Mindest-Score, um Folge-Themen freizuschalten
export const INITIAL_HALFLIFE = 0.7; // Tage

/** Lokaler Tag als YYYY-MM-DD. */
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function createModule(name) {
  const mod = {
    id: uid('m_'), name: name.trim(), createdAt: Date.now(),
    examDate: null, minutesPerDay: 30, topicCount: 0, readiness: 0, order: Date.now(),
  };
  await put('modules', mod);
  return mod;
}

/** Legt ein neues Kapitel im Modul an (fortlaufende Nummer). */
export async function createChapter(moduleId, title) {
  const existing = await getAllBy('chapters', 'moduleId', moduleId);
  const order = existing.length + 1;
  const ch = { id: uid('c_'), moduleId, title: (title || '').trim() || `Kapitel ${order}`, order, createdAt: Date.now() };
  await put('chapters', ch);
  return ch;
}

/**
 * Stellt sicher, dass ein Modul mindestens ein Kapitel hat und alle Themen
 * einem Kapitel zugeordnet sind (Back-Compat für vor der Kapitel-Ebene
 * angelegte Module).
 */
export async function ensureChapters(moduleId) {
  let chapters = await getAllBy('chapters', 'moduleId', moduleId);
  const topics = await getAllBy('topics', 'moduleId', moduleId);
  if (chapters.length === 0 && topics.length) {
    const ch = await createChapter(moduleId, 'Kapitel 1');
    chapters = [ch];
  }
  if (chapters.length) {
    const firstId = chapters.sort((a, b) => a.order - b.order)[0].id;
    for (const t of topics) {
      if (!t.chapterId) { t.chapterId = firstId; await put('topics', t); }
    }
  }
  return chapters.sort((a, b) => a.order - b.order);
}

function newReview(task) {
  return {
    taskId: task.id, topicId: task.topicId, moduleId: task.moduleId,
    halfLifeDays: INITIAL_HALFLIFE, lastReviewed: null, dueAt: Date.now(),
    correctSessionDays: [], reps: 0, correct: 0, wrong: 0,
    lastConfidence: null, errorHistory: [],
  };
}

/** Speichert einen KI-generierten Kurs als Themen/Aufgaben/Reviews. */
export async function saveGeneratedCourse(moduleId, kurs, chapterId = null) {
  const topics = [];
  const tasks = [];
  const reviews = [];
  const themen = [...(kurs.themen || [])].sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0));
  themen.forEach((t, ti) => {
    const topic = {
      id: uid('t_'), moduleId, chapterId, title: t.titel, weight: clamp(t.wichtigkeit ?? 3, 1, 5),
      order: t.reihenfolge ?? ti + 1, summary: t.zusammenfassung || '',
      readiness: 0, mastered: false,
    };
    topics.push(topic);
    for (const a of t.aufgaben || []) {
      const task = {
        id: uid('a_'), topicId: topic.id, moduleId,
        type: AUF_TYPE(a.typ), question: a.frage,
        options: Array.isArray(a.optionen) ? a.optionen : [],
        answer: a.loesung ?? '', steps: Array.isArray(a.loesungsweg) ? a.loesungsweg : [],
        difficulty: clamp(a.schwierigkeit ?? 2, 1, 3),
        errorTags: Array.isArray(a.fehlerarten) ? a.fehlerarten : [],
        fromExam: false, createdAt: Date.now(),
      };
      tasks.push(task);
      reviews.push(newReview(task));
    }
  });

  await putAll('topics', topics);
  await putAll('tasks', tasks);
  await putAll('reviews', reviews);
  const mod = await get('modules', moduleId);
  mod.topicCount = topics.length;
  await put('modules', mod);
  return { topics: topics.length, tasks: tasks.length };
}

/** Fügt zusätzliche Aufgaben zu einem bestehenden Thema hinzu. */
export async function addTasksToTopic(moduleId, topicId, aufgaben, { fromExam = false } = {}) {
  const tasks = [];
  const reviews = [];
  for (const a of aufgaben) {
    const task = {
      id: uid('a_'), topicId, moduleId, type: AUF_TYPE(a.typ), question: a.frage,
      options: Array.isArray(a.optionen) ? a.optionen : [], answer: a.loesung ?? '',
      steps: Array.isArray(a.loesungsweg) ? a.loesungsweg : [],
      difficulty: clamp(a.schwierigkeit ?? 2, 1, 3),
      errorTags: Array.isArray(a.fehlerarten) ? a.fehlerarten : [],
      fromExam, createdAt: Date.now(),
    };
    tasks.push(task);
    reviews.push(newReview(task));
  }
  await putAll('tasks', tasks);
  await putAll('reviews', reviews);
  return tasks;
}

/** Klausuraufgaben übernehmen (fromExam-Flag → Simulations-Pool). */
export function addExamTasks(moduleId, topicId, aufgaben) {
  return addTasksToTopic(moduleId, topicId, aufgaben, { fromExam: true });
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));
const AUF_TYPE = (t) => (['mc', 'cloze', 'number', 'worked'].includes(t) ? t : 'worked');

/* ---------- Bereitschaft & Mastery ---------- */

/** Aktuelle Erinnerungswahrscheinlichkeit einer Aufgabe (0..1). */
export function recallProbability(review, now = Date.now()) {
  if (!review.lastReviewed) return 0;
  const elapsedDays = (now - review.lastReviewed) / 86400000;
  return Math.pow(2, -elapsedDays / Math.max(0.1, review.halfLifeDays));
}

/** Anzahl unterschiedlicher Session-Tage mit richtiger Antwort im Thema. */
export function distinctCorrectDays(reviews) {
  const days = new Set();
  for (const r of reviews) for (const d of r.correctSessionDays) days.add(d);
  return days.size;
}

/** Bereitschafts-Score (0..100) eines Themas aus seinen Reviews. */
export function topicReadiness(reviews, now = Date.now()) {
  if (reviews.length === 0) return 0;
  const attempted = reviews.filter((r) => r.reps > 0);
  const coverage = attempted.length / reviews.length;
  const recall = attempted.length
    ? attempted.reduce((s, r) => s + recallProbability(r, now), 0) / attempted.length : 0;
  const mastery = Math.min(distinctCorrectDays(reviews), MASTERY_SESSIONS) / MASTERY_SESSIONS;
  return Math.round(100 * (0.5 * mastery + 0.3 * recall + 0.2 * coverage));
}

export function isMastered(reviews) {
  return distinctCorrectDays(reviews) >= MASTERY_SESSIONS;
}

/** Lädt Themen eines Moduls inkl. berechneter Bereitschaft/Mastery, sortiert. */
export async function loadTopicsWithState(moduleId, now = Date.now()) {
  const topics = await getAllBy('topics', 'moduleId', moduleId);
  const reviews = await getAllBy('reviews', 'moduleId', moduleId);
  const byTopic = new Map();
  for (const r of reviews) {
    if (!byTopic.has(r.topicId)) byTopic.set(r.topicId, []);
    byTopic.get(r.topicId).push(r);
  }
  const out = topics.map((t) => {
    const rs = byTopic.get(t.id) || [];
    return {
      ...t,
      readiness: topicReadiness(rs, now),
      mastered: isMastered(rs),
      taskCount: rs.length,
      dueCount: rs.filter((r) => r.dueAt <= now).length,
    };
  });
  out.sort((a, b) => a.order - b.order);
  return out;
}

/** Gesamt-Bereitschaft eines Moduls (gewichtet nach Themen-Wichtigkeit). */
export function moduleReadiness(topicsWithState) {
  if (!topicsWithState.length) return 0;
  const totW = topicsWithState.reduce((s, t) => s + t.weight, 0) || 1;
  return Math.round(topicsWithState.reduce((s, t) => s + t.readiness * t.weight, 0) / totW);
}

/** Aktualisiert die zwischengespeicherte Bereitschaft am Modul. */
export async function refreshModuleReadiness(moduleId) {
  const topics = await loadTopicsWithState(moduleId);
  const readiness = moduleReadiness(topics);
  const mod = await get('modules', moduleId);
  if (mod) { mod.readiness = readiness; mod.topicCount = topics.length; await put('modules', mod); }
  return { readiness, topics };
}

/**
 * Lädt die Kapitel eines Moduls, jeweils mit ihren Themen (inkl. Zustand),
 * aggregierter Bereitschaft und Freischalt-Status (sequentielles Gating).
 */
export async function loadChaptersWithState(moduleId, now = Date.now()) {
  const chapters = await ensureChapters(moduleId);
  const topics = await loadTopicsWithState(moduleId, now);
  const byChapter = new Map();
  const fallback = chapters[0]?.id;
  for (const t of topics) {
    const cid = t.chapterId || fallback;
    if (!byChapter.has(cid)) byChapter.set(cid, []);
    byChapter.get(cid).push(t);
  }
  const out = chapters.map((c) => {
    const ts = (byChapter.get(c.id) || []).sort((a, b) => a.order - b.order);
    return {
      ...c, topics: ts,
      readiness: moduleReadiness(ts),
      mastered: ts.length > 0 && ts.every((t) => t.mastered),
      dueCount: ts.reduce((s, t) => s + t.dueCount, 0),
      taskCount: ts.reduce((s, t) => s + t.taskCount, 0),
    };
  });
  // Sequentielles Kapitel-Gating: Kapitel N erst frei, wenn N-1 gefestigt/≥Score.
  out.forEach((c, i) => {
    if (i === 0) { c.unlocked = true; return; }
    const prev = out[i - 1];
    c.unlocked = prev.unlocked && (prev.mastered || prev.readiness >= UNLOCK_READINESS);
  });
  return out;
}
