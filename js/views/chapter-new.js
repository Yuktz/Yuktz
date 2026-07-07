// View: Kapitel zu einem bestehenden Modul hinzufügen (weiteres Skript).
import { el, mount, toast } from '../util/dom.js';
import { get } from '../data/db.js';
import { navigate } from '../router.js';
import { setAppbar } from '../ui/appbar.js';
import { courseGenSection } from '../ui/coursegen.js';
import { createChapter, saveGeneratedCourse, refreshModuleReadiness } from '../data/model.js';

export async function render(view, ctx) {
  const moduleId = ctx.params.id;
  const mod = await get('modules', moduleId);
  if (!mod) { navigate('/modules'); return; }
  setAppbar({ title: 'Kapitel hinzufügen', showBack: true, onBack: () => navigate('/modules/' + moduleId) });

  const titleInput = el('input', { type: 'text', placeholder: 'z. B. Kapitel 2 – Matrizen', style: field(), autocapitalize: 'sentences' });

  const precheck = () => {
    if (!titleInput.value.trim()) { toast('Bitte einen Kapitel-Titel eingeben', 'err'); return false; }
    return true;
  };

  async function onKurs(kurs) {
    if (!kurs.themen?.length) return toast('Es wurden keine Themen erzeugt.', 'err');
    const chapter = await createChapter(moduleId, titleInput.value.trim());
    const stats = await saveGeneratedCourse(moduleId, kurs, chapter.id);
    await refreshModuleReadiness(moduleId);
    toast(`${chapter.title}: ${stats.topics} Themen · ${stats.tasks} Aufgaben`, 'ok');
    navigate('/modules/' + moduleId);
  }

  mount(view,
    el('h2', { class: 'page-title' }, 'Kapitel hinzufügen'),
    el('p', { class: 'page-sub' }, `Modul „${mod.name}" – weiteres Skript als neues Kapitel.`),
    el('div', { class: 'card stack' }, [
      el('label', { class: 'muted', style: 'font-size:12px' }, 'Kapitel-Titel'),
      titleInput,
    ]),
    courseGenSection({ precheck, onKurs }),
  );
}

const field = () => 'width:100%;padding:12px;border-radius:10px;border:1px solid var(--border-strong);background:var(--bg-elev-2);color:var(--text);min-height:48px';
