// View: Schwäche vertiefen – zusätzliche, gut erklärte Aufgaben zu EINEM Thema.
import { el, mount, toast } from '../util/dom.js';
import { get, getAllBy, getSetting } from '../data/db.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';
import { showOverlay } from '../ui/loading.js';
import { renderMath } from '../util/math.js';
import { addTasksToTopic, refreshModuleReadiness } from '../data/model.js';
import { generateTopicTasks, buildTopicPrompt, parseTasksJson } from '../api/anthropic.js';

export async function render(view, ctx) {
  const moduleId = ctx.params.id;
  const topicId = ctx.query.get('topic');
  const topic = await get('topics', topicId);
  if (!topic) { navigate('/modules/' + moduleId); return; }
  setAppbar({ title: 'Schwäche vertiefen', showBack: true, onBack: () => navigate('/modules/' + moduleId) });

  // Häufigste Fehlerarten dieses Themas ermitteln.
  const reviews = await getAllBy('reviews', 'topicId', topicId);
  const counts = {};
  for (const r of reviews) for (const e of r.errorHistory || []) for (const tag of e.tags || []) counts[tag] = (counts[tag] || 0) + 1;
  const errorTags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
  const focus = { errorTags, count: 5 };

  const hasKey = !!(await getSetting('apiKey', ''));

  async function addAndReturn(aufgaben) {
    const added = await addTasksToTopic(moduleId, topicId, aufgaben, { fromExam: false });
    await refreshModuleReadiness(moduleId);
    toast(`${added.length} neue Aufgaben zu „${topic.title}"`, 'ok');
    navigate('/modules/' + moduleId);
  }

  // Weg A: automatisch (API)
  const genBtn = el('button', { class: 'btn btn--primary btn--block', onClick: async () => {
    if (!hasKey) return toast('Kein API-Key – nutze „Mit Claude Pro" unten', 'err');
    const ov = showOverlay('Zusatzaufgaben werden erstellt…', { cancellable: true });
    try {
      const aufgaben = await generateTopicTasks(topic, focus, {
        signal: ov.signal,
        onProgress: ({ tokens, seconds }) => ov.update(`KI generiert… ${tokens} Tokens · ${seconds}s`),
      });
      ov.close();
      await addAndReturn(aufgaben);
    } catch (e) { ov.close(); if (e.name === 'AbortError') return toast('Abgebrochen', ''); console.error(e); toast(e.message || 'Fehler', 'err'); }
  } }, '✨ Automatisch generieren (API-Key)');

  // Weg B: claude.ai-Import
  const promptOut = el('textarea', { readonly: true, rows: 5, style: field(true) + ';font-size:12px', placeholder: 'Prompt erscheint hier…' });
  const copyBtn = el('button', { class: 'btn btn--ghost btn--block', style: 'margin-top:8px', onClick: async () => {
    const p = buildTopicPrompt(topic, focus);
    promptOut.value = p;
    try { await navigator.clipboard.writeText(p); toast('Prompt kopiert', 'ok'); }
    catch { promptOut.focus(); promptOut.select(); toast('Prompt markiert – manuell kopieren', ''); }
  } }, '① Prompt erzeugen & kopieren');
  const jsonIn = el('textarea', { rows: 5, style: field(true) + ';font-size:12px', placeholder: 'Claudes JSON-Antwort hier einfügen…' });
  const importBtn = el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:8px', onClick: async () => {
    if (!jsonIn.value.trim()) return toast('Bitte JSON einfügen', 'err');
    try { await addAndReturn(parseTasksJson(jsonIn.value)); }
    catch (e) { console.error(e); toast(e.message || 'Import fehlgeschlagen', 'err'); }
  } }, '③ Aufgaben importieren');

  mount(view,
    el('h2', { class: 'page-title' }, 'Vertiefen'),
    el('div', { class: 'card' }, [
      renderMath(el('div', { style: 'font-weight:700;font-size:16px' }), topic.title),
      el('div', { class: 'muted', style: 'font-size:13px;margin-top:4px' }, `Bereitschaft ${topic.readiness ?? 0}%`),
      errorTags.length ? el('div', { style: 'margin-top:8px' }, [
        el('span', { class: 'muted', style: 'font-size:12px' }, 'Häufige Fehler: '),
        ...errorTags.map((t) => el('span', { class: 'pill badge-soon', style: 'margin-right:6px' }, t)),
      ]) : null,
      el('p', { class: 'muted', style: 'font-size:13px;line-height:1.5;margin-top:10px' },
        'Erzeugt 5 zusätzliche Aufgaben mit ausführlichen Erklärungen – gezielt auf diese Schwäche.'),
    ]),
    genBtn,
    el('div', { class: 'section-title' }, 'Ohne API-Key – mit Claude Pro'),
    el('div', { class: 'card' }, [
      el('p', { class: 'muted', style: 'font-size:13px' }, 'Prompt kopieren, in claude.ai ausführen, JSON zurück einfügen.'),
      copyBtn, promptOut, el('div', { style: 'height:8px' }), jsonIn, importBtn,
    ]),
  );
}

const field = (area = false) =>
  'width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-strong);background:var(--bg-elev-2);color:var(--text);' +
  (area ? 'resize:vertical;font-family:inherit' : 'min-height:48px');
