// Aufgaben-Player: rendert eine Aufgabe, nimmt die Antwort entgegen, wertet aus
// und (im Lernmodus) fragt Fehlerart & Confidence ab. Wird von Lern-Session und
// Klausur-Simulation genutzt.
import { el, mount } from '../util/dom.js';
import { renderMath, mathEl } from '../util/math.js';
import { FEHLERARTEN } from '../api/anthropic.js';

const CONFIDENCE = [
  { key: 'low', label: 'unsicher', emoji: '😐' },
  { key: 'mid', label: 'mittel', emoji: '🙂' },
  { key: 'high', label: 'sicher', emoji: '😎' },
];

function normText(s) {
  return String(s).trim().toLowerCase().replace(/[.,;:!?]+$/g, '').replace(/\s+/g, ' ');
}
function parseNum(s) {
  const m = String(s).replace(/\s/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}
function numbersMatch(a, b) {
  const x = parseNum(a), y = parseNum(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return false;
  const tol = Math.max(1e-6, Math.abs(y) * 1e-3);
  return Math.abs(x - y) <= tol;
}

/**
 * @param {HTMLElement} container
 * @param {{task,topic,index,total,examMode?:boolean,onGraded:Function}} opts
 */
export function renderTask(container, { task, topic, index, total, examMode = false, onGraded }) {
  let selectedOption = null;
  let userSteps = '';
  let userAnswer = '';
  const errorTags = new Set();

  const head = el('div', { class: 'row row--between', style: 'margin-bottom:4px' }, [
    el('span', { class: 'pill' }, `${index + 1} / ${total}`),
    examMode ? el('span', { class: 'muted', style: 'font-size:12px' }, 'Klausur-Modus')
      : el('span', { class: 'muted', style: 'font-size:12px' }, topic?.title || ''),
  ]);
  const question = mathEl('div', { class: 'card', style: 'white-space:pre-wrap;font-size:16px;line-height:1.5' }, task.question);

  const inputWrap = el('div', { class: 'stack', style: 'margin-top:14px' });
  const feedbackWrap = el('div', {});
  const actionWrap = el('div', { style: 'margin-top:14px' });

  // --- Eingabefeld je nach Typ ---
  let getAnswer = () => userAnswer;
  if (task.type === 'mc') {
    const opts = task.options.length ? task.options : [task.answer];
    const btns = opts.map((opt) => {
      const b = el('button', { class: 'btn btn--ghost btn--block', style: 'justify-content:flex-start;text-align:left;height:auto;min-height:var(--tap);padding-top:10px;padding-bottom:10px', onClick: () => {
        selectedOption = opt;
        btns.forEach((x) => x.classList.remove('is-sel'));
        b.classList.add('is-sel');
        b.style.borderColor = 'var(--brand)';
        btns.forEach((x) => { if (x !== b) x.style.borderColor = ''; });
      } }, renderMath(el('span'), opt));
      return b;
    });
    mount(inputWrap, btns);
    getAnswer = () => selectedOption;
  } else if (task.type === 'number') {
    const inp = numberInput('Zahl eingeben…', 'decimal');
    inp.oninput = () => { userAnswer = inp.value; };
    mount(inputWrap, inp);
  } else if (task.type === 'worked') {
    const ans = numberInput('Endergebnis…', 'text');
    ans.oninput = () => { userAnswer = ans.value; };
    const steps = el('textarea', {
      rows: 4, placeholder: 'Rechenweg / Schritte (optional, für Fehleranalyse)…',
      style: fieldStyle(true),
    });
    steps.oninput = () => { userSteps = steps.value; };
    mount(inputWrap, el('label', { class: 'muted', style: 'font-size:12px' }, 'Endergebnis'), ans,
      el('label', { class: 'muted', style: 'font-size:12px;margin-top:6px' }, 'Rechenweg'), steps);
  } else { // cloze
    const inp = numberInput('Antwort eingeben…', 'text');
    inp.oninput = () => { userAnswer = inp.value; };
    mount(inputWrap, inp);
  }

  function evaluate() {
    const a = getAnswer();
    if (task.type === 'mc') return a === task.answer;
    if (task.type === 'number') return numbersMatch(a, task.answer);
    if (task.type === 'worked') return numbersMatch(a, task.answer) || normText(a) === normText(task.answer);
    return normText(a) === normText(task.answer);
  }

  const checkBtn = el('button', { class: 'btn btn--primary btn--block', onClick: onCheck }, 'Antwort prüfen');
  mount(actionWrap, checkBtn);

  function finish(correct, confidence) {
    onGraded({
      correct, confidence,
      errorTags: [...errorTags],
      userAnswer: task.type === 'mc' ? (selectedOption || '') : userAnswer,
      userSteps,
    });
  }

  function onCheck() {
    const correct = evaluate();

    if (examMode) {
      // Klausur: keine Hinweise, sofort weiter (Confidence neutral).
      finish(correct, 'mid');
      return;
    }

    // Feedback anzeigen
    const badge = el('div', { class: 'card', style: `border-color:${correct ? 'var(--ok)' : 'var(--err)'}` }, [
      el('div', { class: 'row', style: 'gap:8px;font-weight:700' }, [
        el('span', {}, correct ? '✅ Richtig' : '❌ Nicht ganz'),
      ]),
      !correct ? el('div', { style: 'margin-top:8px;font-size:14px' }, [
        el('span', { class: 'muted' }, 'Lösung: '), renderMath(el('strong'), task.answer),
      ]) : null,
      task.steps.length ? el('div', { style: 'margin-top:10px' }, [
        el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:4px' }, 'Lösungsweg'),
        el('ol', { style: 'margin:0;padding-left:18px;line-height:1.5;font-size:14px' },
          task.steps.map((s) => renderMath(el('li'), s))),
      ]) : null,
    ]);

    const blocks = [badge];

    // Fehlerart-Auswahl bei falschen Rechen-/Zahlenaufgaben (Feature 7)
    if (!correct && (task.type === 'worked' || task.type === 'number' || task.errorTags.length)) {
      const tags = (task.errorTags.length ? task.errorTags : FEHLERARTEN);
      const chips = tags.map((tag) => {
        const c = el('button', { class: 'btn btn--ghost btn--sm', onClick: () => {
          if (errorTags.has(tag)) { errorTags.delete(tag); c.style.borderColor = ''; c.style.color = ''; }
          else { errorTags.add(tag); c.style.borderColor = 'var(--warn)'; c.style.color = 'var(--warn)'; }
        } }, tag);
        return c;
      });
      blocks.push(el('div', { style: 'margin-top:12px' }, [
        el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:6px' }, 'Welche Fehlerart? (optional)'),
        el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' }, chips),
      ]));
    }

    // Confidence-Abfrage (Feature 8) – schließt die Aufgabe ab.
    blocks.push(el('div', { style: 'margin-top:14px' }, [
      el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:6px' }, 'Wie sicher warst du?'),
      el('div', { class: 'row', style: 'gap:8px' },
        CONFIDENCE.map((c) => el('button', { class: 'btn btn--ghost grow', onClick: () => finish(correct, c.key) },
          `${c.emoji} ${c.label}`))),
    ]));

    mount(feedbackWrap, blocks);
    mount(actionWrap); // Prüf-Button entfernen
    inputWrap.style.pointerEvents = 'none';
    inputWrap.style.opacity = '0.7';
    feedbackWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  mount(container, head, question, inputWrap, feedbackWrap, actionWrap);
}

function fieldStyle(area = false) {
  return `width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-strong);` +
    `background:var(--bg-elev-2);color:var(--text);${area ? 'resize:vertical;font-family:inherit' : 'min-height:48px'}`;
}
function numberInput(placeholder, inputmode) {
  return el('input', { type: 'text', inputmode, placeholder, autocomplete: 'off', style: fieldStyle(false) });
}
