// Anthropic-API-Client für die Kursgenerierung.
// Direkter Browser-Aufruf an api.anthropic.com mit dem lokal gespeicherten
// API-Key. Streaming, damit lange Generierungen nicht in Timeouts laufen und
// Fortschritt angezeigt werden kann. Antwort per Structured Outputs
// (output_config.format) → garantiert schema-gültiges JSON.

import { getSetting } from '../data/db.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-8';

export const FEHLERARTEN = [
  'Vorzeichenfehler', 'Rechenfehler', 'Konzeptfehler', 'Formelfehler',
  'Fluechtigkeitsfehler', 'Einheitenfehler',
];
export const AUFGABEN_TYPEN = ['mc', 'cloze', 'number', 'worked'];

// Festes JSON-Schema für die KI-Antwort (Structured Outputs).
const AUFGABE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    typ: { type: 'string', enum: AUFGABEN_TYPEN },
    frage: { type: 'string' },
    optionen: { type: 'array', items: { type: 'string' } },
    loesung: { type: 'string' },
    loesungsweg: { type: 'array', items: { type: 'string' } },
    schwierigkeit: { type: 'integer', enum: [1, 2, 3] },
    fehlerarten: { type: 'array', items: { type: 'string', enum: FEHLERARTEN } },
  },
  required: ['typ', 'frage', 'optionen', 'loesung', 'loesungsweg', 'schwierigkeit', 'fehlerarten'],
};

const KURS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    themen: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          titel: { type: 'string' },
          wichtigkeit: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          zusammenfassung: { type: 'string' },
          reihenfolge: { type: 'integer' },
          aufgaben: { type: 'array', items: AUFGABE_SCHEMA },
        },
        required: ['titel', 'wichtigkeit', 'zusammenfassung', 'reihenfolge', 'aufgaben'],
      },
    },
  },
  required: ['themen'],
};

// Schema für Zusatzaufgaben (Schwächen-Vertiefung).
const TASKS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { aufgaben: { type: 'array', items: AUFGABE_SCHEMA } },
  required: ['aufgaben'],
};

// Schema für die Probeklausur-Analyse.
const KLAUSUR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    themen_gewichtung: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          titel: { type: 'string' },
          haeufigkeit: { type: 'integer', enum: [0, 1, 2, 3] },
        },
        required: ['titel', 'haeufigkeit'],
      },
    },
    klausur_aufgaben: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          thema_titel: { type: 'string' },
          aufgabe: AUFGABE_SCHEMA,
        },
        required: ['thema_titel', 'aufgabe'],
      },
    },
  },
  required: ['themen_gewichtung', 'klausur_aufgaben'],
};

// Wird an die System-Prompts angehängt, damit Mathe als KaTeX-taugliches
// LaTeX geliefert wird (die App rendert $…$ / $$…$$ mit KaTeX).
const MATH_HINT =
  'FORMATIERUNG (zwingend): JEDER mathematische Ausdruck – auch Brüche, Vektoren, Matrizen, ' +
  'Indizes, Exponenten, griechische Buchstaben, Mengen, Integrale – MUSS in KaTeX-Delimiter ' +
  'stehen: inline zwischen $ … $, abgesetzt zwischen $$ … $$. Das gilt gleichermaßen in ' +
  '"frage", in jeder "optionen"-Option, in "loesung" und in JEDEM "loesungsweg"-Schritt. ' +
  'Niemals rohes LaTeX ohne $-Delimiter und keine \\begin{…}-Umgebung außerhalb von $$. ' +
  'Beispiele: "$\\frac{a}{b}$", "$\\vec{v}\\in\\mathbb{R}^n$", "$$A=\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}$$".';

