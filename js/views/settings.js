// View: Einstellungen. Foundational: lokaler API-Key + Daten-Reset.
import { el, mount, toast } from '../util/dom.js';
import { getSetting, setSetting } from '../data/db.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';

export async function render(view) {
  setAppbar({ title: 'Einstellungen', showBack: true, onBack: () => navigate('/modules') });

  const existingKey = await getSetting('apiKey', '');

  const keyInput = el('input', {
    type: 'password',
    value: existingKey,
    placeholder: 'sk-ant-…',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    style: 'width:100%;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--border-strong);background:var(--bg-elev-2);color:var(--text)',
  });

  const save = el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:12px', onClick: async () => {
    await setSetting('apiKey', keyInput.value.trim());
    toast('API-Key gespeichert', 'ok');
  }}, 'API-Key speichern');

  mount(view,
    el('h2', { class: 'page-title' }, 'Einstellungen'),

    el('div', { class: 'section-title' }, 'Anthropic API-Key'),
    el('div', { class: 'card' }, [
      el('p', { class: 'muted', style: 'font-size:13px;line-height:1.5;margin-bottom:12px' },
        'Wird nur lokal in diesem Browser (IndexedDB) gespeichert und ausschließlich für Aufrufe an api.anthropic.com bei der Kursgenerierung verwendet. Wird an keinen anderen Server gesendet.'),
      keyInput,
      save,
    ]),

    el('div', { class: 'section-title' }, 'Datenschutz & Offline'),
    el('div', { class: 'card' }, [
      el('p', { class: 'muted', style: 'font-size:13px;line-height:1.6' },
        'Kein Login, kein Backend, kein Tracking. Alle Module, Aufgaben und Lernfortschritte liegen ausschließlich auf diesem Gerät. Bereits generierte Inhalte funktionieren offline.'),
    ]),

    el('div', { class: 'section-title' }, 'Danger Zone'),
    el('div', { class: 'card' }, [
      el('button', { class: 'btn btn--ghost btn--block', style: 'border-color:var(--err);color:var(--err)', onClick: async () => {
        if (!confirm('Wirklich ALLE lokalen Daten löschen? Das kann nicht rückgängig gemacht werden.')) return;
        indexedDB.deleteDatabase('examcoach');
        toast('Alle Daten gelöscht', 'ok');
        setTimeout(() => location.reload(), 800);
      }}, 'Alle lokalen Daten löschen'),
    ]),
  );
}
