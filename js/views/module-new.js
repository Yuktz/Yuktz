// View: Neues Modul anlegen & KI-Kursgenerierung (Feature 2).
import { el, mount, toast } from '../util/dom.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';
import { showOverlay } from '../ui/loading.js';
import { getSetting } from '../data/db.js';
import { createModule, saveGeneratedCourse, refreshModuleReadiness } from '../data/model.js';
import { fileToText } from '../api/pdf.js';
import { generateCourse } from '../api/anthropic.js';

export async function render(view) {
  setAppbar({ title: 'Modul anlegen', showBack: true, onBack: () => navigate('/modules') });

  const hasKey = !!(await getSetting('apiKey', ''));

  const nameInput = el('input', {
    type: 'text', placeholder: 'z. B. Lineare Algebra',
    style: field(), autocapitalize: 'sentences',
  });

  let pickedFile = null;
  const fileLabel = el('div', { class: 'muted', style: 'font-size:13px' }, 'Keine Datei gewählt');
  const fileInput = el('input', {
    type: 'file', accept: '.pdf,.txt,application/pdf,text/plain', style: 'display:none',
    onChange: (e) => {
      pickedFile = e.target.files[0] || null;
      fileLabel.textContent = pickedFile ? pickedFile.name : 'Keine Datei gewählt';
    },
  });
  const pickBtn = el('button', { class: 'btn btn--ghost btn--block', onClick: () => fileInput.click() }, '📄 PDF/Text-Skript wählen');

  const genBtn = el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:16px', onClick: onGenerate }, '✨ Kurs generieren');

  const keyWarn = hasKey ? null : el('div', { class: 'card', style: 'border-color:var(--warn)' }, [
    el('div', { style: 'font-size:14px' }, [
      '⚠️ Kein Anthropic-API-Key hinterlegt. ',
      el('button', { class: 'btn btn--sm btn--ghost', style: 'margin-left:6px', onClick: () => navigate('/settings') }, 'Jetzt eintragen'),
    ]),
  ]);

  async function onGenerate() {
    const name = nameInput.value.trim();
    if (!name) return toast('Bitte einen Modulnamen eingeben', 'err');
    if (!pickedFile) return toast('Bitte ein Skript hochladen', 'err');
    if (!(await getSetting('apiKey', ''))) return toast('Bitte zuerst den API-Key eintragen', 'err');

    const ov = showOverlay('Kurs wird erstellt…', { cancellable: true });
    try {
      ov.update('Text wird aus dem Skript extrahiert…');
      const text = await fileToText(pickedFile, ({ page, total }) => ov.update(`Seite ${page} / ${total} gelesen…`));
      if (!text || text.length < 40) throw new Error('Aus dem Skript konnte kaum Text extrahiert werden.');

      ov.update('KI analysiert das Skript… (kann etwas dauern)');
      const kurs = await generateCourse(text, {
        signal: ov.signal,
        onProgress: ({ tokens, seconds }) => ov.update(`KI generiert Aufgaben… ${tokens} Tokens · ${seconds}s`),
      });
      if (!kurs.themen?.length) throw new Error('Die KI hat keine Themen erzeugt.');

      const mod = await createModule(name);
      const stats = await saveGeneratedCourse(mod.id, kurs);
      await refreshModuleReadiness(mod.id);
      ov.close();
      toast(`${stats.topics} Themen · ${stats.tasks} Aufgaben erstellt`, 'ok');
      navigate('/modules/' + mod.id);
    } catch (e) {
      ov.close();
      if (e.name === 'AbortError') return toast('Abgebrochen', '');
      console.error(e);
      toast(e.message || 'Generierung fehlgeschlagen', 'err');
    }
  }

  mount(view,
    el('h2', { class: 'page-title' }, 'Neues Modul'),
    el('p', { class: 'page-sub' }, 'Name eingeben und Skript hochladen – die KI erstellt Themen & Übungsaufgaben.'),
    keyWarn,
    el('div', { class: 'card stack' }, [
      el('label', { class: 'muted', style: 'font-size:12px' }, 'Modulname'),
      nameInput,
      el('label', { class: 'muted', style: 'font-size:12px;margin-top:8px' }, 'Skript (PDF oder .txt)'),
      pickBtn, fileInput, fileLabel,
    ]),
    genBtn,
    el('p', { class: 'muted', style: 'font-size:12px;text-align:center;margin-top:12px' },
      'Der Skript-Text wird lokal extrahiert und einmalig an api.anthropic.com gesendet.'),
  );
}

const field = () => 'width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-strong);background:var(--bg-elev-2);color:var(--text);min-height:48px';