// Leitplanken für Qualität und Auswertbarkeit der Aufgaben.
const QUALITY_HINT =
  'QUALITÄT: Keine banalen oder rein definitorischen Fragen – jede Aufgabe soll echtes ' +
  'Verständnis oder Anwendung prüfen (rechnen, herleiten, Konzepte anwenden, Gegenbeispiele). ' +
  'Innerhalb eines Themas steigende Schwierigkeit (leicht → mittel → schwer) und Abdeckung der ' +
  'typischen Klausur- und Fehlerquellen. AUSWERTBARKEIT: Bevorzuge die Typen "mc" und "number", ' +
  'weil sie eindeutig automatisch geprüft werden. "mc": genau eine richtige Option plus 3 ' +
  'plausible Distraktoren aus typischen Fehlern; "loesung" = exakter Text der richtigen Option. ' +
  '"number": die Lösung ist EINE Dezimalzahl (Punkt oder Komma), keine Brüche/Wurzeln als Text. ' +
  'Nutze "cloze" nur für kurze, eindeutig tippbare Antworten (ein Wort/Begriff). Nutze "worked" ' +
  'für Herleitungen/mehrschrittige Rechnungen – diese bewertet der Nutzer per Selbsteinschätzung, ' +
  'deshalb hier einen ausführlichen, gut erklärten "loesungsweg" liefern.';

const SYSTEM_KURS =
  'Du bist ein erfahrener Hochschul-Tutor und Prüfungsdidaktiker. Du analysierst ' +
  'Vorlesungsskripte und erstellst daraus einen strukturierten Übungskurs zur ' +
  'Klausurvorbereitung. Antworte ausschließlich auf Deutsch. Erzeuge pro Thema mehrere ' +
  'Übungsaufgaben unterschiedlicher Schwierigkeit und – wo sinnvoll – unterschiedlicher ' +
  'Typen (mc = Multiple Choice mit Feld "optionen"; cloze = Lückentext; number = ' +
  'Zahleneingabe; worked = Aufgabe mit einzugebendem Rechenweg). Bei "mc" enthält ' +
  '"optionen" die Antwortmöglichkeiten und "loesung" den exakten Text der richtigen ' +
  'Option. Bei anderen Typen ist "optionen" ein leeres Array. "loesungsweg" enthält die ' +
  'nachvollziehbaren Lösungsschritte. "fehlerarten" nennt typische Fehler, die bei dieser ' +
  'Aufgabe auftreten können (nur bei Rechenaufgaben relevant, sonst leeres Array). ' +
  '"wichtigkeit" (1–5) schätzt die Klausurrelevanz des Themas. "reihenfolge" gibt eine ' +
  'sinnvolle Lernreihenfolge an (aufsteigend, beginnend bei 1). ' +
  QUALITY_HINT + ' ' + MATH_HINT;

/**
 * Baut einen fertigen Prompt zum manuellen Ausführen in claude.ai (Pro/Free),
 * damit ohne API-Guthaben generiert werden kann. Antwort = reines JSON.
 */
export function buildCoursePrompt(scriptText = '') {
  const schema =
`{
  "themen": [
    {
      "titel": "string",
      "wichtigkeit": 1-5,                 // Ganzzahl, Klausurrelevanz
      "zusammenfassung": "string",
      "reihenfolge": 1,                   // Ganzzahl, Lernreihenfolge ab 1
      "aufgaben": [
        {
          "typ": "mc" | "cloze" | "number" | "worked",
          "frage": "string",
          "optionen": ["..."],            // nur bei "mc" die Optionen, sonst []
          "loesung": "string",            // bei mc: exakter Text der richtigen Option
          "loesungsweg": ["Schritt 1", "Schritt 2"],
          "schwierigkeit": 1-3,
          "fehlerarten": []               // nur Rechenaufgaben, aus: ${FEHLERARTEN.join(', ')}
        }
      ]
    }
  ]
}`;
  return [
    SYSTEM_KURS,
    '',
    'Gib deine Antwort AUSSCHLIESSLICH als ein JSON-Objekt zurück, das exakt diesem Schema entspricht – kein Fließtext davor/danach, keine ```-Code-Fences, keine Kommentare:',
    schema,
    '',
    'Pro Thema 4–8 Aufgaben unterschiedlicher Schwierigkeit und Typen.',
    '',
    scriptText.trim()
      ? '--- SKRIPT ---\n' + scriptText.slice(0, 100000)
      : '(Das Vorlesungsskript ist als PDF angehängt.)',
  ].join('\n');
}

