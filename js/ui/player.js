// Aufgaben-Player: rendert eine Aufgabe, nimmt die Antwort entgegen, wertet aus
// und (im Lernmodus) fragt Confidence/Fehlerart ab.
//
// Auswertung:
//  - mc / number  → automatisch (eindeutig prüfbar); number mit Symbolleiste.
//  - cloze        → automatisch, wenn die Lösung einfach tippbar ist, sonst
//                   Selbsteinschätzung (Lösung anzeigen → selbst bewerten).
//  - worked       → immer Selbsteinschätzung (Rechenweg + Lösung ansehen).
//  - examMode     → alles automatisch per Best-Effort-Vergleich (Simulation).
import { el, mount } from '../util/dom.js';
import { renderMath, mathEl } from '../util/math.js';
import { FEHLERARTEN } from '../api/anthropic.js';

const CONFIDENCE = [
  { key: 'low', label: 'unsicher', emoji: '😐' },
  { key: 'mid', label: 'mittel', emoji: '🙂' },
  { key: 'high', label: 'sicher', emoji: '😎' },
];
const SELF_RATE = [
  { correct: false, conf: 'low', label: 'Nicht gewusst', emoji: '❌' },
  { correct: true, conf: 'low', label: 'Unsicher', emoji: '🤔' },
  { correct: true, conf: 'high', label: 'Sicher', emoji: '✅' },
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
// „Einfach tippbar": kurz, kein LaTeX, keine Sonderzeichen.
function isTypeable(ans) {
  const s = String(ans || '');
  if (/[$\\^_{}]/.test(s)) return false;
  return /^[\p{L}\p{N} .,\-]{1,24}$/u.test(s);
}

export function renderTask(container, { task, topic, index, total, examMode = false, onGraded }) {
  const selfGraded = !examMode && (task.type === 'worked' || (task.type === 'cloze' && !isTypeable(task.answer)));
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

  let getAnswer = () => userAnswer;

  // --- Eingabefeld je nach Typ ---
  if (task.type === 'mc') {
    const opts = task.options.length ? task.options : [task.answer];
    const btns = opts.map((opt) => {
      const b = el('button', { class: 'btn btn--ghost btn--block', style: 'justify-content:flex-start;text-align:left;height:auto;min-height:var(--tap);padding-top:10px;padding-bottom:10px', onClick: () => {
        selectedOption = opt;
        btns.forEach((x) => { x.classList.remove('is-sel'); x.style.borderColor = ''; });
        b.classList.add('is-sel'); b.style.borderColor = 'var(--brand)';
      } }, renderMath(el('span'), opt));
      return b;
    });
    mount(inputWrap, btns);
    getAnswer = () => selectedOption;
  } else if (task.type === 'number') {
    const inp = textField('Zahl eingeben…', 'decimal');
    inp.oninput = () => { userAnswer = inp.value; };
    mount(inputWrap, inp, symbolBar(inp, ['−', ',', '.', '±', '⌫']));
  } else if (selfGraded) {
    if (task.type === 'worked') {
      const steps = el('textarea', { rows: 3, placeholder: 'Rechenweg / Notizen (optional)…', style: fieldStyle(true) });
      steps.oninput = () => { userSteps = steps.value; };
      mount(inputWrap, el('label', { class: 'muted', style: 'font-size:12px' }, 'Dein Rechenweg (optional)'), steps);
    } else {
      mount(inputWrap, el('p', { class: 'muted', style: 'font-size:13px' }, 'Überlege dir die Antwort, dann Lösung anzeigen und ehrlich selbst einschätzen.'));
    }
  } else { // cloze (tippbar)
    const inp = textField('Antwort eingeben…', 'text');
    inp.oninput = () => { userAnswer = inp.value; };
    mount(inputWrap, inp, symbolBar(inp, ['−', '²', '³', '⌫']));
  }

  function evaluate() {
    const a = getAnswer();
    if (task.type === 'mc') return a === task.answer;
    if (task.type === 'number') return numbersMatch(a, task.answer);
    if (task.type === 'worked') return numbersMatch(a, task.answer) || normText(a) === normText(task.answer);
    return normText(a) === normText(task.answer);
  }

  function finish(correct, confidence) {
    onGraded({
      correct, confidence, errorTags: [...errorTags],
      userAnswer: task.type === 'mc' ? (selectedOption || '') : userAnswer, userSteps,
    });
  }

  // --- Aktion je nach Modus ---
  if (selfGraded) {
    const revealBtn = el('button', { class: 'btn btn--primary btn--block', onClick: onReveal }, 'Lösung anzeigen');
    mount(actionWrap, revealBtn);
  } else {
    const checkBtn = el('button', { class: 'btn btn--primary btn--block', onClick: onCheck }, 'Antwort prüfen');
    mount(actionWrap, checkBtn);
  }

  function solutionCard(showCorrectness, correct) {
    return el('div', { class: 'card', style: `border-color:${showCorrectness ? (correct ? 'var(--ok)' : 'var(--err)') : 'var(--border-strong)'}` }, [
      showCorrectness ? el('div', { class: 'row', style: 'gap:8px;font-weight:700' }, [el('span', {}, correct ? '✅ Richtig' : '❌ Nicht ganz')]) : null,
      el('div', { style: 'margin-top:8px;font-size:14px' }, [
        el('span', { class: 'muted' }, 'Lösung: '), renderMath(el('strong'), task.answer),
      ]),
      task.steps.length ? el('div', { style: 'margin-top:10px' }, [
        el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:4px' }, 'Lösungsweg'),
        el('ol', { style: 'margin:0;padding-left:18px;line-height:1.6;font-size:14px' }, task.steps.map((s) => renderMath(el('li'), s))),
      ]) : null,
    ]);
  }

  function onReveal() {
    const rate = el('div', { style: 'margin-top:14px' }, [
      el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:6px' }, 'Wie gut konntest du es?'),
      el('div', { class: 'row', style: 'gap:8px' }, SELF_RATE.map((r) =>
        el('button', { class: 'btn btn--ghost grow', onClick: () => finish(r.correct, r.conf) }, `${r.emoji} ${r.label}`))),
    ]);
    mount(feedbackWrap, solutionCard(false), rate);
    mount(actionWrap);
    inputWrap.style.opacity = '0.7';
    feedbackWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function onCheck() {
    const correct = evaluate();
    if (examMode) { finish(correct, 'mid'); return; }

    const blocks = [solutionCard(true, correct)];

    if (!correct && (task.type === 'number' || task.errorTags.length)) {
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

    blocks.push(el('div', { style: 'margin-top:14px' }, [
      el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:6px' }, 'Wie sicher warst du?'),
      el('div', { class: 'row', style: 'gap:8px' }, CONFIDENCE.map((c) =>
        el('button', { class: 'btn btn--ghost grow', onClick: () => finish(correct, c.key) }, `${c.emoji} ${c.label}`))),
    ]));

    mount(feedbackWrap, blocks);
    mount(actionWrap);
    inputWrap.style.pointerEvents = 'none';
    inputWrap.style.opacity = '0.7';
    feedbackWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  mount(container, head, question, inputWrap, feedbackWrap, actionWrap);
}

/* ---------- Eingabe-Helfer ---------- */

function fieldStyle(area = false) {
  return `width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-strong);` +
    `background:var(--bg-elev-2);color:var(--text);${area ? 'resize:vertical;font-family:inherit' : 'min-height:48px'}`;
}
function textField(placeholder, inputmode) {
  return el('input', { type: 'text', inputmode, placeholder, autocomplete: 'off', autocapitalize: 'off', style: fieldStyle(false) });
}

/** Kleine „virtuelle Tastatur" mit Sonderzeichen für Eingabefelder. */
function symbolBar(input, symbols) {
  return el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' },
    symbols.map((sym) => el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm', style: 'min-width:44px',
      onClick: () => applySymbol(input, sym),
    }, sym)));
}
function applySymbol(input, sym) {
  const s = input.selectionStart ?? input.value.length;
  const e = input.selectionEnd ?? s;
  let pos = s;
  if (sym === '⌫') {
    if (s === e && s > 0) { input.value = input.value.slice(0, s - 1) + input.value.slice(e); pos = s - 1; }
    else { input.value = input.value.slice(0, s) + input.value.slice(e); pos = s; }
  } else {
    const ins = sym === '−' ? '-' : sym;
    input.value = input.value.slice(0, s) + ins + input.value.slice(e);
    pos = s + ins.length;
  }
  input.focus();
  try { input.setSelectionRange(pos, pos); } catch { /* inputmode kann Selection blockieren */ }
  input.dispatchEvent(new Event('input'));
}
