// Feature 4 (Spaced Repetition, Mastery, Interleaving) + Feature 5 (Lernplan).
import { getAllBy, get } from './db.js';
import {
  dayKey, MASTERY_SESSIONS, UNLOCK_READINESS,
  topicReadiness, isMastered, distinctCorrectDays, moduleReadiness, loadTopicsWithState,
} from './model.js';

const DAY_MS = 86400000;
const MIN_PER_TASK = 1.4; // grobe Schätzung Minuten pro Aufgabe

// Vereinfachte Half-Life-Regression: Halbwertszeit wächst bei richtiger
// Antwort (abhängig von der Selbsteinschätzung) und schrumpft bei falscher.
const GROWTH = { high: 2.6, mid: 2.0, low: 1.35 };

/**
 * Aktualisiert einen Review-Zustand nach einer beantworteten Aufgabe.
 * @param {object} review
 * @param {boolean} correct
 * @param {'low'|'mid'|'high'} confidence
 * @param {number|null} examDate  – für komprimierte Wiederholung nahe der Klausur
 * @param {number} now
 */
export function gradeReview(review, correct, confidence, examDate = null, now = Date.now()) {
  const r = { ...review, correctSessionDays: [...review.correctSessionDays], errorHistory: [...review.errorHistory] };
  let hl = r.halfLifeDays;
  if (correct) {
    hl = hl * (GROWTH[confidence] || GROWTH.mid);
    r.correct += 1;
    const d = dayKey(now);
    if (!r.correctSessionDays.includes(d)) r.correctSessionDays.push(d);
  } else {
    hl = Math.max(0.2, hl * 0.4);
    r.wrong += 1;
  }
  // Komprimierte Wiederholung: je näher die Klausur, desto kürzer die Intervalle.
  if (examDate) {
    const daysLeft = Math.max(0.25, (examDate - now) / DAY_MS);
    hl = Math.min(hl, Math.max(0.25, daysLeft / 3));
  }
  r.halfLifeDays = hl;
  r.lastReviewed = now;
  r.dueAt = now + hl * DAY_MS;
  r.reps += 1;
  r.lastConfidence = confidence;
  return r;
}

/** Ermittelt die freigeschalteten Themen (Reihenfolge-Gating). */
function unlockedTopicIds(topics) {
  const sorted = [...topics].sort((a, b) => a.order - b.order);
  const unlocked = new Set();
  for (const t of sorted) {
    unlocked.add(t.id);
    const ready = t.mastered || t.readiness >= UNLOCK_READINESS;
    if (!ready) break; // erst weiter, wenn dieses Thema den Mindest-Score erreicht
  }
  return unlocked;
}

/**
 * Baut eine interleaved Lern-Session: fällige Aufgaben + behutsam neue,
 * gemischt über verschiedene Themen.
 * @returns {Promise<Array>} Liste von {task, review, topic}
 */
export async function buildSession(moduleId, { limit = 15, maxNew = 8, now = Date.now() } = {}) {
  const mod = await get('modules', moduleId);
  const topics = await loadTopicsWithState(moduleId, now);
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const reviews = await getAllBy('reviews', 'moduleId', moduleId);
  const unlocked = unlockedTopicIds(topics);

  const due = [];
  const fresh = [];
  for (const r of reviews) {
    const topic = topicById.get(r.topicId);
    if (!topic) continue;
    const started = r.reps > 0;
    if (!started && !unlocked.has(r.topicId)) continue; // neue Aufgaben nur aus freigeschalteten Themen
    if (r.dueAt <= now && started) due.push({ review: r, topic });
    else if (!started) fresh.push({ review: r, topic });
  }

  // Fällige zuerst: nach Überfälligkeit × Themen-Wichtigkeit priorisieren.
  due.sort((a, b) =>
    ((now - b.review.dueAt) * b.topic.weight) - ((now - a.review.dueAt) * a.topic.weight));
  // Neue nach Themen-Reihenfolge und Schwierigkeit.
  fresh.sort((a, b) => a.topic.order - b.topic.order);

  const chosen = due.slice(0, limit);
  const room = Math.min(limit - chosen.length, maxNew);
  chosen.push(...fresh.slice(0, Math.max(0, room)));

  // Aufgaben laden
  const withTasks = [];
  for (const c of chosen) {
    const task = await get('tasks', c.review.taskId);
    if (task) withTasks.push({ task, review: c.review, topic: c.topic });
  }
  return interleave(withTasks);
}

/** Ordnet so um, dass möglichst keine zwei gleichen Themen aufeinanderfolgen. */
function interleave(items) {
  const buckets = new Map();
  for (const it of items) {
    if (!buckets.has(it.topic.id)) buckets.set(it.topic.id, []);
    buckets.get(it.topic.id).push(it);
  }
  const queues = [...buckets.values()];
  const out = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const q of queues) {
      if (q.length) { out.push(q.shift()); progress = true; }
    }
  }
  return out;
}

/**
 * Berechnet den Lernplan / Burndown für ein Modul (Feature 5).
 * Wird bei jedem Aufruf neu gerechnet → verpasste Tage verteilen sich von selbst.
 */
export async function computePlan(moduleId, now = Date.now()) {
  const mod = await get('modules', moduleId);
  const topics = await loadTopicsWithState(moduleId, now);
  const reviews = await getAllBy('reviews', 'moduleId', moduleId);
  const istReadiness = moduleReadiness(topics);

  const hasExam = !!mod?.examDate;
  const minutesPerDay = mod?.minutesPerDay || 30;

  // Startbeginn des heutigen Tages
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const daysLeft = hasExam
    ? Math.max(0, Math.ceil((mod.examDate - today.getTime()) / DAY_MS)) : null;

  const dueToday = reviews.filter((r) => r.dueAt <= now + DAY_MS).length;
  const newRemaining = reviews.filter((r) => r.reps === 0).length;
  const daysForNew = Math.max(1, daysLeft ?? 14);
  const newPerDay = Math.ceil(newRemaining / daysForNew);

  // Mastery-Bedarf: jedes Thema braucht (fehlende) unterschiedliche Session-Tage.
  const byTopic = new Map();
  for (const r of reviews) {
    if (!byTopic.has(r.topicId)) byTopic.set(r.topicId, []);
    byTopic.get(r.topicId).push(r);
  }
  let maxTopicDaysNeeded = 0;
  for (const rs of byTopic.values()) {
    maxTopicDaysNeeded = Math.max(maxTopicDaysNeeded, MASTERY_SESSIONS - distinctCorrectDays(rs));
  }
  maxTopicDaysNeeded = Math.max(0, maxTopicDaysNeeded);

  const goalTasks = Math.max(0, dueToday + (newRemaining > 0 ? newPerDay : 0));
  const minutesNeeded = Math.round(goalTasks * MIN_PER_TASK);
  const feasible = daysLeft == null
    ? true
    : (maxTopicDaysNeeded <= daysLeft && minutesNeeded <= minutesPerDay * 1.5);

  // Soll-Kurve: von der heutigen Bereitschaft linear auf 100 % bis zum Termin.
  const curve = [];
  const span = Math.max(1, daysLeft ?? 14);
  for (let i = 0; i <= span; i++) {
    curve.push({ day: i, soll: Math.round(istReadiness + (100 - istReadiness) * (i / span)) });
  }

  return {
    hasExam, examDate: mod?.examDate ?? null, daysLeft, minutesPerDay,
    dueToday, newRemaining, newPerDay, goalTasks, minutesNeeded,
    feasible, maxTopicDaysNeeded, istReadiness,
    sollToday: curve[0]?.soll ?? istReadiness, curve,
    topics,
  };
}
