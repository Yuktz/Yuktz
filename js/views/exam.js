// View: Klausur-Modus – Lernplan/Burndown (Feature 5) + Simulation (Feature 6).
import { el, mount, toast } from '../util/dom.js';
import { getAll, get, getAllBy } from '../data/db.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';
import { computePlan } from '../data/scheduler.js';
import { startSession, endSession, recordAttempt } from '../data/progress.js';
import { renderTask } from '../ui/player.js';
import { gauge, lineChart, barChart } from '../ui/charts.js';

let simTimer = null;

export async function render(view, ctx) {
  if (simTimer) { clearInterval(simTimer); simTimer = null; }
  const moduleId = ctx.query.get('module');
  if (!moduleId) return renderPicker(view);

  const mod = await get('modules', moduleId);
  if (!mod) { navigate('/exam'); return; }
  setAppbar({ title: 'Klausur-Modus', showBack: true, onBack: () => navigate('/modules/' + moduleId) });

  const plan = await computePlan(moduleId);

  const gaugeCard = el('div', { class: 'card', style: 'text-align:center' }, [
    gauge(plan.istReadiness, 'Bereitschaft'),
    el('p', { class: 'muted', style: 'font-size:13px;margin-top:4px;max-width:34ch;margin-left:auto;margin-right:auto' },
      'Ein ehrlicher Bereitschafts-Score – keine Bestehens-Garantie.'),
  ]);

  let planCard;
  if (plan.hasExam) {
    const dateStr = new Date(plan.examDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
    planCard = el('div', { class: 'card' }, [
      el('div', { class: 'row row--between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:700' }, plan.daysLeft > 0 ? `Noch ${plan.daysLeft} Tage` : 'Klausurtag'),
          el('div', { class: 'muted', style: 'font-size:12px' }, dateStr),
        ]),
        el('span', { class: `pill ${plan.feasible ? '' : 'badge-soon'}` }, plan.feasible ? 'im Plan' : 'eng'),
      ]),
      el('div', { style: 'margin:14px 0 6px' }, lineChart(plan.curve, plan.istReadiness)),
      el('div', { class: 'stat-grid', style: 'margin-top:12px' }, [
        stat(`${plan.goalTasks}`, 'Aufgaben heute'),
        stat(`~${plan.minutesNeeded}′`, 'Aufwand heute'),
        stat(`${plan.dueToday}`, 'fällig'),
      ]),
      !plan.feasible ? el('p', { class: 'muted', style: 'font-size:12px;margin-top:10px;line-height:1.5' },
        `Bei ${plan.minutesPerDay}′/Tag wird es bis zum Termin knapp. Mehr Zeit einplanen oder auf die wichtigsten Themen fokussieren.`) : null,
      el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:12px', onClick: () => navigate('/session?module=' + moduleId) },
        'Heutiges Pensum starten'),
    ]);
  } else {
    planCard = el('div', { class: 'card' }, [
      el('div', { class: 'muted', style: 'font-size:14px;line-height:1.5' },
        'Kein Klausurtermin gesetzt. Trage im Modul ein Datum und deine Lernzeit/Tag ein, dann berechnet ExamCoach einen Tagesplan bis zur Klausur.'),
      el('button', { class: 'btn btn--ghost btn--block', style: 'margin-top:10px', onClick: () => navigate('/modules/' + moduleId) }, 'Termin eintragen'),
    ]);
  }

  const simCard = el('div', { class: 'card' }, [
    el('div', { class: 'section-title', style: 'margin-top:0' }, 'Klausur-Simulation'),
    el('p', { class: 'muted', style: 'font-size:13px;line-height:1.5' },
      'Zeitlich begrenzter Testlauf mit gemischten Aufgaben aus allen Themen (inkl. Probeklausur-Aufgaben). Keine Hinweise – Auswertung nach Thema am Ende.'),
    el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:6px', onClick: () => startSimulation(view, ctx, mod) }, '▶︎ Simulation starten'),
  ]);

  mount(view, gaugeCard, el('div', { class: 'section-title' }, 'Lernplan'), planCard,
    el('div', { class: 'section-title' }, 'Simulation'), simCard);
}

