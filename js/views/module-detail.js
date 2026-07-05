// View: Modul-Detail – Themen, Lernplan-Einstellungen, Probeklausuren.
import { el, mount, toast } from '../util/dom.js';
import { get, put, getAllBy, del, deleteModuleCascade } from '../data/db.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';
import { showOverlay } from '../ui/loading.js';
import { loadTopicsWithState, moduleReadiness, addExamTasks, refreshModuleReadiness } from '../data/model.js';
import { gauge } from '../ui/charts.js';
import { fileToText } from '../api/pdf.js';
import { analyzeExam } from '../api/anthropic.js';

export async function render(view, ctx) {
  const id = ctx.params.id;
  const mod = await get('modules', id);
  setAppbar({ title: mod ? mod.name : 'Modul', showBack: true, onBack: () => navigate('/modules') });

  if (!mod) {
    mount(view, el('div', { class: 'empty' }, [
      el('span', { class: 'empty__emoji' }, '🤷'),
      el('div', { class: 'empty__title' }, 'Modul nicht gefunden'),
      el('button', { class: 'btn btn--ghost', onClick: () => navigate('/modules') }, 'Zur Übersicht'),
    ]));
    return;
  }

  const topics = await loadTopicsWithState(id);
  const readiness = moduleReadiness(topics);
  const dueTotal = topics.reduce((s, t) => s + t.dueCount, 0);
  const masteredCount = topics.filter((t) => t.mastered).length;

  // --- Kopf: Gauge + Aktionen ---
  const header = el('div', { class: 'card', style: 'text-align:center' }, [
    gauge(readiness, 'Bereitschaft'),
    el('div', { class: 'muted', style: 'font-size:13px;margin-top:6px' },
      `${topics.length} Themen · ${masteredCount} gefestigt · ${dueTotal} fällig`),
    el('div', { class: 'row', style: 'gap:8px;margin-top:14px' }, [
      el('button', { class: 'btn btn--primary grow', onClick: () => navigate('/session?module=' + id) }, '🎯 Lernen'),
      el('button', { class: 'btn btn--ghost grow', onClick: () => navigate('/exam?module=' + id) }, '📝 Klausur'),
    ]),
  ]);

  // --- Klausurtermin & Lernzeit ---
  const dateInput = el('input', { type: 'date', style: field(), value: mod.examDate ? toDateInput(mod.examDate) : '' });
  const minInput = el('input', { type: 'number', min: '5', max: '600', step: '5', style: field(), value: String(mod.minutesPerDay ?? 30) });
  const savePlan = el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:10px', onClick: async () => {
    mod.examDate = dateInput.value ? new Date(dateInput.value + 'T09:00:00').getTime() : null;
    mod.minutesPerDay = Math.max(5, parseInt(minInput.value, 10) || 30);
    await put('modules', mod);
    toast('Lernplan gespeichert', 'ok');
  } }, 'Speichern');

  const planCard = el('div', { class: 'card' }, [
    el('div', { class: 'section-title', style: 'margin-top:0' }, 'Klausurtermin & Lernzeit'),
    el('label', { class: 'muted', style: 'font-size:12px' }, 'Klausurdatum'),
    dateInput,
    el('label', { class: 'muted', style: 'font-size:12px;margin-top:8px' }, 'Verfügbare Lernzeit pro Tag (Minuten)'),
    minInput,
    savePlan,
  ]);

  // --- Themenliste ---
  const topicList = topics.length ? el('div', { class: 'stack' }, topics.map((t) => el('div', { class: 'card' }, [
    el('div', { class: 'row row--between' }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'row', style: 'gap:8px' }, [
          el('strong', { style: 'font-size:15px' }, t.title),
          t.mastered ? el('span', { class: 'pill', style: 'background:rgba(34,197,94,.14);color:var(--ok)' }, '✓ gefestigt') : null,
        ]),
        el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' },
          `Wichtigkeit ${'★'.repeat(t.weight)}${'☆'.repeat(5 - t.weight)} · ${t.taskCount} Aufgaben` +
          (t.dueCount ? ` · ${t.dueCount} fällig` : '')),
      ]),
      el('span', { class: 'pill' }, `${t.readiness}%`),
    ]),
    el('div', { class: 'progress', style: 'margin-top:10px' }, [
      el('div', { class: 'progress__fill', style: `width:${t.readiness}%` }),
    ]),
  ]))) : el('p', { class: 'muted', style: 'font-size:14px' }, 'Noch keine Themen.');

  // --- Probeklausur hochladen (Feature 3) ---
  const examFile = el('input', { type: 'file', accept: '.pdf,.txt,application/pdf,text/plain', style: 'display:none', onChange: (e) => onExam(e.target.files[0]) });
  const examCard = el('div', { class: 'card' }, [
    el('div', { class: 'section-title', style: 'margin-top:0' }, 'Probeklausuren'),
    el('p', { class: 'muted', style: 'font-size:13px;line-height:1.5' },
      'Erhöht die Wichtigkeit häufig geprüfter Themen und ergänzt klausur-ähnliche Aufgaben für den Simulationsmodus.'),
    el('button', { class: 'btn btn--ghost btn--block', style: 'margin-top:6px', onClick: () => examFile.click() }, '📄 Probeklausur hochladen'),
    examFile,
  ]);

  async function onExam(file) {
    if (!file) return;
    const ov = showOverlay('Probeklausur wird analysiert…', { cancellable: true });
    try {
      ov.update('Text wird extrahiert…');
      const text = await fileToText(file, ({ page, total }) => ov.update(`Seite ${page} / ${total}…`));
      const currentTopics = await getAllBy('topics', 'moduleId', id);
      ov.update('KI vergleicht mit den Themen…');
      const analysis = await analyzeExam(text, currentTopics.map((t) => t.title), {
        signal: ov.signal,
        onProgress: ({ tokens, seconds }) => ov.update(`KI analysiert… ${tokens} Tokens · ${seconds}s`),
      });
      const applied = await applyExamAnalysis(id, currentTopics, analysis);
      await refreshModuleReadiness(id);
      ov.close();
      toast(`${applied.added} Klausuraufgaben ergänzt, ${applied.reweighted} Themen neu gewichtet`, 'ok');
      render(view, ctx); // neu laden
    } catch (e) {
      ov.close();
      if (e.name === 'AbortError') return toast('Abgebrochen', '');
      console.error(e);
      toast(e.message || 'Analyse fehlgeschlagen', 'err');
    }
  }

  // --- Danger Zone ---
  const dangerCard = el('div', { class: 'card' }, [
    el('button', { class: 'btn btn--ghost btn--block', style: 'border-color:var(--err);color:var(--err)', onClick: async () => {
      if (!confirm(`Modul „${mod.name}" mit allen Themen und Aufgaben löschen?`)) return;
      await deleteModuleCascade(id);
      toast('Modul gelöscht', 'ok');
      navigate('/modules');
    } }, 'Modul löschen'),
  ]);

  mount(view, header, planCard,
    el('div', { class: 'section-title' }, 'Themen'), topicList,
    el('div', { class: 'section-title' }, 'Klausurmaterial'), examCard,
    el('div', { class: 'section-title' }, 'Danger Zone'), dangerCard);
}