/** Parst die (evtl. mit Text/Fences umrahmte) JSON-Antwort zu einem Kurs. */
export function parseCourseJson(raw) {
  let s = String(raw || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  let obj;
  try { obj = JSON.parse(s); }
  catch { throw new Error('Das eingefügte JSON ist ungültig. Bitte Claudes Antwort komplett kopieren.'); }
  if (!obj || !Array.isArray(obj.themen) || !obj.themen.length) {
    throw new Error('Im JSON wurde keine „themen"-Liste gefunden.');
  }
  return obj;
}

const DEEPEN_SYSTEM =
  'Du bist ein erfahrener Hochschul-Tutor. Du erzeugst zusätzliche Übungsaufgaben zu EINEM ' +
  'Thema, um eine erkannte Schwäche gezielt zu vertiefen. Antworte ausschließlich auf Deutsch. ' +
  'Lege besonderen Wert auf ausführliche, gut verständliche Lösungswege. ' + QUALITY_HINT + ' ' + MATH_HINT;

function deepenUser(topic, { errorTags = [], count = 5 } = {}) {
  return [
    `Thema: "${topic.title}".`,
    topic.summary ? 'Kontext aus dem Skript: ' + topic.summary : '',
    errorTags.length ? `Der Nutzer macht hier besonders diese Fehler: ${errorTags.join(', ')}. Adressiere sie gezielt.` : '',
    `Erzeuge ${count} NEUE, abwechslungsreiche Übungsaufgaben mit steigender Schwierigkeit und besonders ausführlich erklärten Lösungswegen.`,
  ].filter(Boolean).join('\n');
}

/** Zusatzaufgaben zu einem Thema generieren (API-Weg). Liefert ein Array Aufgaben. */
export async function generateTopicTasks(topic, focus = {}, opts = {}) {
  const res = await streamJson(buildBody(DEEPEN_SYSTEM, deepenUser(topic, focus), TASKS_SCHEMA, 12000), opts);
  if (!Array.isArray(res.aufgaben) || !res.aufgaben.length) throw new Error('Es wurden keine Aufgaben erzeugt.');
  return res.aufgaben;
}

/** Fertiger Prompt zur Schwächen-Vertiefung für den claude.ai-Import. */
export function buildTopicPrompt(topic, focus = {}) {
  const schema =
`{
  "aufgaben": [
    { "typ": "mc"|"cloze"|"number"|"worked", "frage": "string", "optionen": [],
      "loesung": "string", "loesungsweg": ["Schritt 1"], "schwierigkeit": 1-3, "fehlerarten": [] }
  ]
}`;
  return [
    DEEPEN_SYSTEM,
    '',
    deepenUser(topic, focus),
    '',
    'Gib deine Antwort AUSSCHLIESSLICH als JSON-Objekt gemäß diesem Schema zurück – kein Fließtext, keine ```-Fences:',
    schema,
  ].join('\n');
}

/** Parst eine JSON-Antwort mit Zusatzaufgaben ({ aufgaben: [...] } oder bares Array). */
export function parseTasksJson(raw) {
  let s = String(raw || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const objStart = s.indexOf('{'), arrStart = s.indexOf('[');
  const useArr = arrStart >= 0 && (objStart < 0 || arrStart < objStart);
  if (useArr) { const b = s.lastIndexOf(']'); if (b > arrStart) s = s.slice(arrStart, b + 1); }
  else if (objStart >= 0) { const b = s.lastIndexOf('}'); if (b > objStart) s = s.slice(objStart, b + 1); }
  let parsed;
  try { parsed = JSON.parse(s); } catch { throw new Error('Das eingefügte JSON ist ungültig.'); }
  const arr = Array.isArray(parsed) ? parsed : parsed?.aufgaben;
  if (!Array.isArray(arr) || !arr.length) throw new Error('Im JSON wurden keine Aufgaben gefunden.');
  return arr;
}

/** Baut den Request-Body für einen strukturierten Aufruf. */
function buildBody(system, userText, schema, maxTokens) {
  return {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema },
    },
    stream: true,
    messages: [{ role: 'user', content: userText }],
  };
}

/**
 * Führt einen gestreamten Messages-Request aus und liefert das geparste JSON.
 * @param {object} body
 * @param {{onProgress?:Function, signal?:AbortSignal}} opts
 */
