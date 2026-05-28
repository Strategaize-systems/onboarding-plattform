# SLC-148 — Template-Daten + Stufen-Lookup + SUI-Score-Engine Backend

**Version:** V8
**Feature:** FEAT-063 (Template-Daten) + FEAT-065 (SUI-Score-Engine)
**Backlog:** BL-128 (FEAT-063) + BL-130 (FEAT-065)
**Status:** planned
**Created:** 2026-05-28
**Priority:** High
**Estimate:** ~6-10h Code-Side + ~30-45min Founder-Pflicht (Pre-MT-1 Tonalitaets-Migration)
**Worktree Branch:** `v8-mandanten-report` (Cumulative-Single-Branch fuer alle 5 V8-Slices, siehe Branch-Strategie unten)

## Slice Goal

Liefert die **Daten-Foundation + Score-Engine** fuer die V8 Mandanten-Report-Teaser-Diagnose. Nach diesem Slice existiert:

1. Eine neue Template-Row `exit-readiness-teaser-v1.v1` in `public.template` LIVE auf Coolify-DB mit:
   - 47 Fragen ueber 11 Module (5 Hygiene + 37 Skala + 5 Reflexion)
   - 45 Stufen-Lookup-Eintraege (9 Module x 5 Stufen) mit `was_es_bedeutet` + `unsere_empfehlung` Markdown
   - 9 "Worum es geht"-Modul-Texte
   - Hausaufgaben-Lookup fuer 5 Modul-0-Fragen (Nein/Teilweise-Texte)
   - Gewichtungs-Konfiguration (m1-m8 je 10%, m9 = 20%)
2. Eine deterministische SUI-Score-Engine als Pure-Function-Library mit 7 Functions (computeModuleScores, computeSui, classifySui, mapModuleScoreToStufe, aggregateHausaufgaben, aggregateReflexion, selectThreeHebel) + `computeWheelPaths` (FEAT-066 Pre-Pflicht)
3. Eine Server-Action `finalizeMandantenReport(captureSessionId)` die alle Pure-Functions sequenziell aufruft und das Ergebnis als `v8_report_snapshot` JSONB in `capture_session.metadata` schreibt
4. Worker-Pipeline-Branch in `src/workers/condensation/` der bei `usage_kind='mandanten_report_teaser_v1'` die V8-Finalize-Logik ohne Bedrock-Call ausfuehrt

**KEINE neue Tabelle**, **KEINE neue Cron-Jobs**, **KEINE neuen Production-Dependencies**, **KEINE Bedrock-Calls** (DEC-159..161 deterministisch).

## In Scope

- Tonalitaets-Migration der 90+ Stufen-Lookup-Texte (LEVELS.md StB-Adressat -> Mandant-Adressat "Sie"-Form mit Strategaize-Sicht "Unsere Empfehlung")
- Migration 102 (`sql/migrations/102_v8_exit_readiness_teaser_template.sql`) idempotent via `ON CONFLICT (slug, version) DO UPDATE`
- Pure-Function-Library `src/lib/diagnose/sui-engine.ts` + Vitest-Coverage
- Pure-Function `computeWheelPaths` in `src/lib/diagnose/wheel-paths.ts` + Vitest (FEAT-066 SLC-150 Pre-Pflicht)
- Server-Action `finalizeMandantenReport` mit Worker-Branch-Trigger
- Worker-Pipeline-Branch in `src/workers/condensation/` fuer `usage_kind='mandanten_report_teaser_v1'`
- Live-Apply Migration 102 auf Coolify-DB via Hetzner-Procedure
- Vitest-Coverage gegen Coolify-DB fuer Pure-Functions + Migration-Smoke

## Out of Scope

- UI-Antwort-Schemata (HygieneAnswerPills, ReifeSkalaAnswer, ReflexionTextarea) — SLC-149
- PDF-Renderer V2 — SLC-150 + SLC-151
- Email-Versand-Branch + Telemetrie + Live-Smoke — SLC-152
- LLM-Augmentation Layer — V8.1+ (DEC-159..161 deterministisch in V8.0)
- Template-Versionierte-Updates (Stufen-Texte aendern) — V8.2+, vorerst write-once-bei-Migration
- Pro-Tenant-Gewichtungs-Anpassung — V9+

## Pre-Conditions

- ✓ V7.7 /post-launch STABLE bestaetigt (RPT-350, 2026-05-28 17:00 UTC)
- ✓ V8 /architecture DONE (RPT-349, DEC-157..164)
- ✓ Founder-Tonalitaets-Migration-Workflow entschieden: separate `EXIT_READINESS_LEVELS_MANDANT.md` im Dev-System + Build-Time-Skript (siehe Pre-MT-1)
- ✓ Branch-Strategie entschieden: Cumulative-Single-Branch-Worktree `v8-mandanten-report` (siehe Branch-Strategie unten)

