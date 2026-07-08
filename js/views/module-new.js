// View: Neues Modul anlegen (Feature 2). Legt Modul + erstes Kapitel an.
import { el, mount, toast } from '../util/dom.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';
import { courseGenSection } from '../ui/coursegen.js';
import { createModule, createChapter, saveGeneratedCourse, refreshModuleReadiness } from '../data/model.js';

export async function render(view) {
  setAppbar({ title: 'Modul anlegen', showBack: true, onBack: () => navigate('/modules') });

  const nameInput = el('input', { type: 'text', placeholder: 'z. B. Lineare Algebra', style: field(), autocapitalize: 'sentences' });

  const precheck = () => {
    if (!nameInput.value.trim()) { toast('Bitte einen Modulnamen eingeben', 'err'); return false; }
    return true;
  };

  async function onKurs(kurs) {
    if (!kurs.themen?.length) return toast('Es wurden keine Themen erzeugt.', 'err');
    const mod = await createModule(nameInput.value.trim());
    const chapter = await createChapter(mod.id, 'Kapitel 1');
    const stats = await saveGeneratedCourse(mod.id, kurs, chapter.id);
    await refreshModuleReadiness(mod.id);
    toast(`${stats.topics} Themen · ${stats.tasks} Aufgaben erstellt`, 'ok');
    navigate('/modules/' + mod.id);
  }

  mount(view,
    el('h2', { class: 'page-title' }, 'Neues Modul'),
    el('p', { class: 'page-sub' }, 'Name + erstes Kapitel-Skript. Weitere Kapitel kannst du später im Modul ergänzen.'),
    el('div', { class: 'card stack' }, [
      el('label', { class: 'muted', style: 'font-size:12px' }, 'Modulname'),
      nameInput,
    ]),
    courseGenSection({ precheck, onKurs }),
  );
}

const field = () => 'width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-strong);background:var(--bg-elev-2);color:var(--text);min-height:48px';
