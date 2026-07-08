// Session-Protokoll, Versuche, XP/Streak und Statistik-Aggregation.
import { put, get, getAll, getAllBy, getSetting, setSetting, uid } from './db.js';
import { gradeReview } from './scheduler.js';
import { dayKey, refreshModuleReadiness } from './model.js';

/** Startet eine neue Session (Lernen oder Klausur-Simulation). */
export async function startSession(moduleId, mode = 'learn') {
  const session = {
    id: uid('s_'), moduleId, day: dayKey(), startedAt: Date.now(), endedAt: null,
    mode, taskIds: [], xp: 0, correct: 0, total: 0,
  };
  await put('sessions', session);
  return session;
}

export async function endSession(session) {
  session.endedAt = Date.now();
  await put('sessions', session);
  await refreshModuleReadiness(session.moduleId);
  return session;
}

/**
 * Verbucht einen Versuch: aktualisiert Review (Spaced Repetition), schreibt
 * einen Attempt-Datensatz, aktualisiert Session-Zähler, XP und Streak.
 */
export async function recordAttempt({ session, task, review, correct, confidence, errorTags = [], userAnswer = '', userSteps = '', examDate = null, reschedule = true }) {
  const now = Date.now();
  let updated = review;
  if (reschedule) {
    updated = gradeReview(review, correct, confidence, examDate, now);
    if (!correct && errorTags.length) updated.errorHistory.push({ day: dayKey(now), tags: errorTags });
    await put('reviews', updated);
  }

  const attempt = {
    id: uid('at_'), taskId: task.id, topicId: task.topicId, moduleId: task.moduleId,
    sessionId: session.id, day: dayKey(now), correct, confidence,
    errorTags, userAnswer, userSteps, ts: now,
  };
  await put('attempts', attempt);

  session.total += 1;
  if (correct) session.correct += 1;
  if (!session.taskIds.includes(task.id)) session.taskIds.push(task.id);
  const gained = correct ? (8 + task.difficulty * 2 + (confidence === 'low' ? 2 : 0)) : 2;
  session.xp += gained;
  await put('sessions', session);

  const streak = await bumpStreak(now);
  const totalXp = (await getSetting('totalXp', 0)) + gained;
  await setSetting('totalXp', totalXp);

  return { review: updated, gained, streak, totalXp };
}

/** Aktualisiert den Tages-Streak. */
export async function bumpStreak(now = Date.now()) {
  const today = dayKey(now);
  const last = await getSetting('streakLastDay', null);
  let count = await getSetting('streakCount', 0);
  if (last === today) return count;
  const yesterday = dayKey(now - 86400000);
  count = last === yesterday ? count + 1 : 1;
  await setSetting('streakCount', count);
  await setSetting('streakLastDay', today);
  return count;
}

export async function getGamification() {
  const now = Date.now();
  const last = await getSetting('streakLastDay', null);
  let streak = await getSetting('streakCount', 0);
  // Streak ist nur gültig, wenn heute oder gestern zuletzt geübt wurde.
  if (last !== dayKey(now) && last !== dayKey(now - 86400000)) streak = 0;
  return { totalXp: await getSetting('totalXp', 0), streak };
}

/* ---------- Statistik ---------- */

/** Fehlerarten-Häufigkeit, optional nach Modul gefiltert. */
export async function errorPatterns(moduleId = null) {
  const attempts = moduleId
    ? await getAllBy('attempts', 'moduleId', moduleId)
    : await getAll('attempts');
  const counts = {};
  let wrong = 0;
  for (const a of attempts) {
    if (a.correct) continue;
    wrong += 1;
    for (const tag of a.errorTags || []) counts[tag] = (counts[tag] || 0) + 1;
  }
  const list = Object.entries(counts).map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
  return { list, wrong };
}

/** Übergreifende Kennzahlen für die Statistik-Ansicht. */
export async function overallStats() {
  const [attempts, sessions, modules] = await Promise.all([
    getAll('attempts'), getAll('sessions'), getAll('modules'),
  ]);
  const total = attempts.length;
  const correct = attempts.filter((a) => a.correct).length;
  const learnDays = new Set(sessions.map((s) => s.day)).size;
  const perModule = modules.map((m) => ({
    id: m.id, name: m.name, readiness: m.readiness ?? 0,
  })).sort((a, b) => b.readiness - a.readiness);
  return {
    totalAttempts: total,
    accuracy: total ? Math.round((100 * correct) / total) : 0,
    learnDays, perModule,
  };
}