## Branch-Strategie (Cumulative-Single-Branch-Worktree)

Per [[feedback-cumulative-single-branch-pattern]] (etabliert BS V8.4 SLC-841..846) und SaaS-Mode-Worktree-Pflicht: **alle 5 V8-Slices SLC-148..152 laufen auf einem einzigen Worktree-Branch `v8-mandanten-report`**.

**Begruendung:**
1. SLC-149 (Frontend) braucht das Template-JSONB-Schema das SLC-148 definiert
2. SLC-150 + SLC-151 (Renderer) brauchen explizit das SUI-Snapshot-Format aus SLC-148 SUI-Engine
3. SLC-152 (Integration) braucht alle vorherigen Slices
4. Worktree-Junction-Pain auf Windows wird auf 1 Worktree begrenzt statt 5
5. Master-Merge erfolgt EINMALIG am Schluss nach SLC-152 + Gesamt-/qa

**Worktree-Setup (in /backend SLC-148 MT-0):**
```powershell
cd c:\strategaize\strategaize-onboarding-plattform
git worktree add -b v8-mandanten-report c:\strategaize\strategaize-onboarding-plattform-v8 main
cd c:\strategaize\strategaize-onboarding-plattform-v8
# Junction node_modules zum main-Repo (vermeidet 2. npm install)
cmd /c mklink /J node_modules ..\strategaize-onboarding-plattform\node_modules
```

**Master-Merge nach SLC-152 (Fast-Forward erwartet):**
```bash
cd c:\strategaize\strategaize-onboarding-plattform
git merge --ff-only v8-mandanten-report
git push origin main
```

**Worktree-Cleanup (post Master-Merge per [[feedback-worktree-cleanup-sequence-pflicht]]):**
```powershell
# 1. Junction entfernen ZUERST
cmd /c rmdir c:\strategaize\strategaize-onboarding-plattform-v8\node_modules
# 2. Dann git worktree remove
git worktree remove c:\strategaize\strategaize-onboarding-plattform-v8
```

## Pre-MT-1 — Founder Tonalitaets-Migration (NICHT Code, ~30-45min Founder-Pflicht)

**Entscheidung Tonalitaets-Migration-Workflow** (RPT-349 OQ-1, in /slice-planning entschieden):

**Gewaehlter Pfad: separate Markdown-Datei + Build-Time-Skript.**

**Begruendung:**
- Founder schreibt in Markdown-Editor mit Live-Preview, Diff-Review zwischen Iterationen moeglich
- Datei lebt im Dev-System (`strategaize-dev-system/docs/curriculum/v2/`), analog zu `EXIT_READINESS_LEVELS.md`-Quelle
- Build-Time-Skript ist reusable fuer V8.1+ Updates (z.B. Stufe-3-Modul-4-Text-Refinement)
- Kein Code-Deploy fuer Text-Updates, nur Migration-Re-Apply
- Trennung Code (OP-Repo) vs. Content (Dev-System) konsistent zur bestehenden Architektur

**Pflicht-Aktionen Founder vor /backend SLC-148:**

1. **Neue Datei anlegen**: `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/EXIT_READINESS_LEVELS_MANDANT.md`
2. **Struktur als YAML-Frontmatter pro Stufen-Eintrag** (vom Build-Skript geparsed):
   ```markdown
   ## Modul 1 — Skalierbares Produkt

   ### Worum es geht
   {Markdown-Text fuer module-level "worum_es_geht" — 1-2 Saetze aus EXIT_READINESS_PRINZIPIEN.md "Botschaft an den Unternehmer"}

   ### Stufe 1 — Noch gar nicht vorhanden

   **Was es bedeutet:**
   {Markdown-Text aus EXIT_READINESS_LEVELS.md "Was es bedeutet"-Sektion — 1:1 portiert}

   **Unsere Empfehlung:**
   {Markdown-Text — Tonalitaets-migriert von "Was der Steuerberater im Gespraech sieht" auf "Sie"-Form mit Strategaize-Sicht: kein "Wir sollten", kein "Ihr Steuerberater", kein "der Berater", direkter Mandanten-Adressat}

   ### Stufe 2 — Erste Ansaetze
   ...
   ```
