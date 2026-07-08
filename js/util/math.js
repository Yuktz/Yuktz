// LaTeX-Rendering via KaTeX (lokal eingebunden, offline). Skripte im
// LaTeX-Format kommen häufig vor – Mathe-Ausdrücke sollen als Formel und
// nicht als Rohtext erscheinen.
import { el } from './dom.js';

const DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '$', right: '$', display: false },
];

/**
 * Setzt `text` in `node` und rendert enthaltene LaTeX-Formeln.
 * Fällt bei fehlendem KaTeX oder Fehlern auf Rohtext zurück.
 */
export function renderMath(node, text) {
  node.textContent = text ?? '';
  const auto = window.renderMathInElement;
  if (auto) {
    try {
      auto(node, { delimiters: DELIMITERS, throwOnError: false, ignoredTags: ['script', 'style', 'textarea', 'pre'] });
    } catch { /* Rohtext bleibt stehen */ }
  }
  return node;
}

/** Praktischer Wrapper: erzeugt ein Element mit gerendertem LaTeX-Text. */
export function mathEl(tag, props, text) {
  const node = el(tag, props);
  return renderMath(node, text);
}
