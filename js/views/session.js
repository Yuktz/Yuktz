// View: Lern-Session – interleaved Spaced-Repetition-Durchlauf (Feature 4/7/8).
import { el, mount, toast } from '../util/dom.js';
import { getAll, get } from '../data/db.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';
import { buildSession } from '../data/scheduler.js';
import { startSession, endSession, recordAttempt, getGamification } from '../data/progress.js';
import { renderTask } from '../ui/player.js';

export async function render(view, ctx) {
  const moduleId = ctx.query.get('module');

  if (!moduleId) return renderPicker(view);

  const mod = await get('modules', moduleId);
  if (!mod) { navigate('/session'); return; }

  setAppbar({ title: 'Lernen', showBack: true, onBack: () => navigate('/modules/' + moduleId) });

  const limit = Math.max(5, Math.min(25, Math.round((mod.minutesPerDay || 30) / 1.4)));
  const items = await buildSession(moduleId, { limit });

  if (!items.length) {
    mount(view, el('div', { class: 'empty' }, [
      el('span', { class: 'empty__emoji' }, '🎉'),
      el('div', { class: 'empty__title' }, 'Nichts fällig'),
      el('div', { class: 'empty__text' }, 'Für dieses Modul steht aktuell keine Wiederholung an. Komm später wieder – oder lege neue Themen frei, indem du bestehende festigst.'),
      el('button', { class: 'btn btn--ghost', onClick: () => navigate('/modules/' + moduleId) }, 'Zum Modul'),
    ]));
    return;
  }

  const session = await startSession(moduleId, 'learn');
  let index = 0;
  let gainedTotal = 0;

  const progress = el('div', { class: 'progress', style: 'margin-bottom:14px' }, [
    el('div', { class: 'progress__fill', style: 'width:0%' }),
  ]);
  const stage = el('div', {});
  mount(view, progress, stage);

  function showCurrent() {
    progress.firstChild.style.width = `${Math.round((index / items.length) * 100)}%`;
    const it = items[index];
    renderTask(stage, {
      task: it.task, topic: it.topic, index, total: items.length,
      onGraded: async (result) => {
        const res = await recordAttempt({
          session, task: it.task, review: it.review,
          correct: result.correct, confidence: result.confidence,
          errorTags: result.errorTags, userAnswer: result.userAnswer, userSteps: result.userSteps,
          examDate: mod.examDate,
        });
        gainedTotal += res.gained;
        toast(`+${res.gained} XP${res.streak > 1 ? ` · 🔥 ${res.streak}` : ''}`, 'ok');
        index += 1;
        if (index >= items.length) finishSession();
        else showCurrent();
      },
    });
    window.scrollTo(0, 0);
  }

  async function finishSession() {
    await endSession(session);
    const acc = Math.round((100 * session.correct) / session.total);
    progress.firstChild.style.width = '100%';
    mount(stage, el('div', { class: 'card', style: 'text-align:center' }, [
      el('div', { style: 'font-size:44px' }, acc >= 70 ? '🏆' : '💪'),
      el('h3', { style: 'font-size:20px;font-weight:800;margin-top:6px' }, 'Session abgeschlossen'),
      el('div', { class: 'stat-grid', style: 'margin-top:16px' }, [
        stat(`${session.correct}/${session.total}`, 'richtig'),
        stat(`${acc}%`, 'Quote'),
        stat(`+${gainedTotal}`, 'XP'),
      ]),
      el('div', { class: 'row', style: 'gap:8px;margin-top:18px' }, [
        el('button', { class: 'btn btn--primary grow', onClick: () => render(view, ctx) }, 'Weiter lernen'),
        el('button', { class: 'btn btn--ghost grow', onClick: () => navigate('/modules/' + moduleId) }, 'Zum Modul'),
      ]),
    ]));
    window.scrollTo(0, 0);
  }

  showCurrent();
}

/** Modul-Auswahl, wenn die Lernen-Tab ohne Modulkontext geöffnet wird. */
async function renderPicker(view) {
  setAppbar({ title: 'Lernen', showBack: false });
  const modules = await getAll('modules');
  const gam = await getGamification();

  if (!modules.length) {
    mount(view, el('div', { class: 'empty' }, [
      el('span', { class: 'empty__emoji' }, '🎯'),
      el('div', { class: 'empty__title' }, 'Noch keine Module'),
      el('div', { class: 'empty__text' }, 'Lege zuerst ein Modul an, dann kannst du hier fällige Aufgaben üben.'),
      el('button', { class: 'btn btn--primary', onClick: () => navigate('/modules/new') }, '＋ Modul anlegen'),
    ]));
    return;
  }

  mount(view,
    el('h2', { class: 'page-title' }, 'Lernen'),
    el('p', { class: 'page-sub' }, gam.streak ? `🔥 ${gam.streak} Tage Streak · ${gam.totalXp} XP` : `${gam.totalXp} XP`),
    el('div', { class: 'section-title' }, 'Modul wählen'),
    el('div', { class: 'stack' }, modules.map((m) => el('div', {
      class: 'card card--link', onClick: () => navigate('/session?module=' + m.id),
    }, [
      el('div', { class: 'row row--between' }, [
        el('strong', {}, m.name),
        el('span', { class: 'pill' }, `${m.readiness ?? 0}%`),
      ]),
    ]))),
  );
}

function stat(value, label) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat__value' }, value),
    el('div', { class: 'stat__label' }, label),
  ]);
}