3. **Modul 1-9 x Stufe 1-5 = 45 Stufen-Eintraege** schreiben
4. **9 "Worum es geht"-Modul-Texte** schreiben (1-2 Saetze pro Modul)
5. **5 Hausaufgaben-Texte fuer Modul 0** (M0.1-M0.5, je 2 Varianten Nein + Teilweise = 10 Texte total) im selben File unter `## Modul 0 — Hygiene-Hausaufgaben`-Section
6. **Tonalitaets-Audit Stichprobe**: Mind. 5 "Unsere Empfehlung"-Texte selbst pruefen auf:
   - Keine "Wir sollten"-Konstrukte ohne klare Strategaize-Sicht
   - Kein "Ihr Steuerberater" / "der Berater" als Adressat
   - Direkter Mandanten-Adressat ("Sie haben...", "Sie sollten...")
   - "Unsere Empfehlung" ist die Strategaize-Sicht, nicht die StB-Sicht

**Pre-MT-1 Acceptance:**
- ✓ Datei `EXIT_READINESS_LEVELS_MANDANT.md` existiert mit allen 45 Stufen-Eintraegen
- ✓ 9 "Worum es geht"-Texte vorhanden
- ✓ 5 Hausaufgaben-Texte vorhanden (10 Varianten)
- ✓ Founder-Verdict zur Tonalitaet "passt" (Self-Audit-Notes als Code-Comment im Build-Skript)
- ✓ Datei im Dev-System committed + gepusht

Erst nach Pre-MT-1 Acceptance startet MT-1.

## Micro-Tasks

### MT-1: Build-Time-Skript fuer LEVELS_MANDANT.md -> SQL-Seed
- **Goal**: Skript `scripts/build-v8-template-seed.mjs` (Node) liest `EXIT_READINESS_LEVELS_MANDANT.md` aus dem Dev-System, parsed die Markdown-Struktur, baut ein JSONB-Objekt `metadata.stufen_lookup` + `metadata.worum_es_geht` + `metadata.hausaufgaben_lookup`, schreibt es als idempotenter `INSERT INTO template ... ON CONFLICT DO UPDATE`-SQL-Snippet in eine neue Migration-Datei.
- **Files**:
  - `scripts/build-v8-template-seed.mjs` (NEU) — Build-Skript
  - `scripts/__tests__/build-v8-template-seed.test.mjs` (NEU) — Vitest mit Mock-Markdown-Input
- **Expected Behavior**:
  - Liest `../strategaize-dev-system/docs/curriculum/v2/EXIT_READINESS_LEVELS_MANDANT.md`
  - Parsed Modul-Sections (`## Modul X — Y`) und Stufen-Sections (`### Stufe N — Label`)
  - Extrahiert `**Was es bedeutet:**` + `**Unsere Empfehlung:**` Markdown-Blocks
  - Baut Stufen-Lookup: `{ m1: { s1: { was_es_bedeutet, unsere_empfehlung }, ..., s5: {...} }, ..., m9: {...} }`
  - Baut Worum-es-geht: `{ m1: "...", m2: "...", ..., m9: "..." }`
  - Baut Hausaufgaben-Lookup: `{ "M0.1": { nein: "...", teilweise: "..." }, ..., "M0.5": {...} }`
  - Schreibt diese 3 JSONB-Objekte als Literal in SQL-INSERT-Statement
  - Output: `sql/migrations/102_v8_exit_readiness_teaser_template.sql`
- **Verification**:
  - Vitest: Mock-Markdown mit 2 Modulen x 2 Stufen → Skript erzeugt korrektes JSONB-Objekt
  - Vitest: Markdown-Section ohne "Unsere Empfehlung" → Skript wirft Validation-Error
  - Bash: `node scripts/build-v8-template-seed.mjs` erzeugt Datei ohne Fehler
- **Dependencies**: Pre-MT-1 (LEVELS_MANDANT.md Founder-Pflicht durch)

### MT-2: Migration 102 schreiben (Frage-Struktur + Score-Mapping + Gewichtung)
- **Goal**: Migration-SQL-Datei `102_v8_exit_readiness_teaser_template.sql` enthaelt vollstaendige Template-INSERT mit 47 Fragen, 45 Stufen-Lookup-Eintraegen, 9 Worum-es-geht-Texten, Hausaufgaben-Lookup, Gewichtungs-Config. Idempotent via `ON CONFLICT (slug, version) DO UPDATE`.
- **Files**:
  - `sql/migrations/102_v8_exit_readiness_teaser_template.sql` (NEU, vom MT-1-Build-Skript erzeugt + manuelle Erweiterung um 47 Fragen-Struktur)
  - `__tests__/migrations/102-template-seed.test.ts` (NEU) — Vitest gegen Coolify-DB
