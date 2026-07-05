// View: Modul-Detail (Struktur-Stub – füllt sich ab Feature 2)
import { el, mount } from '../util/dom.js';
import { get } from '../data/db.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';
import { scaffoldNote } from '../ui/scaffold.js';

export async function render(view, ctx) {
  const id = ctx.params.id;
  const module = await get('modules', id);

  setAppbar({
    title: module ? module.name : 'Modul',
    showBack: true,
    onBack: () => navigate('/modules'),
  });

  if (!module) {
    mount(view, el('div', { class: 'empty' }, [
      el('span', { class: 'empty__emoji' }, '🤷'),
      el('div', { class: 'empty__title' }, 'Modul nicht gefunden'),
      el('button', { class: 'btn btn--ghost', onClick: () => navigate('/modules') }, 'Zur Übersicht'),
    ]));
    return;
  }

  mount(view,
    el('h2', { class: 'page-title' }, module.name),
    el('p', { class: 'page-sub' }, `${module.topicCount ?? 0} Themen · Bereitschaft ${module.readiness ?? 0}%`),
    el('div', { class: 'row', style: 'margin-top:12px;gap:8px' }, [
      el('button', { class: 'btn btn--primary grow', onClick: () => navigate('/session?module=' + id) }, '🎯 Lernen'),
      el('button', { class: 'btn btn--ghost grow', onClick: () => navigate('/exam?module=' + id) }, '📝 Klausur-Modus'),
    ]),
    scaffoldNote('Modul-Detail (ab Feature 2)', [
      'Themenliste mit Bereitschafts-Score & Gewichtung',
      'Probeklausuren hochladen (Feature 3)',
      'Klausurtermin & Lernzeit/Tag einstellen (Feature 5)',
      'Fortschritts-/Burndown-Chart',
    ]),
  );
}
