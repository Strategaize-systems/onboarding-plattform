# FEAT-057 — Helper-Texts mit Beispieldefinitionen pro Frage

**Version:** V7.1
**Status:** planned
**Created:** 2026-05-20

## Zweck

Pro Diagnose-Frage optionaler Helper-Text mit Begriffsdefinition + 2-3 konkreten Branchen-Beispielen, anklickbar via Info-Icon. Macht Strategie-Fachbegriffe fuer Mandanten ohne Berater-Hintergrund verstaendlich. Adressiert BL-115 + Conversion-Risiko bei Fach-Begriffen wie "Wissensbereich", "Pflicht-Output", "Operating Pattern".

## Hintergrund

SLC-700-Live-Test 2026-05-20: Frage "Wieviele kritische Wissensbereiche gibt es in Ihrer Firma?" ist fuer Mandanten ohne Strategie-Hintergrund nicht beantwortbar — sie kennen "Wissensbereich" nicht als operativen Begriff. Conversion-Risiko: Mandant bricht ab, weil er Frage nicht versteht.

Loesung: jede der 24 Fragen bekommt optional `helper_text` (Definition) + `examples_md` (2-3 Branchen-Beispiele wie "z.B. Verwaltung der Mandantenakten, Steuer-Software-Setup, Compliance-Prozesse"). Info-Icon neben Frage-Label, Klick zeigt Modal mit Inhalt. Helper-Texts sind via FEAT-055 editierbar (Strategaize iteriert zentral, Partner kann anpassen).

## In Scope

- **Schema-Erweiterung Template-JSONB** (Migration 099):
  - `template.blocks[].questions[]` JSONB-Schema erweitert um optionale Felder:
    - `helper_text: string` (Definition in 1-2 Saetzen, max 300 Zeichen).
    - `examples_md: string` (Markdown mit 2-3 Branchen-Beispielen, max 800 Zeichen, rendered via remark@15).
  - Bestehende Templates (`exit_readiness`, `mitarbeiter_wissenserhebung`, `partner_diagnostic`) bleiben unveraendert (Felder NULL/missing = kein Helper-Icon).
- **Initial-Content fuer `partner_diagnostic v1`** (24 Fragen):
  - Migration 099a seeded `helper_text` + `examples_md` fuer alle 24 Fragen.
  - Content-Schreibarbeit: ~150-250 Worte Definition + 2-3 Branchen-Beispiele pro Frage = ca. 24 mal 250 = ca. 6000 Worte Initial-Content. Inhaltsarbeit ~3-6h.
  - Branchen-Beispiele relevant fuer Steuerberater-Mandantenkreis: Mittelstand, KMU, Beratungsbranchen, Handwerk, Handel.
- **UI-Erweiterung in Diagnose-Frage-Render** (`src/app/dashboard/diagnose/run/page.tsx`):
  - Info-Icon (lucide-react `Info` 14px) rechts neben Frage-Label wenn `helper_text` oder `examples_md` vorhanden.
  - Klick oeffnet Modal mit:
    - Modal-Titel: Frage-Label.
    - Block "Begriff": `helper_text` rendered als Plain-Text.
    - Block "Beispiele": `examples_md` rendered via remark@15 mit Markdown-Support.
    - Close-Button.
  - Modal-Open triggert Telemetry-Event `helper_text_open` (FEAT-058).
- **EditableText-Integration**:
  - Helper-Text + Examples sind ueber FEAT-056 EditableText editierbar, jedoch nicht inline im Mandant-Render (der sieht ja den Mandanten-Modal, nicht Edit-UI).
  - Edit erfolgt im Admin-Bereich `/admin/templates/partner-diagnostic/questions/[questionKey]/helper` (eigene kompakte Edit-Page).
- **Cross-Repo-Schema-Sync mit IS V3**:
  - IS V3 Questionnaire Builder (DEC-063 dort) generiert ebenfalls `helper_text` + `examples_md` als JSONB-Felder im Builder-Output.
  - Schema-Form MUSS identisch sein damit OP V7.1 Light-Pipeline-Rendering und IS V3 Builder-Output kompatibel.
  - Cross-Check in /architecture V7.1 zwischen beiden Repos. Falls Drift: Schema in beiden Repos vereinheitlichen vor Migration 099.
- **Vitest-Coverage**:
  - Schema-Validierung (helper_text max 300, examples_md max 800 chars).
  - Info-Icon rendert nur wenn helper_text oder examples_md gesetzt.
  - Modal oeffnet bei Klick, Telemetry-Event `helper_text_open` emittiert.
  - Markdown-Rendering von examples_md (bold, italic, lists).
  - EditableText-Integration: Edit von Helper-Text speichert + Re-Render zeigt neuen Inhalt.

## Out of Scope

- **Video-Helper** oder Bild-Helper — V7.1 nur Text + Markdown.
- **Helper-Texts fuer andere Templates** (`exit_readiness`, `mitarbeiter_wissenserhebung`) — Initial-Content nur fuer `partner_diagnostic`. Andere Templates bekommen Helper-Felder Schema-seitig, aber NULL-Content.
- **Per-Partner-Helper-Overrides als eigenes UI** — Standard EditableText-Mechanik reicht (FEAT-055/056).
- **Multi-Sprach-Helper-Texts** — V7.1 nur Deutsch.
- **Helper-Text-Versions-Diff** — V8+.

## Akzeptanzkriterien

- AC-1: Migration 099 erweitert `template.blocks[].questions[]` JSONB-Schema additiv. Bestehende Templates unveraendert.
- AC-2: Migration 099a seeded 24 Fragen des `partner_diagnostic v1`-Templates mit `helper_text` + `examples_md`.
- AC-3: Info-Icon rendert in Diagnose-Frage-UI wenn helper_text oder examples_md gesetzt.
- AC-4: Klick auf Info-Icon oeffnet Modal mit Definition + Beispielen.
- AC-5: Markdown in `examples_md` wird via remark@15 gerendert (bold, italic, ul, ol, links).
- AC-6: Modal-Open triggert Telemetry-Event `helper_text_open` mit `question_key` als Payload.
- AC-7: Edit-Page `/admin/templates/partner-diagnostic/questions/[questionKey]/helper` als `strategaize_admin` aufrufbar, schreibt Override via FEAT-055.
- AC-8: `partner_admin` kann eigenen Override anlegen mit `scope='partner'` (Resolver-Reihenfolge greift).
- AC-9: Helper-Text leer/NULL = Info-Icon NICHT sichtbar (kein leeres Modal).
- AC-10: Schema-Cross-Check IS V3 dokumentiert in /architecture V7.1 + Memory-Eintrag.

## Abhaengigkeiten

- **Hard-Dep**: FEAT-055 (Override-Layer).
- **Hard-Dep**: FEAT-056 (EditableText-Komponente fuer Admin-Edit).
- **Hard-Dep**: FEAT-058 fuer `helper_text_open`-Telemetry-Event-Emission.
- **Cross-Repo-Dep**: IS V3 Questionnaire Builder Schema-Sync (DEC-063 IS-Repo).
- **Pattern-Reuse**: remark@15 + remark-html-Pipeline aus IS SLC-201 MT-7 (siehe `feedback_email_render_remark_pattern.md`).
- **Pattern-Reuse**: Modal-Komponente aus existierenden Dialog-Komponenten.
- **Downstream-Dep**: FEAT-058 nutzt Helper-Text-Open-Events.
