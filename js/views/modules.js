// View: Module-Übersicht (Startseite)
import { el, mount, toast } from '../util/dom.js';
import { getAll } from '../data/db.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';

export async function render(view) {
  setAppbar({ title: 'ExamCoach', showBack: false, actions: [
    { icon: '⚙️', label: 'Einstellungen', onClick: () => navigate('/settings') },
  ]});

  const modules = await getAll('modules');

  const header = el('div', {}, [
    el('h2', { class: 'page-title' }, 'Deine Module'),
    el('p', { class: 'page-sub' }, 'Lokal auf diesem Gerät gespeichert · offline verfügbar'),
  ]);

  let body;
  if (modules.length === 0) {
    body = el('div', { class: 'empty' }, [
      el('span', { class: 'empty__emoji' }, '📚'),
      el('div', { class: 'empty__title' }, 'Noch keine Module'),
      el('div', { class: 'empty__text' }, 'Lege dein erstes Modul an und lade ein Skript hoch – ExamCoach erstellt daraus Themen und Übungsaufgaben.'),
      el('button', { class: 'btn btn--primary', onClick: () => navigate('/modules/new') }, '＋ Modul anlegen'),
    ]);
  } else {
    body = el('div', { class: 'stack' },
      modules.map((m) => el('div', {
        class: 'card card--link',
        onClick: () => navigate('/modules/' + m.id),
      }, [
        el('div', { class: 'row row--between' }, [
          el('div', { class: 'grow' }, [
            el('h3', { style: 'font-size:17px;font-weight:750;letter-spacing:-.02em' }, m.name),
            el('div', { class: 'muted', style: 'font-size:13px;margin-top:2px' },
              `${(m.topicCount ?? 0)} Themen · Bereitschaft ${(m.readiness ?? 0)}%`),
          ]),
          el('span', { class: 'pill' }, `${m.readiness ?? 0}%`),
        ]),
        el('div', { class: 'progress', style: 'margin-top:12px' }, [
          el('div', { class: 'progress__fill', style: `width:${m.readiness ?? 0}%` }),
        ]),
      ])),
    );
  }

  const addBtn = modules.length > 0
    ? el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:16px', onClick: () => navigate('/modules/new') }, '＋ Neues Modul')
    : null;

  mount(view, header, body, addBtn);
}