/** Wendet die Klausur-Analyse an: Gewichtung erhöhen + Aufgaben ergänzen. */
async function applyExamAnalysis(moduleId, topics, analysis) {
  const byTitle = new Map(topics.map((t) => [t.title.toLowerCase(), t]));
  const findTopic = (title) => {
    const key = (title || '').toLowerCase();
    if (byTitle.has(key)) return byTitle.get(key);
    for (const t of topics) if (key.includes(t.title.toLowerCase()) || t.title.toLowerCase().includes(key)) return t;
    return null;
  };

  let reweighted = 0;
  for (const g of analysis.themen_gewichtung || []) {
    const t = findTopic(g.titel);
    if (!t) continue;
    const bump = Math.max(0, (g.haeufigkeit ?? 0) - 1);
    if (bump > 0) {
      t.weight = Math.min(5, t.weight + bump);
      await put('topics', t);
      reweighted += 1;
    }
  }

  let added = 0;
  const grouped = new Map();
  for (const ka of analysis.klausur_aufgaben || []) {
    const t = findTopic(ka.thema_titel) || topics[0];
    if (!t) continue;
    if (!grouped.has(t.id)) grouped.set(t.id, []);
    grouped.get(t.id).push(ka.aufgabe);
  }
  for (const [topicId, aufgaben] of grouped) {
    const created = await addExamTasks(moduleId, topicId, aufgaben);
    added += created.length;
  }
  return { reweighted, added };
}

const field = () => 'width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-strong);background:var(--bg-elev-2);color:var(--text);min-height:48px';
const toDateInput = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