- **Expected Behavior**:
  - `INSERT INTO public.template (slug, version, ..., metadata, blocks) VALUES ('exit-readiness-teaser-v1', 1, ...) ON CONFLICT (slug, version) DO UPDATE SET ...`
  - `blocks` JSONB = Array mit 11 Module-Objekten, jedes mit `modul_id` (M0..M10), `name`, `questions[]`
  - Modul 0: 5 Fragen `answer_schema_kind='hygiene_yes_partial_no'`
  - Module 1-9: 37 Fragen `answer_schema_kind='reife_skala_5'`, je mit `score_mapping: {1:0, 2:2, 3:5, 4:8, 5:10}`
  - Modul 10: 5 Fragen `answer_schema_kind='reflexion_freitext'`
  - `metadata.usage_kind = 'mandanten_report_teaser_v1'`
  - `metadata.scoring_kind = 'sui_weighted'`
  - `metadata.report_renderer = 'mandanten_report_v2'`
  - `metadata.gewichtung = { m1: 10, ..., m8: 10, m9: 20 }`
- **Verification**:
  - Vitest gegen Coolify-DB (via node:22 Docker-Pattern aus [[coolify-test-setup]]):
    - Migration apply 1x -> Row exists, `version=1`
    - Migration apply 2x (idempotent) -> Keine Fehler, gleiche Row
    - `SELECT blocks` -> 11 Module, exact count je Modul
    - `SELECT metadata->>'usage_kind'` -> `'mandanten_report_teaser_v1'`
  - Migration-SQL lokal `psql -d postgres` Smoke-Test (Linting per DEC-067 SQL-Format)
- **Dependencies**: MT-1

### MT-3: Migration 102 LIVE auf Coolify-DB applizieren
- **Goal**: Migration 102 auf 159.69.207.29 Coolify-Supabase-DB live applizieren via etablierter SSH+Base64-Procedure ([[sql-migration-hetzner]]).
- **Files**:
  - `docs/MIGRATIONS.md` — MIG-047 Status-Update auf `Date: 2026-05-XX (live)` mit Apply-Verifikation
- **Expected Behavior**:
  - Base64-encode lokale Migration: `base64 -w 0 sql/migrations/102_v8_exit_readiness_teaser_template.sql`
  - SSH 159.69.207.29: `echo 'BASE64' | base64 -d > /tmp/102.sql && docker exec -i <db-container> psql -U postgres -d postgres < /tmp/102.sql`
  - Verifikation: `docker exec <db> psql -U postgres -d postgres -c "SELECT slug, version, jsonb_array_length(blocks) FROM template WHERE slug='exit-readiness-teaser-v1';"` → 1 Row, version=1, blocks-Laenge=11
  - V6.3-Template-Co-Existenz: `SELECT slug FROM template WHERE slug IN ('partner_diagnostic_v1', 'exit-readiness-v1.0.0', 'exit-readiness-teaser-v1') ORDER BY slug;` → alle 3 Rows
- **Verification**:
  - Live-Query auf Coolify-DB zeigt Template-Row + V6.3-Co-Existenz
  - error_log post-Apply 0 Errors
- **Dependencies**: MT-2

### MT-4: Pure-Function-Library `sui-engine.ts` + Vitest
- **Goal**: Neue Datei `src/lib/diagnose/sui-engine.ts` mit 7 Pure-Functions deterministisch + 15+ Vitest-Cases.
- **Files**:
  - `src/lib/diagnose/sui-engine.ts` (NEU)
  - `src/lib/diagnose/__tests__/sui-engine.test.ts` (NEU)
  - `src/lib/diagnose/types.ts` (NEU oder additiv) — Type-Definitionen fuer Answer, Template, Snapshot
- **Expected Behavior** (per FEAT-065 + RPT-349):
  - `computeModuleScores(answers: Answer[], template: Template): { m1: number, ..., m9: number }` — Iteriert Module 1-9, Durchschnitt Frage-Scores, ignoriert Modul 0 + 10
  - `computeSui(moduleScores): number` — Gewichtetes Mittel `(m1*10 + ... + m8*10 + m9*20) / 100`, Returns 0-100
  - `classifySui(sui): { kind, color, label, meaning }` — 0-30 strukturluecke/rot, 31-55 teil_reife/amber, 56-100 tragbar/gruen
  - `mapModuleScoreToStufe(score): number` — Score 0-10 -> Stufe 1-5 (Bereichs-Mitten als Schwellen: 0-1 -> 1, 1.01-3 -> 2, 3.01-6 -> 3, 6.01-9 -> 4, 9.01-10 -> 5)
  - `aggregateHausaufgaben(answers, template): Array<{ frage_id, frage_text, status }>` — Filter auf Modul 0 + status in (nein, teilweise)
  - `aggregateReflexion(answers, template): Array<{ frage_id, frage_text, antwort_text }>` — Filter auf Modul 10 + non-empty text
  - `selectThreeHebel(moduleScores, stufenLookup): Array<{ modul_id, modul_name, score, stufe, empfehlung }>` — 3 Module mit niedrigstem Score (ties: m1 < m2 < m3 als Tie-Breaker fuer Determinismus), zieht Empfehlung aus stufen_lookup[modul_id][stufe].unsere_empfehlung
