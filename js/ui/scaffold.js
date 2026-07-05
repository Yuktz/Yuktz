// Placeholder block used by Feature-1 stub views so the navigation skeleton
// is walkable before each feature's logic lands.
import { el } from '../util/dom.js';

export function scaffoldNote(feature, items = []) {
  return el('div', { class: 'scaffold-note' }, [
    el('strong', {}, `🚧 ${feature}`),
    el('div', { style: 'margin-top:6px' }, 'Kommt in einem der nächsten Schritte. Geplanter Funktionsumfang:'),
    el('ul', { style: 'margin:8px 0 0;padding-left:18px;line-height:1.6' },
      items.map((i) => el('li', {}, i))),
  ]);
}

export function pageHeader(title, sub) {
  return el('div', {}, [
    el('h2', { class: 'page-title' }, title),
    sub ? el('p', { class: 'page-sub' }, sub) : null,
  ]);
}