async function streamJson(body, { onProgress, signal } = {}) {
  const apiKey = await getSetting('apiKey', '');
  if (!apiKey) throw new Error('Kein API-Key hinterlegt. Bitte in den Einstellungen eintragen.');

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const err = await resp.json();
      msg = err?.error?.message || msg;
    } catch { /* ignore */ }
    throw new Error('API-Fehler: ' + msg);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let jsonText = '';
  let stopReason = null;
  let outputTokens = 0;

  const started = Date.now();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // letzte (evtl. unvollständige) Zeile behalten
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let ev;
      try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        jsonText += ev.delta.text;
      } else if (ev.type === 'message_delta') {
        if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
        if (ev.usage?.output_tokens != null) outputTokens = ev.usage.output_tokens;
      } else if (ev.type === 'error') {
        throw new Error('API-Fehler: ' + (ev.error?.message || 'unbekannt'));
      }
      onProgress?.({ tokens: outputTokens || Math.round(jsonText.length / 4), seconds: Math.round((Date.now() - started) / 1000) });
    }
  }

  if (stopReason === 'refusal') {
    throw new Error('Die KI hat die Anfrage abgelehnt. Bitte Skript-Inhalt prüfen.');
  }
  if (stopReason === 'max_tokens') {
    throw new Error('TRUNCATED');
  }
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error('INVALID_JSON');
  }
}

/**
 * Generiert aus einem Skript-Text einen Kurs (Themen + Aufgaben).
 * Retry bei ungültigem/abgeschnittenem JSON mit höherem Token-Budget.
 */
export async function generateCourse(scriptText, opts = {}) {
  const clipped = scriptText.slice(0, 120000); // Kontext-Schutz
  const user =
    'Analysiere das folgende Vorlesungsskript und erstelle daraus einen Übungskurs ' +
    'gemäß dem vorgegebenen JSON-Schema. Gliedere in sinnvolle Themen und generiere pro ' +
    'Thema 4–8 Übungsaufgaben unterschiedlicher Schwierigkeit und Typen.\n\n--- SKRIPT ---\n' +
    clipped;

  const budgets = [24000, 32000];
  let lastErr;
  for (const maxTokens of budgets) {
    try {
      return await streamJson(buildBody(SYSTEM_KURS, user, KURS_SCHEMA, maxTokens), opts);
    } catch (e) {
      lastErr = e;
      if (e.message === 'TRUNCATED' || e.message === 'INVALID_JSON') continue; // Retry
      throw e;
    }
  }
  throw new Error('Antwort konnte nicht verarbeitet werden (' + (lastErr?.message || 'unbekannt') + ').');
}

/**
 * Analysiert eine Probeklausur gegen die bestehenden Themen.
 * @param {string} examText
 * @param {string[]} topicTitles
 */
export async function analyzeExam(examText, topicTitles, opts = {}) {
  const system =
    'Du bist Prüfungsdidaktiker. Du analysierst eine Probeklausur im Kontext bekannter ' +
    'Kursthemen. Antworte ausschließlich auf Deutsch und halte dich strikt an das JSON-Schema. ' +
    'Für "themen_gewichtung": schätze pro bekanntem Thema, wie häufig es in der Klausur vorkommt ' +
    '(0 = gar nicht, 3 = sehr häufig). Für "klausur_aufgaben": extrahiere die einzelnen ' +
    'Klausuraufgaben, ordne jede dem am besten passenden bekannten Thema zu ("thema_titel") und ' +
    'formuliere sie als Übungsaufgabe gemäß Aufgaben-Schema (mit Lösung, Lösungsweg, Fehlerarten). ' +
    MATH_HINT;
  const user =
    'Bekannte Themen:\n' + topicTitles.map((t) => '- ' + t).join('\n') +
    '\n\n--- PROBEKLAUSUR ---\n' + examText.slice(0, 100000);

  const budgets = [16000, 28000];
  let lastErr;
  for (const maxTokens of budgets) {
    try {
      return await streamJson(buildBody(system, user, KLAUSUR_SCHEMA, maxTokens), opts);
    } catch (e) {
      lastErr = e;
      if (e.message === 'TRUNCATED' || e.message === 'INVALID_JSON') continue;
      throw e;
    }
  }
  throw new Error('Antwort konnte nicht verarbeitet werden (' + (lastErr?.message || 'unbekannt') + ').');
}