- **Verification** (Vitest):
  - Alles Stufe 1 (37 Antworten Score=0) -> SUI=0, Klassifizierung strukturluecke
  - Alles Stufe 3 (37 Antworten Score=5) -> SUI=50, Klassifizierung teil_reife
  - Alles Stufe 5 (37 Antworten Score=10) -> SUI=100, Klassifizierung tragbar
  - Module 1-8 alle Stufe 5, Modul 9 Stufe 1 -> SUI=80.0 (Gewichtungs-Effekt sichtbar, AC-2)
  - Klassifizierungs-Schwellen: SUI=0/29/30/31/55/56/100 -> Exakte kind-Werte (AC-3)
  - Modul-Score-zu-Stufe: 0/2/5/8/10 -> 1/2/3/4/5 + Bereichs-Mitten 1/4/7 -> 2/3/4 (AC-4)
  - Hausaufgaben: 5 Antworten (2 ja + 2 nein + 1 teilweise) -> 3 Items (AC-5)
  - Reflexion: 5 Antworten (3 ausgefuellt + 2 leer) -> 3 Items (AC-6)
  - Hebel-Auswahl: Score-Profil m1=8/m2=2/m3=5/m4=2/m5=9/m6=3/m7=7/m8=4/m9=6 -> [m2, m4, m6] mit Tie-Break-Regel (AC-7)
- **Dependencies**: MT-3 (Template-Daten muessen lesbar sein fuer Type-Inferenz)

### MT-5: Pure-Function `computeWheelPaths` + Vitest (FEAT-066 Pre-Pflicht)
- **Goal**: Pure-Function-Library `src/lib/diagnose/wheel-paths.ts` mit `computeWheelPaths(moduleScores, options): WheelPath[]` und Vitest. Wird in SLC-150 (Renderer) konsumiert, hier vorgezogen fuer Determinismus + Vitest-Coverage.
- **Files**:
  - `src/lib/diagnose/wheel-paths.ts` (NEU)
  - `src/lib/diagnose/__tests__/wheel-paths.test.ts` (NEU)
- **Expected Behavior** (per DEC-162 Wheel-Render + RPT-349):
  - `computeWheelPaths(moduleScores: { m1..m9 }, options: { focusIdx?: number, radius?: number, centerX?: number, centerY?: number }): Array<{ modulId, pathD, fillColor, label }>`
  - Berechnet 9 Sector-Pfade (1/9-tel Kreis-Segmente) basierend auf Modul-Scores (Score 0-10 -> Sector-Radius-Faktor 0.2-1.0)
  - Color-Mapping: Score 0-3.99 -> rot, 4-6.99 -> amber, 7-10 -> gruen (3-Stufen-Klassifizierung visuell)
  - `focusIdx`-Option: 0-8 (0-indiziert m1..m9) -> nicht-focus-Sectoren bekommen `fillColor` mit Alpha 0.3, focus-Sector bleibt full-Alpha
  - SVG-Path-D-String fuer @react-pdf <Path d={...} /> kompatibel
  - Default radius=80, centerX=100, centerY=100 (200x200 SVG-Viewport)
- **Verification** (Vitest):
  - Alles Score 5 (mittel) -> 9 Pfade mit gleichem Radius-Faktor (0.5), alle amber
  - Score-Profil m1-m9 = 0/2/4/6/8/10/3/5/7 -> 9 unterschiedliche Pfade mit korrekter Farb-Klassifizierung
  - focusIdx=4 (m5) -> 8 von 9 Pfaden haben Alpha 0.3, m5-Pfad full-Alpha
  - Path-D-String beginnt mit `M ` (MoveTo) und enthaelt `A ` (Arc-Command)
  - radius/centerX/centerY Custom-Options propagieren korrekt
  - Edge-Case: alle Scores 0 -> 9 Pfade mit min-Radius 0.2*radius (Stufe-1-Visualisierung), nicht 0 (Vermeidung leerer Pfade)
- **Dependencies**: keine (pure Funktion, kein Template-Lookup)

### MT-6: Server-Action `finalizeMandantenReport` + Worker-Pipeline-Branch
- **Goal**: Server-Action und Worker-Branch die alle Pure-Functions sequenziell aufrufen und das Ergebnis als `v8_report_snapshot` JSONB in `capture_session.metadata` schreiben.
- **Files**:
  - `src/app/dashboard/diagnose/actions.ts` (additiv) — neue Server-Action `finalizeMandantenReport(captureSessionId)`
  - `src/workers/condensation/pipeline.ts` (additiv) — neue Branch `runV8MandantenReportPipeline` getriggert ueber `template.metadata.usage_kind='mandanten_report_teaser_v1'`
  - `src/workers/condensation/__tests__/v8-pipeline.test.ts` (NEU)
