// View: Statistiken – Fortschritt, Fehlermuster (Feature 7), Gamification (Feature 8).
import { el, mount } from '../util/dom.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';
import { getGamification, errorPatterns, overallStats } from '../data/progress.js';
import { barChart } from '../ui/charts.js';

export async function render(view) {
  setAppbar({ title: 'Statistiken', showBack: false });

  const [gam, errs, stats] = await Promise.all([getGamification(), errorPatterns(), overallStats()]);

  if (stats.totalAttempts === 0) {
    mount(view,
      el('h2', { class: 'page-title' }, 'Statistiken'),
      el('div', { class: 'empty' }, [
        el('span', { class: 'empty__emoji' }, '📊'),
        el('div', { class: 'empty__title' }, 'Noch keine Daten'),
        el('div', { class: 'empty__text' }, 'Sobald du Aufgaben bearbeitest, erscheinen hier dein Fortschritt und deine häufigsten Fehlerarten.'),
        el('button', { class: 'btn btn--primary', onClick: () => navigate('/session') }, 'Lernen starten'),
      ]));
    return;
  }

  // Gamification-Kacheln
  const gamGrid = el('div', { class: 'stat-grid' }, [
    stat(`🔥 ${gam.streak}`, 'Tage-Streak'),
    stat(`${gam.totalXp}`, 'XP gesamt'),
    stat(`${stats.accuracy}%`, 'Trefferquote'),
  ]);

  // Fehlermuster
  const errCard = errs.list.length
    ? el('div', { class: 'card' }, barChart(errs.list.map((e) => ({ label: e.tag, value: e.count })), { color: 'var(--warn)' }))
    : el('div', { class: 'card' }, el('span', { class: 'muted', style: 'font-size:14px' },
        errs.wrong ? 'Keine Fehlerarten getaggt.' : 'Bisher keine Fehler – weiter so! 💪'));

  // Bereitschaft pro Modul
  const modCard = stats.perModule.length
    ? el('div', { class: 'card' }, barChart(stats.perModule.map((m) => ({ label: m.name, value: m.readiness }))))
    : null;

  mount(view,
    el('h2', { class: 'page-title' }, 'Statistiken'),
    el('p', { class: 'page-sub' }, `${stats.totalAttempts} Aufgaben an ${stats.learnDays} Lerntagen bearbeitet`),
    el('div', { class: 'section-title' }, 'Überblick'), gamGrid,
    el('div', { class: 'section-title' }, 'Häufigste Fehlerarten'), errCard,
    modCard ? el('div', { class: 'section-title' }, 'Bereitschaft pro Modul') : null, modCard,
  );
}

function stat(value, label) {
  return el('div', { class: 'stat' }, [el('div', { class: 'stat__value' }, value), el('div', { class: 'stat__label' }, label)]);
}
