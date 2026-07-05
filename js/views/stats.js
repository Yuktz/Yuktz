// View: Statistiken (Struktur-Stub – Logik ab Feature 7/8)
import { mount } from '../util/dom.js';
import { setAppbar } from '../ui/appbar.js';
import { scaffoldNote, pageHeader } from '../ui/scaffold.js';

export async function render(view) {
  setAppbar({ title: 'Statistiken', showBack: false });
  mount(view,
    pageHeader('Statistiken', 'Fortschritt, Fehlermuster und Gamification.'),
    scaffoldNote('Feature 7 · Fehlermuster-Tracking', [
      'Welche Fehlerarten häufen sich (Vorzeichen-, Rechen-, Konzept-, Formelfehler)',
      'Pro Modul und modulübergreifend',
    ]),
    scaffoldNote('Feature 8 · Confidence & Gamification', [
      'XP pro Aufgabe, Tages-Streak',
      'Fortschrittsbalken pro Thema und Modul',
      'Confidence-Verlauf – dezent gehalten',
    ]),
  );
}