- **Expected Behavior**:
  - Server-Action liest `capture_session` + alle `capture_response`-Rows fuer Session
  - Validierung: Session muss `status='in_progress'` oder `'completed'` haben, template_slug muss `exit-readiness-teaser-v1` sein
  - Worker-Branch Detection: bestehende `runLightPipeline` checkt `template.metadata.usage_kind` und routed auf `runV8MandantenReportPipeline` wenn `mandanten_report_teaser_v1`
  - V8-Pipeline (DETERMINISTISCH, KEIN Bedrock):
    1. `computeModuleScores(answers, template)` -> moduleScores
    2. `computeSui(moduleScores)` -> sui
    3. `classifySui(sui)` -> classification
    4. `Object.fromEntries(Object.entries(moduleScores).map(([k, v]) => [k, mapModuleScoreToStufe(v)]))` -> stufenMapping
    5. `aggregateHausaufgaben(answers, template)` -> hausaufgaben
    6. `aggregateReflexion(answers, template)` -> reflexionen
    7. `selectThreeHebel(moduleScores, template.metadata.stufen_lookup)` -> hebel
  - DB-Update: `UPDATE capture_session SET metadata = metadata || jsonb_build_object('v8_report_snapshot', $snapshot::jsonb) WHERE id=$1`
  - Snapshot-Schema: `{ schemaVersion: 1, finalizedAt, moduleScores, sui, classification, stufenMapping, hausaufgaben, reflexionen, hebel }`
  - INSERT `block_checkpoint` mit `checkpoint_type='auto_final'` (V6.3-Pattern-Reuse)
- **Verification** (Vitest gegen Coolify-DB via node:22 + Pure-Function-Unit-Tests):
  - Test-Set: Komplette 47-Antwort-Session vorab via INSERT capture_response erstellen
  - Server-Action ausfuehren -> capture_session.metadata.v8_report_snapshot existiert, alle 7 Felder vorhanden
  - Worker-Pipeline-Branch wird getriggert (Mock-Test mit V8-template_slug)
  - V6.3 Co-Existenz: `runLightPipeline` mit `partner_diagnostic_v1`-Template fuehrt weiter V6.3-Pfad aus
  - error_log Worker-Run 0 Errors
- **Dependencies**: MT-4, MT-5

### MT-7: Records-Update + /qa SLC-148 + Live-Test Founder-Session
- **Goal**: Project-Records updaten + /qa fuer Code-Side + Live-Test einer Test-Mandant-Session ohne UI.
- **Files**:
  - `docs/MIGRATIONS.md` — MIG-047 Status `(live)`
  - `docs/STATE.md` — Current-Focus auf SLC-148 done
  - `slices/INDEX.md` — SLC-148 status `done`
  - `planning/backlog.json` — BL-128 + BL-130 status `done`
  - `features/INDEX.md` — FEAT-063 + FEAT-065 status `done`
  - `reports/RPT-XXX.md` (NEU) — Completion-Report + /qa-Report (kombiniert)
- **Expected Behavior**:
  - tsc EXIT=0 Repo-weit
  - ESLint SLC-148-Scope EXIT=0
  - Vitest SLC-148-Scope + adjacent (sui-engine + wheel-paths + v8-pipeline + 102-template-seed) alle PASS
  - Live-Test: Test-Capture-Session mit 47 Antworten via SQL-INSERT erzeugen, `finalizeMandantenReport` ausfuehren, snapshot-JSONB inspizieren (jq oder psql-Output)
  - Snapshot-Inspection-Checks: `sui` zwischen 0-100, `classification.kind` valide, `moduleScores` 9 Keys, `stufenMapping` 9 Keys mit Werten 1-5, `hausaufgaben` Array, `reflexionen` Array, `hebel` Array mit 3 Items
- **Verification**:
  - /qa-Report PASS code-side + Live-Test-Snapshot validiert
  - Co-Existenz: V6.3 partner_diagnostic_v1-Run weiter funktional (Vitest-Reuse gegen V6.3-Template)
- **Dependencies**: MT-6

## Acceptance Criteria (zusammengefuegt aus FEAT-063 + FEAT-065)

