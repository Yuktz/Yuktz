// View: Neues Modul anlegen (Feature 2 – hier nur Struktur-Stub)
import { el, mount } from '../util/dom.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';
import { scaffoldNote, pageHeader } from '../ui/scaffold.js';

export async function render(view) {
  setAppbar({ title: 'Modul anlegen', showBack: true, onBack: () => navigate('/modules') });

  mount(view,
    pageHeader('Neues Modul', 'Name eingeben und Skript hochladen – die KI erstellt Themen & Aufgaben.'),
    scaffoldNote('Feature 2 · Modul anlegen & KI-Kursgenerierung', [
      'Modulname + PDF/Text-Skript hochladen',
      'Textextraktion clientseitig via pdf.js',
      'Aufruf an api.anthropic.com (Modell claude-opus-4-8, dein lokaler API-Key)',
      'Strukturierte JSON-Antwort → Themen & Übungsaufgaben',
      'Validierung + Retry bei ungültigem Format, Ladeanimation',
    ]),
  );
}
