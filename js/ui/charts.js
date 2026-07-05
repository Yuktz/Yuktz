// Kleine, abhängigkeitsfreie Inline-SVG-Diagramme (theme-aware via currentColor).
import { el } from '../util/dom.js';

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

/** Ring-/Gauge-Anzeige für einen Prozentwert. */
export function gauge(percent, label = '') {
  const p = Math.max(0, Math.min(100, percent));
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - p / 100);
  const root = svg('svg', { viewBox: '0 0 120 120', width: '120', height: '120' }, [
    svg('circle', { cx: 60, cy: 60, r, fill: 'none', stroke: 'var(--bg-elev-2)', 'stroke-width': 12 }),
    svg('circle', {
      cx: 60, cy: 60, r, fill: 'none', stroke: 'url(#g)', 'stroke-width': 12,
      'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': off,
      transform: 'rotate(-90 60 60)',
    }),
    svg('defs', {}, [
      (() => {
        const grad = svg('linearGradient', { id: 'g', x1: 0, y1: 0, x2: 1, y2: 1 });
        grad.append(svg('stop', { offset: '0%', 'stop-color': 'var(--brand)' }));
        grad.append(svg('stop', { offset: '100%', 'stop-color': 'var(--brand-2)' }));
        return grad;
      })(),
    ]),
    svg('text', { x: 60, y: 58, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 26, 'font-weight': 800 }, [document.createTextNode(p + '%')]),
    label ? svg('text', { x: 60, y: 78, 'text-anchor': 'middle', fill: 'var(--text-dim)', 'font-size': 11 }, [document.createTextNode(label)]) : null,
  ]);
  return root;
}

/** Horizontales Balkendiagramm: [{label, value}]. */
export function barChart(data, { color = 'var(--brand)' } = {}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return el('div', { class: 'stack', style: 'gap:10px' },
    data.map((d) => el('div', {}, [
      el('div', { class: 'row row--between', style: 'font-size:13px;margin-bottom:4px' }, [
        el('span', {}, d.label), el('span', { class: 'muted' }, String(d.value)),
      ]),
      el('div', { class: 'progress' }, [
        el('div', { class: 'progress__fill', style: `width:${Math.round((d.value / max) * 100)}%;background:${color}` }),
      ]),
    ])),
  );
}

/** Linien-Diagramm für die Soll-Kurve mit „Stand heute"-Marker. */
export function lineChart(curve, istPercent) {
  const W = 320, H = 140, pad = 24;
  const n = curve.length;
  const x = (i) => pad + (i / Math.max(1, n - 1)) * (W - 2 * pad);
  const y = (v) => H - pad - (v / 100) * (H - 2 * pad);
  const pts = curve.map((c, i) => `${x(i)},${y(c.soll)}`).join(' ');
  return svg('svg', { viewBox: `0 0 ${W} ${H}`, style: 'width:100%;height:auto;max-width:420px;display:block' }, [
    // Achsen
    svg('line', { x1: pad, y1: H - pad, x2: W - pad, y2: H - pad, stroke: 'var(--border-strong)', 'stroke-width': 1 }),
    svg('line', { x1: pad, y1: pad, x2: pad, y2: H - pad, stroke: 'var(--border-strong)', 'stroke-width': 1 }),
    // Soll-Kurve
    svg('polyline', { points: pts, fill: 'none', stroke: 'var(--brand)', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    // Stand-heute-Marker
    svg('circle', { cx: x(0), cy: y(istPercent), r: 5, fill: 'var(--warn)' }),
    svg('text', { x: x(0) + 8, y: y(istPercent) - 6, fill: 'var(--warn)', 'font-size': 11 }, [document.createTextNode('heute ' + istPercent + '%')]),
    svg('text', { x: W - pad, y: y(100) - 4, 'text-anchor': 'end', fill: 'var(--text-mute)', 'font-size': 10 }, [document.createTextNode('Soll 100%')]),
  ]);
}