- **AC-1 Template-Seed lebt**: `public.template` Row `slug='exit-readiness-teaser-v1'`, `version=1` LIVE auf Coolify-DB (FEAT-063 AC-1)
- **AC-2 47 Fragen vollstaendig**: `template.blocks` enthaelt 11 Module mit 5+37+5=47 Fragen, Vitest verifiziert IDs (FEAT-063 AC-2)
- **AC-3 Score-Mapping korrekt**: Jede Skala-Frage hat `score_mapping: {1:0, 2:2, 3:5, 4:8, 5:10}`, Hygiene + Reflexion ohne Score (FEAT-063 AC-3)
- **AC-4 Stufen-Lookup vollstaendig**: 45 Eintraege + 9 Worum-es-geht-Texte als JSONB im Template-Metadata (FEAT-063 AC-4)
- **AC-5 Tonalitaets-Transformation durchgefuehrt**: Stichprobe 5+ "Unsere Empfehlung"-Texte clean (FEAT-063 AC-5)
- **AC-6 Co-Existenz**: V6.3 `partner_diagnostic_v1` + V1 `exit-readiness-v1.0.0` unveraendert (FEAT-063 AC-6, FEAT-065 AC-9)
- **AC-7 SUI-Score-Korrektheit**: Vitest fuer 5+ Antwort-Sets verifiziert SUI exakt (FEAT-065 AC-1)
- **AC-8 Modul-9-Doppelte-Gewichtung**: Vitest mit asymmetrischem Set verifiziert SUI 80.0 statt 88.9 (FEAT-065 AC-2)
- **AC-9 Klassifizierungs-Schwellen**: Vitest fuer SUI=0/29/30/31/55/56/100 verifiziert kind-Werte (FEAT-065 AC-3)
- **AC-10 Modul-Score-zu-Stufe-Mapping**: Vitest fuer Score 0/2/5/8/10 + Mitten 1/4/7 (FEAT-065 AC-4)
- **AC-11 Hausaufgaben-Aggregation**: Vitest 5 Antworten (2 ja + 2 nein + 1 teilweise) -> 3 Items (FEAT-065 AC-5)
- **AC-12 Reflexions-Aggregation**: Vitest 5 Reflexions-Antworten (3 ausgefuellt + 2 leer) -> 3 Items (FEAT-065 AC-6)
- **AC-13 Hebel-Auswahl deterministisch**: Vitest mit definiertem Score-Profil verifiziert Top-3 niedrigste + Tie-Breaker (FEAT-065 AC-7)
- **AC-14 Server-Action End-to-End**: `finalizeMandantenReport` auf Test-Mandant LIVE auf Coolify-DB, snapshot-JSONB vollstaendig (FEAT-065 AC-8)
- **AC-15 computeWheelPaths funktional**: 9 Pfade fuer 9 Modul-Scores, 3-Farb-Klassifizierung, focusIdx-Alpha, edge-case Score 0 minRadius (FEAT-066 Pre-Pflicht via DEC-162)
- **AC-SLC-148-1 Migration-Idempotenz**: Migration 102 2x apply funktioniert ohne Fehler (Pattern-Reuse V6.3 MIG-037)
- **AC-SLC-148-2 Quality-Gates**: tsc EXIT=0, ESLint EXIT=0, Vitest 30+/30+ SLC-148-Scope PASS
- **AC-SLC-148-3 Worktree-Setup**: `v8-mandanten-report`-Branch existiert, Junction node_modules funktional

## Wiring-Verification-Liste

- ✓ Tonalitaets-Markdown-Datei -> Build-Skript -> SQL-Migration-Datei -> Live-DB-Row
- ✓ Template-Daten -> SUI-Engine (Stufen-Lookup-Resolution in selectThreeHebel)
- ✓ SUI-Engine -> Server-Action (finalizeMandantenReport)
- ✓ Server-Action -> Worker-Pipeline-Branch (usage_kind-Detection)
- ✓ Worker-Pipeline-Branch -> capture_session.metadata.v8_report_snapshot
- ✓ V6.3 partner_diagnostic_v1 -> runLightPipeline V6.3-Pfad (UNVERAENDERT)
- ✓ computeWheelPaths (Pre-Pflicht fuer SLC-150)

## Risks / Notable Concerns

- **R-1 Tonalitaets-Migration-Workflow**: Founder-Pflicht ~30-45min vor MT-1. Bei Verzoegerung blockiert das gesamte SLC-148.
  - **Mitigation**: Pre-MT-1 als explizite separate User-Action vor /backend SLC-148 in /backend-Workflow ausweisen. Founder-Verdict in MT-1 PR-Description abhaken.
- **R-2 Tonalitaets-Drift**: 90+ manuell geschriebene Texte koennten subtil StB-Tonalitaet behalten ("Wir sollten...", "der Berater...").
  - **Mitigation**: AC-5 + Tonalitaets-Audit-Skript in MT-7 (Grep "Ihr Steuerberater" / "wir empfehlen" in gerenderten Strings). Bei Treffern: Founder-Re-Edit der LEVELS_MANDANT.md + Migration-Re-Apply.
