// Controls the top app bar (title, optional back button, action buttons).
import { el, mount } from '../util/dom.js';

/**
 * @param {{title:string, showBack?:boolean, onBack?:Function,
 *          actions?:{icon:string,label:string,onClick:Function}[]}} opts
 */
export function setAppbar({ title, showBack = false, onBack, actions = [] }) {
  const titleEl = document.getElementById('appbarTitle');
  const backBtn = document.getElementById('backBtn');
  const actionsEl = document.getElementById('appbarActions');

  titleEl.textContent = title;

  backBtn.hidden = !showBack;
  backBtn.onclick = showBack ? (onBack || (() => history.back())) : null;

  mount(actionsEl, actions.map((a) =>
    el('button', {
      class: 'appbar__back',
      style: 'font-size:19px;color:var(--text-dim)',
      'aria-label': a.label,
      title: a.label,
      onClick: a.onClick,
    }, a.icon),
  ));
}
