// Wiederverwendbares Panel für die Kursgenerierung: Datei wählen, entweder
// automatisch per API-Key generieren oder ohne API-Key über claude.ai (Prompt
// kopieren → JSON zurück-importieren). Ruft onKurs(kurs) mit dem Ergebnis.
import { el, toast } from '../util/dom.js';
import { showOverlay } from './loading.js';
import { getSetting } from '../data/db.js';
import { fileToText } from '../api/pdf.js';
import { generateCourse, buildCoursePrompt, parseCourseJson } from '../api/anthropic.js';

/**
 * @param {{precheck:()=>boolean, onKurs:(kurs:object)=>Promise<void>}} opts
 * @returns {HTMLElement}
 */
export function courseGenSection({ precheck, onKurs }) {
  let pickedFile = null;
  const fileLabel = el('div', { class: 'muted', style: 'font-size:13px' }, 'Keine Datei gewählt');
  const fileInput = el('input', {
    type: 'file', accept: '.pdf,.txt,application/pdf,text/plain', style: 'display:none',
    onChange: (e) => { pickedFile = e.target.files[0] || null; fileLabel.textContent = pickedFile ? pickedFile.name : 'Keine Datei gewählt'; },
  });
  const pickBtn = el('button', { class: 'btn btn--ghost btn--block', onClick: () => fileInput.click() }, '📄 PDF/Text-Skript wählen');

  async function extractIfFile(ov) {
    if (!pickedFile) return '';
    ov.update('Text wird aus dem Skript extrahiert…');
    const text = await fileToText(pickedFile, ({ page, total }) => ov.update(`Seite ${page} / ${total} gelesen…`));
    if (!text || text.length < 40) throw new Error('Aus dem Skript konnte kaum Text extrahiert werden.');
    return text;
  }

  async function onGenerate() {
    if (!precheck()) return;
    if (!pickedFile) return toast('Bitte ein Skript hochladen', 'err');
    if (!(await getSetting('apiKey', ''))) return toast('Kein API-Key – nutze „Mit Claude Pro" unten', 'err');
    const ov = showOverlay('Kurs wird erstellt…', { cancellable: true });
    try {
      const text = await extractIfFile(ov);
      ov.update('KI analysiert das Skript… (kann etwas dauern)');
      const kurs = await generateCourse(text, {
        signal: ov.signal,
        onProgress: ({ tokens, seconds }) => ov.update(`KI generiert Aufgaben… ${tokens} Tokens · ${seconds}s`),
      });
      ov.close();
      await onKurs(kurs);
    } catch (e) {
      ov.close();
      if (e.name === 'AbortError') return toast('Abgebrochen', '');
      console.error(e); toast(e.message || 'Generierung fehlgeschlagen', 'err');
    }
  }
  const genBtn = el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:12px', onClick: onGenerate }, '✨ Automatisch generieren (API-Key)');

  const promptOut = el('textarea', { readonly: true, rows: 5, placeholder: 'Der Prompt erscheint hier…', style: field(true) + ';font-size:12px' });
  const copyBtn = el('button', { class: 'btn btn--ghost btn--block', style: 'margin-top:8px', onClick: async () => {
    const ov = showOverlay('Prompt wird vorbereitet…');
    try {
      const text = await extractIfFile(ov);
      const prompt = buildCoursePrompt(text);
      promptOut.value = prompt; ov.close();
      try { await navigator.clipboard.writeText(prompt); toast('Prompt kopiert – in claude.ai einfügen', 'ok'); }
      catch { promptOut.focus(); promptOut.select(); toast('Prompt unten markiert – manuell kopieren', ''); }
    } catch (e) { ov.close(); toast(e.message || 'Fehler', 'err'); }
  } }, '① Prompt erzeugen & kopieren');

  const jsonIn = el('textarea', { rows: 5, placeholder: 'Claudes JSON-Antwort hier einfügen…', style: field(true) + ';font-size:12px' });
  const importBtn = el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:8px', onClick: async () => {
    if (!precheck()) return;
    if (!jsonIn.value.trim()) return toast('Bitte Claudes JSON-Antwort einfügen', 'err');
    try { await onKurs(parseCourseJson(jsonIn.value)); }
    catch (e) { console.error(e); toast(e.message || 'Import fehlgeschlagen', 'err'); }
  } }, '③ Kurs importieren');

  return el('div', {}, [
    el('div', { class: 'card stack' }, [
      el('label', { class: 'muted', style: 'font-size:12px' }, 'Skript (PDF oder .txt)'),
      pickBtn, fileInput, fileLabel,
    ]),
    genBtn,
    el('div', { class: 'section-title' }, 'Ohne API-Key – mit Claude Pro / Free'),
    el('div', { class: 'card' }, [
      el('p', { class: 'muted', style: 'font-size:13px;line-height:1.5' },
        'Nutzt dein claude.ai-Abo, keine API-Kosten. Optional Skript oben wählen (Text wird eingebettet), sonst PDF in claude.ai anhängen.'),
      copyBtn, promptOut, el('div', { style: 'height:8px' }), jsonIn, importBtn,
    ]),
  ]);
}

const field = (area = false) =>
  'width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-strong);background:var(--bg-elev-2);color:var(--text);' +
  (area ? 'resize:vertical;font-family:inherit' : 'min-height:48px');