async function startSimulation(view, ctx, mod) {
  const allTasks = await getAllBy('tasks', 'moduleId', mod.id);
  const topics = await getAllBy('topics', 'moduleId', mod.id);
  const topicTitle = new Map(topics.map((t) => [t.id, t.title]));
  if (allTasks.length < 3) return toast('Zu wenige Aufgaben für eine Simulation', 'err');

  const N = Math.min(20, Math.max(6, allTasks.length));
  const items = shuffle(allTasks).slice(0, N).map((task) => ({ task, topic: { id: task.topicId, title: topicTitle.get(task.topicId) || 'Thema' } }));
  const duration = items.length * 90; // 90 s pro Aufgabe

  setAppbar({ title: 'Simulation', showBack: true, onBack: () => { if (confirm('Simulation abbrechen?')) render(view, ctx); } });

  const session = await startSession(mod.id, 'sim');
  const results = []; // {topicId, topicTitle, correct}
  let index = 0;
  let remaining = duration;

  const timerEl = el('span', { class: 'timer' }, fmt(remaining));
  const bar = el('div', { class: 'progress', style: 'flex:1' }, [el('div', { class: 'progress__fill', style: 'width:0%' })]);
  const topRow = el('div', { class: 'row', style: 'gap:12px;margin-bottom:14px' }, [bar, timerEl]);
  const stage = el('div', {});
  mount(view, topRow, stage);

  if (simTimer) clearInterval(simTimer);
  simTimer = setInterval(() => {
    remaining -= 1;
    timerEl.textContent = fmt(Math.max(0, remaining));
    if (remaining <= 30) timerEl.classList.add('timer--warn');
    if (remaining <= 0) { clearInterval(simTimer); simTimer = null; finish(true); }
  }, 1000);

  function showCurrent() {
    bar.firstChild.style.width = `${Math.round((index / items.length) * 100)}%`;
    const it = items[index];
    renderTask(stage, {
      task: it.task, topic: it.topic, index, total: items.length, examMode: true,
      onGraded: async (result) => {
        await recordAttempt({
          session, task: it.task, review: null, correct: result.correct, confidence: 'mid',
          errorTags: [], userAnswer: result.userAnswer, userSteps: result.userSteps, reschedule: false,
        });
        results.push({ topicId: it.topic.id, topicTitle: it.topic.title, correct: result.correct });
        index += 1;
        if (index >= items.length) finish(false);
        else showCurrent();
      },
    });
    window.scrollTo(0, 0);
  }

  async function finish(timeUp) {
    if (simTimer) { clearInterval(simTimer); simTimer = null; }
    await endSession(session);
    const total = results.length;
    const correct = results.filter((r) => r.correct).length;
    const acc = total ? Math.round((100 * correct) / total) : 0;

    // Auswertung nach Thema
    const byTopic = new Map();
    for (const r of results) {
      if (!byTopic.has(r.topicTitle)) byTopic.set(r.topicTitle, { correct: 0, total: 0 });
      const e = byTopic.get(r.topicTitle); e.total += 1; if (r.correct) e.correct += 1;
    }
    const topicData = [...byTopic.entries()].map(([label, v]) => ({ label, value: Math.round((100 * v.correct) / v.total) }));

    setAppbar({ title: 'Auswertung', showBack: true, onBack: () => render(view, ctx) });
    mount(view, el('div', { class: 'card', style: 'text-align:center' }, [
      timeUp ? el('div', { class: 'muted', style: 'font-size:13px' }, '⏱ Zeit abgelaufen') : null,
      gauge(acc, 'Ergebnis'),
      el('div', { style: 'font-size:14px;margin-top:4px' }, `${correct} von ${total} richtig`),
    ]),
    el('div', { class: 'section-title' }, 'Ergebnis nach Thema'),
    el('div', { class: 'card' }, total ? barChart(topicData) : el('span', { class: 'muted' }, 'Keine Aufgaben bearbeitet.')),
    el('div', { class: 'row', style: 'gap:8px;margin-top:16px' }, [
      el('button', { class: 'btn btn--primary grow', onClick: () => render(view, ctx) }, 'Fertig'),
    ]));
    window.scrollTo(0, 0);
  }

  showCurrent();
}

async function renderPicker(view) {
  setAppbar({ title: 'Klausur-Modus', showBack: false });
  const modules = await getAll('modules');
  if (!modules.length) {
    mount(view, el('div', { class: 'empty' }, [
      el('span', { class: 'empty__emoji' }, '📝'),
      el('div', { class: 'empty__title' }, 'Noch keine Module'),
      el('div', { class: 'empty__text' }, 'Lege ein Modul an, um Lernplan und Klausur-Simulation zu nutzen.'),
      el('button', { class: 'btn btn--primary', onClick: () => navigate('/modules/new') }, '＋ Modul anlegen'),
    ]));
    return;
  }
  mount(view,
    el('h2', { class: 'page-title' }, 'Klausur-Modus'),
    el('p', { class: 'page-sub' }, 'Modul für Lernplan & Simulation wählen'),
    el('div', { class: 'stack' }, modules.map((m) => el('div', {
      class: 'card card--link', onClick: () => navigate('/exam?module=' + m.id),
    }, [
      el('div', { class: 'row row--between' }, [
        el('strong', {}, m.name),
        m.examDate ? el('span', { class: 'pill' }, daysTo(m.examDate)) : el('span', { class: 'muted', style: 'font-size:12px' }, 'kein Termin'),
      ]),
    ]))),
  );
}

function stat(value, label) {
  return el('div', { class: 'stat' }, [el('div', { class: 'stat__value' }, value), el('div', { class: 'stat__label' }, label)]);
}
function fmt(sec) { const m = Math.floor(sec / 60); const s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; }
function daysTo(ts) { const d = Math.ceil((ts - Date.now()) / 86400000); return d > 0 ? `${d} T` : 'heute'; }
function shuffle(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