- **R-3 SUI-Score-Formel-Off-by-One**: Modul-9-Doppelte-Gewichtung subtil falsch berechnet (z.B. nominal m9*20 aber Summe-Divisor falsch).
  - **Mitigation**: AC-7 + AC-8 mit exakten Erwartungs-Werten als Vitest-Cases. Spec-Test gegen Hand-Berechnung.
- **R-4 Migration-Idempotenz-Bug**: `ON CONFLICT (slug, version) DO UPDATE` koennte JSONB-Felder nicht alle ueberschreiben (PG-Default-Behavior nur `EXCLUDED.column`).
  - **Mitigation**: AC-SLC-148-1 Vitest mit 2x apply + Inhalts-Vergleich. Pattern-Reuse V6.3 MIG-037 als Vorlage.
- **R-5 Worker-Pipeline-Branch-Regression**: V6.3-Pfad koennte durch usage_kind-Switch broken.
  - **Mitigation**: AC-6 Co-Existenz mit Vitest-Run gegen V6.3-Template + Pre-Branch-Audit aller V6.3-Pipeline-Tests.
- **R-6 computeWheelPaths SVG-Path-Drift**: SVG-Path-D-String muss @react-pdf-Path-Komponente kompatibel sein (Subset von SVG-Path-Spec).
  - **Mitigation**: MT-5 Vitest mit @react-pdf-Pfad-Parser-Smoke (manuelle Verifikation via PDF-Render in SLC-150 MT-1 Spike).

## Verification Strategy

- **TDD**: SUI-Engine + computeWheelPaths Pure-Functions strict TDD (Test schreiben -> rot -> Implementation -> gruen)
- **Live-DB-Tests** via node:22 Docker-Pattern ([[coolify-test-setup]]) fuer Migration + Server-Action
- **SAVEPOINT-Pattern** ([[coolify-test-setup]]) fuer expected RLS-Rejections in Vitest
- **Founder-Live-Smoke** in MT-7 (SQL-INSERT Test-Antworten + finalizeMandantenReport + snapshot-Inspection)

## Dependencies / Pre-Conditions Tabelle

| Pre-Condition | Status | Aktion |
|---|---|---|
| V7.7 /post-launch STABLE | ✓ done | RPT-350 |
| V8 /architecture | ✓ done | RPT-349, DEC-157..164 |
| Tonalitaets-Migration-Workflow entschieden | ✓ done | Separate LEVELS_MANDANT.md + Build-Skript (dieser Slice-File) |
| Branch-Strategie entschieden | ✓ done | Cumulative-Single-Branch-Worktree `v8-mandanten-report` (dieser Slice-File) |
| Founder Tonalitaets-Migration durchgezogen | pending | Pre-MT-1 ~30-45min vor /backend SLC-148 |

## Cross-References

- **Architektur**: `docs/ARCHITECTURE.md` V8-Addendum (Implementation Direction SLC-148)
- **Features**: `features/FEAT-063-mandanten-report-teaser-template.md`, `features/FEAT-065-sui-score-engine.md`
- **Decisions**: DEC-157 (PDF-Engine bleibt @react-pdf), DEC-159 (Score-Engine deterministisch), DEC-160 (Hebel-Auswahl deterministisch), DEC-161 (Hausaufgaben deterministisch), DEC-162 (Wheel via @react-pdf <Svg> + Pure-Function), DEC-163 (Bericht-Persistenz JSONB), DEC-164 (Stufen-Lookup-Quelle in template.metadata)
- **Migration**: MIG-047 (Migration 102, geplant)
- **Reuse-Patterns**:
  - V6.3 SLC-105 MIG-037 (Template-Seed-Migration, idempotent)
  - V6.3 `computeBlockScores`-Pure-Function (Pattern-Reuse fuer sui-engine)
  - V6.3 `runLightPipeline`-Worker-Branch via template.metadata (DEC-126 Reuse)
  - V6.4 UNIQUE(slug, version) Template-Versionierung (FEAT-049)
- **Memory**:
  - [[feedback-cumulative-single-branch-pattern]] — Branch-Strategie
  - [[feedback-mandanten-empfehlung-unsere-nicht-stb]] — Tonalitaet
  - [[coolify-test-setup]] — Live-DB-Test-Pattern (node:22 Docker)
  - [[sql-migration-hetzner]] — Migration-Apply-Procedure
  - [[feedback-worktree-cleanup-sequence-pflicht]] — Cleanup-Sequence
- **Quelle (Dev-System, Founder-Pflicht)**:
  - `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/EXIT_READINESS_LEVELS.md` (Original-Quelle Tonalitaet StB)
  - `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/EXIT_READINESS_LEVELS_MANDANT.md` (NEU, Founder schreibt in Pre-MT-1)
  - `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/EXIT_READINESS_PRINZIPIEN.md` (Fragebogen-Struktur)
