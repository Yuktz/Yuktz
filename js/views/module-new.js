// View: Neues Modul anlegen (Feature 2).
// Zwei Wege: (A) automatisch per Anthropic-API-Key, (B) ohne API-Key manuell
// über claude.ai (Pro/Free) – Prompt erzeugen, JSON zurück-importieren.
import { el, mount, toast } from '../util/dom.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';
import { showOverlay } from '../ui/loading.js';
import { getSetting } from '../data/db.js';
import { createModule, saveGeneratedCourse, refreshModuleReadiness } from '../data/model.js';
import { fileToText } from '../api/pdf.js';
import { generateCourse, buildCoursePrompt, parseCourseJson } from '../api/anthropic.js';

export async function render(view) {
  setAppbar({ title: 'Modul anlegen', showBack: true, onBack: () => navigate('/modules') });

  const hasKey = !!(await getSetting('apiKey', ''));

  const nameInput = el('input', { type: 'text', placeholder: 'z. B. Lineare Algebra', style: field(), autocapitalize: 'sentences' });

  let pickedFile = null;
  const fileLabel = el('div', { class: 'muted', style: 'font-size:13px' }, 'Keine Datei gewählt');
  const fileInput = el('input', {
    type: 'file', accept: '.pdf,.txt,application/pdf,text/plain', style: 'display:none',
    onChange: (e) => { pickedFile = e.target.files[0] || null; fileLabel.textContent = pickedFile ? pickedFile.name : 'Keine Datei gewählt'; },
  });
  const pickBtn = el('button', { class: 'btn btn--ghost btn--block', onClick: () => fileInput.click() }, '📄 PDF/Text-Skript wählen');

  function requireName() {
    const name = nameInput.value.trim();
    if (!name) { toast('Bitte einen Modulnamen eingeben', 'err'); return null; }
    return name;
  }

  async function extractIfFile(ov) {
    if (!pickedFile) return '';
    ov.update('Text wird aus dem Skript extrahiert…');
    const text = await fileToText(pickedFile, ({ page, total }) => ov.update(`Seite ${page} / ${total} gelesen…`));
    if (!text || text.length < 40) throw new Error('Aus dem Skript konnte kaum Text extrahiert werden.');
    return text;
  }

  async function saveKurs(name, kurs) {
    if (!kurs.themen?.length) throw new Error('Es wurden keine Themen erzeugt.');
    const mod = await createModule(name);
    const stats = await saveGeneratedCourse(mod.id, kurs);
    await refreshModuleReadiness(mod.id);
    toast(`${stats.topics} Themen · ${stats.tasks} Aufgaben erstellt`, 'ok');
    navigate('/modules/' + mod.id);
  }

  /* ---------- Weg A: automatisch per API-Key ---------- */
  async function onGenerate() {
    const name = requireName(); if (!name) return;
    if (!pickedFile) return toast('Bitte ein Skript hochladen', 'err');
    if (!(await getSetting('apiKey', ''))) return toast('Kein API-Key – nutze unten „Mit Claude Pro"', 'err');
    const ov = showOverlay('Kurs wird erstellt…', { cancellable: true });
    try {
      const text = await extractIfFile(ov);
      ov.update('KI analysiert das Skript… (kann etwas dauern)');
      const kurs = await generateCourse(text, {
        signal: ov.signal,
        onProgress: ({ tokens, seconds }) => ov.update(`KI generiert Aufgaben… ${tokens} Tokens · ${seconds}s`),
      });
      ov.close();
      await saveKurs(name, kurs);
    } catch (e) {
      ov.close();
      if (e.name === 'AbortError') return toast('Abgebrochen', '');
      console.error(e);
      toast(e.message || 'Generierung fehlgeschlagen', 'err');
    }
  }

  const genBtn = el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:12px', onClick: onGenerate }, '✨ Automatisch generieren (API-Key)');

  const keyNote = el('p', { class: 'muted', style: 'font-size:12px;margin-top:8px' },
    hasKey ? 'API-Key hinterlegt. Skript-Text wird lokal extrahiert und einmalig an api.anthropic.com gesendet (kostet API-Guthaben).'
           : 'Kein API-Key hinterlegt – nutze den Weg „Mit Claude Pro" unten (ohne Extra-Kosten).');

  /* ---------- Weg B: ohne API-Key über claude.ai ---------- */
  const promptOut = el('textarea', { readonly: true, rows: 5, placeholder: 'Der Prompt erscheint hier…', style: field(true) + ';font-size:12px' });
  const copyBtn = el('button', { class: 'btn btn--ghost btn--block', style: 'margin-top:8px', onClick: async () => {
    const ov = showOverlay('Prompt wird vorbereitet…');
    try {
      const text = await extractIfFile(ov);
      const prompt = buildCoursePrompt(text);
      promptOut.value = prompt;
      ov.close();
      try { await navigator.clipboard.writeText(prompt); toast('Prompt kopiert – in claude.ai einfügen', 'ok'); }
      catch { promptOut.focus(); promptOut.select(); toast('Prompt unten markiert – manuell kopieren', ''); }
    } catch (e) { ov.close(); toast(e.message || 'Fehler', 'err'); }
  } }, '① Prompt erzeugen & kopieren');

  const jsonIn = el('textarea', { rows: 5, placeholder: 'Claudes JSON-Antwort hier einfügen…', style: field(true) + ';font-size:12px' });
  const importBtn = el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:8px', onClick: async () => {
    const name = requireName(); if (!name) return;
    if (!jsonIn.value.trim()) return toast('Bitte Claudes JSON-Antwort einfügen', 'err');
    try {
      const kurs = parseCourseJson(jsonIn.value);
      await saveKurs(name, kurs);
    } catch (e) { console.error(e); toast(e.message || 'Import fehlgeschlagen', 'err'); }
  } }, '③ Kurs importieren');

  const proCard = el('div', { class: 'card' }, [
    el('div', { class: 'section-title', style: 'margin-top:0' }, 'Ohne API-Key – mit Claude Pro / Free'),
    el('p', { class: 'muted', style: 'font-size:13px;line-height:1.5' },
      'Nutzt dein bestehendes claude.ai-Abo, keine API-Kosten. Ein Copy-&-Paste-Schritt pro Modul.'),
    el('ol', { class: 'muted', style: 'font-size:13px;line-height:1.6;margin:6px 0 10px;padding-left:18px' }, [
      el('li', {}, 'Optional oben ein Skript wählen (Text wird in den Prompt eingebettet). Ohne Datei: PDF direkt in claude.ai anhängen.'),
      el('li', {}, '„Prompt erzeugen & kopieren" → in claude.ai (neuer Chat) einfügen & senden.'),
      el('li', {}, 'Claudes komplette JSON-Antwort kopieren, unten einfügen, „Kurs importieren".'),
    ]),
    copyBtn,
    promptOut,
    el('div', { style: 'height:8px' }),
    jsonIn,
    importBtn,
  ]);

  mount(view,
    el('h2', { class: 'page-title' }, 'Neues Modul'),
    el('p', { class: 'page-sub' }, 'Name eingeben, dann automatisch oder mit Claude Pro erstellen.'),
    el('div', { class: 'card stack' }, [
      el('label', { class: 'muted', style: 'font-size:12px' }, 'Modulname'),
      nameInput,
      el('label', { class: 'muted', style: 'font-size:12px;margin-top:8px' }, 'Skript (PDF oder .txt)'),
      pickBtn, fileInput, fileLabel,
    ]),
    genBtn, keyNote,
    el('div', { class: 'section-title' }, 'Alternative'),
    proCard,
  );
}

const field = (area = false) =>
  `width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-strong);background:var(--bg-elev-2);color:var(--text);` +
  (area ? 'resize:vertical;font-family:inherit' : 'min-height:48px');
