// Vollbild-Ladeoverlay mit Fortschrittstext und Abbrechen-Option.
import { el } from '../util/dom.js';

export function showOverlay(title, { cancellable = false } = {}) {
  const status = el('div', { class: 'muted', style: 'font-size:13px;margin-top:8px;text-align:center;min-height:18px' }, '');
  const controller = new AbortController();
  const cancelBtn = cancellable
    ? el('button', { class: 'btn btn--ghost', style: 'margin-top:18px', onClick: () => controller.abort() }, 'Abbrechen')
    : null;

  const node = el('div', {
    style: 'position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;padding:24px;background:color-mix(in srgb,var(--bg) 88%,transparent);' +
      'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)',
  }, [
    el('div', { class: 'spinner' }),
    el('div', { style: 'font-weight:700;font-size:17px;margin-top:18px;text-align:center' }, title),
    status,
    cancelBtn,
  ]);
  document.body.append(node);

  return {
    update: (text) => { status.textContent = text; },
    close: () => node.remove(),
    signal: controller.signal,
  };
}
