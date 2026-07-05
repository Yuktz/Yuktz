// Hash-based router. Hash routing keeps the PWA a set of static files that
// work from any path (GitHub Pages, file server, offline cache) with no
// server-side rewrite rules.

const routes = [];
let notFound = null;
let current = null;

/**
 * Register a route.
 * @param {string} pattern e.g. '/modules' or '/modules/:id'
 * @param {(ctx: {params: object, query: URLSearchParams}) => void} handler
 * @param {{title?: string, tab?: string}} [meta]
 */
export function route(pattern, handler, meta = {}) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => {
    keys.push(m.slice(1));
    return '([^/]+)';
  }) + '$');
  routes.push({ pattern, rx, keys, handler, meta });
}

export function setNotFound(handler) { notFound = handler; }

export function navigate(path) {
  if (('#' + path) === location.hash) resolve();
  else location.hash = path;
}

export function currentPath() {
  return location.hash.slice(1) || '/modules';
}

function resolve() {
  const raw = currentPath();
  const [path, queryStr = ''] = raw.split('?');
  for (const r of routes) {
    const m = r.rx.exec(path);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    current = r;
    r.handler({ params, query: new URLSearchParams(queryStr) });
    window.dispatchEvent(new CustomEvent('route:changed', { detail: { path, meta: r.meta, params } }));
    return;
  }
  if (notFound) notFound({ path });
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  if (!location.hash) location.replace('#/modules');
  else resolve();
}
