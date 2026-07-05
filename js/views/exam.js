// View: Klausur-Modus (Struktur-Stub – Logik ab Feature 5/6)
import { mount } from '../util/dom.js';
import { setAppbar } from '../ui/appbar.js';
import { scaffoldNote, pageHeader } from '../ui/scaffold.js';

export async function render(view) {
  setAppbar({ title: 'Klausur-Modus', showBack: false });
  mount(view,
    pageHeader('Klausur-Modus', 'Lernplan bis zum Termin und Klausur-Simulation.'),
    scaffoldNote('Feature 5 · Klausur-Modus mit Lernplan', [
      'Klausurdatum + Lernzeit/Tag eintragen',
      'Rückwärts-Tagesplan bis zum Mastery-Schwellenwert',
      'Kürzere Wiederholungsintervalle je näher der Termin',
      'Verpasster Tag → automatische Neuberechnung (kein Schuldgefühl-Design)',
      'Ehrlicher Bereitschafts-Score statt Bestehens-Garantie',
    ]),
    scaffoldNote('Feature 6 · Klausur-Simulation', [
      'Zeitlich begrenzter Testlauf, gemischte Aufgaben aller Themen',
      'Aufgaben aus hochgeladenen Probeklausuren',
      'Auswertung nach Thema, nicht nur Gesamtpunktzahl',
    ]),
  );
}
