// ExamCoach – app entry point. Registers routes, keeps the tab bar in sync,
// and installs the service worker for offline use.
import { route, setNotFound, startRouter, navigate } from './router.js';
import { el, mount } from './util/dom.js';
import { openDB } from './data/db.js';

import * as Modules from './views/modules.js';
import * as ModuleNew from './views/module-new.js';
import * as ModuleDetail from './views/module-detail.js';
import * as ChapterNew from './views/chapter-new.js';
import * as Deepen from './views/deepen.js';
import * as Session from './views/session.js';
import * as Exam from './views/exam.js';
import * as Stats from './views/stats.js';
import * as Settings from './views/settings.js';

const view = document.getElementById('view');

/** Wrap a view module so failures surface instead of a blank screen. */
function page(mod, tab) {
  return async (ctx) => {
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    setActiveTab(tab);
    try {
      await mod.render(view, ctx);
    } catch (err) {
      console.error('[view error]', err);
      mount(view, el('div', { class: 'empty' }, [
        el('span', { class: 'empty__emoji' }, '⚠️'),
        el('div', { class: 'empty__title' }, 'Etwas ist schiefgelaufen'),
        el('div', { class: 'empty__text' }, String(err && err.message || err)),
      ]));
    }
  };
}

/* ---------- Routes ---------- */
route('/modules', page(Modules, 'modules'));
route('/modules/new', page(ModuleNew, 'modules'));
route('/modules/:id/add-chapter', page(ChapterNew, 'modules'));
route('/modules/:id/deepen', page(Deepen, 'modules'));
route('/modules/:id', page(ModuleDetail, 'modules'));
route('/session', page(Session, 'session'));
route('/exam', page(Exam, 'exam'));
route('/stats', page(Stats, 'stats'));
route('/settings', page(Settings, 'modules'));
setNotFound(() => navigate('/modules'));

/* ---------- Tab bar active state ---------- */
function setActiveTab(tab) {
  document.querySelectorAll('.tab').forEach((a) => {
    a.classList.toggle('is-active', a.dataset.route === '/' + (tab || ''));
  });
}

/* ---------- Boot ---------- */
async function boot() {
  try {
    await openDB();
  } catch (err) {
    console.error('IndexedDB konnte nicht geöffnet werden', err);
  }
  startRouter();
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW-Registrierung fehlgeschlagen', err);
    });
  });
}

boot();
