// View: Lern-Session (Struktur-Stub – Logik ab Feature 4)
import { mount } from '../util/dom.js';
import { setAppbar } from '../ui/appbar.js';
import { scaffoldNote, pageHeader } from '../ui/scaffold.js';

export async function render(view) {
  setAppbar({ title: 'Lern-Session', showBack: false });
  mount(view,
    pageHeader('Lern-Session', 'Fällige Aufgaben aus verschiedenen Themen – gemischt (Interleaving).'),
    scaffoldNote('Feature 4 · Spaced Repetition & Interleaving', [
      'Half-Life-Regression: Halbwertszeit steigt/sinkt je Antwort',
      'Interleaving: fällige Aufgaben mehrerer Themen gemischt',
      'Mastery: Thema erst „gefestigt" nach ≥3 verschiedenen Sessions richtig',
      'Confidence-Abfrage nach jeder Aufgabe (Feature 8)',
      'Rechenweg-Eingabe & Fehlerart-Erkennung (Feature 7)',
    ]),
  );
}
