# ExamCoach – Projektkontext für Claude

Persönliche Single-User-Lern-PWA für die Klausurvorbereitung (Duolingo-artig,
aber für beliebige Uni-Module). Läuft als installierbare PWA auf dem iPhone.

## Harte Rahmenbedingungen (strikt einhalten)
- **Kein Login, kein Backend, kein Multi-User.**
- **Kein Tracking / keine Drittanbieter-Analytics, keine Werbung.**
- Alle Nutzerdaten **lokal** im Browser (IndexedDB). Nichts geht an einen
  eigenen Server.
- **Einzige** erlaubte externe Verbindung: `api.anthropic.com` zur
  Kursgenerierung, mit dem lokal gespeicherten API-Key des Nutzers.
- **Offline-fähig** für bereits generierte Inhalte (Service Worker). Nur die
  Kurserstellung selbst braucht Internet.

## Architekturentscheidungen
- **Vanilla-JS-PWA mit ES-Modulen, kein Build-Step.** Begründung: Die App soll
  ein Satz statischer Dateien sein, der von überall (GitHub Pages, lokaler
  Server, Offline-Cache) ohne Server-Rewrites läuft. Ohne Bundler bleibt das
  Service-Worker-Precaching trivial (feste Dateinamen, keine Hashes) und die
  Abhängigkeitskette klein. React wäre für die komplexe UI komfortabler, bringt
  aber Build-/PWA-Plugin-Komplexität, die dem „einfach hostbar + offline"-Ziel
  zuwiderläuft. Kann später bei Bedarf migriert werden.
- **Hash-Routing** (`#/...`), damit die App aus jedem Pfad ohne
  Server-Konfiguration funktioniert.
- **IndexedDB** direkt über einen kleinen Promise-Wrapper (`js/data/db.js`),
  keine externe DB-Lib.
- **pdf.js** (ab Feature 2) für clientseitige Textextraktion.
- **Design**: mobil zuerst, iPhone-safe-areas, dunkles Standard-Theme mit
  Light-Mode via `prefers-color-scheme`. Design-Tokens in `css/styles.css`.

## Projektstruktur
```
index.html                 App-Shell (App-Bar, Router-Outlet, Tab-Bar)
manifest.webmanifest        PWA-Manifest
sw.js                       Service Worker (App-Shell-Cache, offline)
css/styles.css              Design-System + alle Styles
icons/                      generierte PNG-Icons (192/512/maskable/apple-touch)
js/
  app.js                    Entry: Routen, Tab-Sync, SW-Registrierung
  router.js                 Hash-Router (route/navigate/startRouter)
  data/db.js                IndexedDB-Wrapper + Schema + CRUD-Helfer
  util/dom.js               el()/mount()/toast() – DOM-Helfer
  ui/appbar.js              Steuert die obere App-Bar
  ui/scaffold.js            Platzhalter-Bausteine für Stub-Views
  views/
    modules.js              Module-Übersicht (Startseite)
    module-new.js           Neues Modul anlegen (Feature 2)
    module-detail.js        Modul-Detail
    session.js              Lern-Session (Feature 4)
    exam.js                 Klausur-Modus (Feature 5/6)
    stats.js                Statistiken (Feature 7/8)
    settings.js             API-Key + Daten-Reset (funktional)
```

## Datenmodell (IndexedDB-Stores, Schema v1)
Bump `DB_VERSION` in `js/data/db.js` bei Schemaänderungen und `onupgradeneeded`
erweitern. Bump ausserdem `CACHE_VERSION` in `sw.js` bei Shell-Dateiänderungen.

- **settings** `key` → `{ key, value }`  · z.B. `apiKey`, `streak`, Flags
- **modules** `id` → Modul: `{ id, name, createdAt, examDate?, minutesPerDay?,
  topicCount, readiness }`
- **topics** `id`, idx `moduleId` → Thema: `{ id, moduleId, title, weight
  (Wichtigkeit), order, readiness (0-100), mastered:boolean }`
- **tasks** `id`, idx `topicId`,`moduleId` → Übungsaufgabe: `{ id, topicId,
  moduleId, type ('mc'|'cloze'|'number'|'worked'), question, options?, answer,
  steps[] (Lösungsweg), difficulty, errorTags[], fromExam:boolean }`
- **reviews** `taskId` → SR-Zustand + Historie: `{ taskId, halfLifeDays,
  lastReviewed, dueAt, correctSessions[] (distinct session-days), attempts,
  correct, wrong, lastConfidence, errorHistory[] }`
- **sessions** `id`, idx `moduleId`,`day` → Lern-Session: `{ id, moduleId,
  day (YYYY-MM-DD), startedAt, endedAt, taskIds[], xp }`
- **attempts** `id`, idx `taskId`,`sessionId` → einzelner Versuch: `{ id,
  taskId, sessionId, day, correct, confidence, errorTags[], userAnswer,
  userSteps? }`

Kaskadierendes Löschen eines Moduls: `deleteModuleCascade(moduleId)`.

## Feature-Fahrplan (Reihenfolge einhalten, nach jedem Feature Rückfrage)
1. **✅ Grundgerüst PWA** – Manifest, SW, Navigation zwischen den 5 Views. *(fertig)*
2. Modul anlegen & KI-Kursgenerierung (pdf.js, Anthropic-API, JSON-Schema, Validierung/Retry). *Plan Mode.*
3. Probeklausuren hochladen (Wichtigkeit erhöhen, Aufgaben übernehmen, Klausur-Pool).
4. Spaced Repetition (Half-Life), Mastery (≥3 versch. Sessions), Interleaving. *Plan Mode.*
5. Klausur-Modus mit Lernplan (Rückwärtsplanung, Neuberechnung, Burndown). *Plan Mode.*
6. Klausur-Simulation (Timer, gemischt, Auswertung nach Thema).
7. Fehlermuster-Tracking & Rechenweg-Eingabe.
8. Confidence-Abfrage & dezente Gamification (XP, Streak).

## KI-Aufrufe (ab Feature 2) – Vorgaben
- Endpoint `https://api.anthropic.com/v1/messages`
- Header `anthropic-dangerous-direct-browser-access: true`, `x-api-key`,
  `anthropic-version`
- Modell `claude-opus-4-8`, Effort/Reasoning high
- Antwort MUSS striktem JSON-Schema folgen (`{ "themen": [ { "titel",
  "wichtigkeit", "aufgaben": [ ... ] } ] }`); Parsing mit Fehlerbehandlung +
  Retry bei ungültigem Format.

## Wichtige UX-Leitplanke
Keine Bestehens-Garantie formulieren. Immer einen ehrlichen **Bereitschafts-
Score** pro Thema und fürs Modul zeigen.

## Lokal testen
Statischer Server nötig (ES-Module + SW brauchen http(s), nicht `file://`):
`python3 -m http.server 8000` → http://localhost:8000
