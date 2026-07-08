// Tiny DOM helpers – keeps the vanilla views readable without a framework.

/** Create an element from a tag, props and children. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Replace all children of a container. */
export function mount(container, ...nodes) {
  container.replaceChildren(...nodes.flat().filter(Boolean));
}

export const $ = (sel, root = document) => root.querySelector(sel);

/** Lightweight non-blocking toast. */
export function toast(message, kind = '') {
  let host = $('.toast-host');
  if (!host) {
    host = el('div', { class: 'toast-host' });
    document.body.append(host);
  }
  const t = el('div', { class: `toast ${kind ? 'toast--' + kind : ''}` }, message);
  host.append(t);
  setTimeout(() => {
    t.style.transition = 'opacity .25s ease, transform .25s ease';
    t.style.opacity = '0';
    t.style.transform = 'translateY(6px)';
    setTimeout(() => t.remove(), 260);
  }, 2400);
}
