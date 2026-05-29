# SLC-151 — Renderer Phase B (9 Modul-Pages + Hausaufgaben + Hebel + Reflexion + CTA)

**Version:** V8
**Feature:** FEAT-066 Phase B (17-Seiten-Premium-Mandanten-Report-Renderer V2)
**Backlog:** BL-131
**Status:** planned
**Created:** 2026-05-29
**Priority:** High
**Estimate:** ~8-12h Code-Side
**Worktree Branch:** `v8-mandanten-report` (Cumulative-Single-Branch — selbe Branch wie SLC-148/149/150)

## Slice Goal

Baut auf SLC-150 Phase-A-Foundation auf und liefert die **14 verbleibenden PDF-Pages** des 17-Seiten-Mandanten-Reports gemaess MANDANTEN_REPORT_PROTOTYP.html:

- **9 Modul-Pages** (Pages 4-12) — pro Modul (M1..M9) eine A4-Seite mit fokussiertem Wheel-Segment links + 3-Sektionen-Text rechts (Worum es geht / Was es in Ihrer Firma bedeutet / Unsere Empfehlung)
- **Hausaufgaben-Page** (Page 13) — Modul-0-Findings mit Status Nein/Teilweise strukturiert
- **3-Strategie-Hebel-Page** (Page 14) — Top-3 niedrigste Module mit Modul-Name + Score + Naechste-Schritte-Block
- **Reflexion-Page** (Page 15) — Modul-10-Antworten als Zitat-Sammlung
- **CTA-Folgegespraech-Page** (Pages 16-17) — Pflicht-CTA + StB-Kontakt-Info-Slot + Strategaize-Footer

Plus **Tonalitaets-Audit-Skript** als Lint-Schutz fuer "Unsere Empfehlung"-Texte ueber alle 90+ Stufen-Lookup-Eintraege.

Nach diesem Slice ist der vollstaendige 17-Seiten-PDF-Renderer code-side komplett. **SLC-152 bringt die Email-Versand-Integration + Live-Smoke + Master-Merge.**

## In Scope

- **Reusable Sub-Component** `<ModulPage>` mit Props `{ modulKey, modulName, modulScore, modulStufe, wheelData, stufenInfo, worumEsGeht }` (1× implementieren, 9× verwenden)
- **9 Modul-Pages-Iteration** (Pages 4-12) ueber `{m1, m2, ..., m9}` mit korrektem `focusIdx` pro Modul (0-8) in Wheel-Component
- **Stufen-Lookup-Resolution** aus `template.metadata.stufen_lookup[modul][stufe]` (Reuse aus SLC-148 SUI-Engine `mapModuleScoreToStufe` Output)
- **HausaufgabenPage.tsx** (Page 13) mit Empty-State "Gratulation, keine Hausaufgaben in Modul 0" wenn `snapshot.hausaufgaben.length === 0`
- **HebelPage.tsx** (Page 14) — 3 Hebel-Bloecke aus `snapshot.hebel` mit Modul-Name + Score + Empfehlung
- **ReflexionPage.tsx** (Page 15) — Quotation-Block-Layout fuer `snapshot.reflexionen` + Empty-State "Reflexion offen — diskutieren wir im Folgegespraech"
- **CtaPage.tsx** (Pages 16-17) — 2-Seiten-CTA-Block mit Hero-Pitch + StB-Kontakt-Slot + Strategaize-Footer
- **Tonalitaets-Audit-Skript** `scripts/audit-v8-tonality.mjs` greppt gerendertes PDF (via `pdf-parse`-Lib oder direkt `template.metadata.stufen_lookup`-JSONB) auf Blacklist-Phrasen
- **Vitest** fuer Pure-Logic-Helpers (`resolveStufenInfo`, `getModuleLegendData`, `formatHebelBlock`)
- **Smoke-PDF erweitert** zu vollstaendigem 17-Seiten-Output via `scripts/spike-v8-wheel-demo.mjs` (NEU benannt zu `scripts/render-v8-fixture.mjs` als generischer Render-Smoke)

## Out of Scope

- **FEAT-060 Email-Versand-Branch** mit Template-Variant-Switch — SLC-152
- **Bericht-Pending-Page Frontend-Snapshot-Reader** — SLC-152
- **Telemetrie-Events** `report_generated` + `email_sent` + `pdf_size_bytes` — SLC-152
- **Live-Smoke End-to-End Founder-Test** mit echtem Mandant-Run — SLC-152
- **Master-Merge `v8-mandanten-report` -> main** — SLC-152 (letzte Slice der V8-Cumulative-Sequenz)
- **StB-Partner-Branding** (Logo + Farben pro Partner) im PDF — V8.1+
- **Mehrsprachige Outputs** (NL/EN) — V8.1+
- **Editierbarkeit Bericht-Inhalt** (EditableText fuer Stufen-Lookup-Texte) — V8.1+
- **Verlaufsbeobachtung** (zweiter SUI mit Diff-Ansicht) — V8.2+
- **LLM-Augmentation** der Stufen-Texte — V8.1+ (DEC-159 deterministisch in V8.0)
- **CTA-Page-Conversion-Tracking** (StB-Click-through-Telemetrie) — V8.1+

## Pre-Conditions

- ✓ SLC-150 done (Renderer-Foundation + Wheel + 3 Phase-A-Pages LIVE)
- ✓ SLC-150 MT-1 Spike-Decision dokumentiert (Plan A continue ODER Pivot zu Plan B akzeptiert) — bei Pivot werden Modul-Pages auch via Plan-B-Engine gerendert
- ✓ SLC-148 done (`V8ReportSnapshot.hebel/hausaufgaben/reflexionen` Felder LIVE, `template.metadata.stufen_lookup` JSONB LIVE)
- ✓ MANDANTEN_REPORT_PROTOTYP.html Pages 4-17 als Vorlagen-Master verfuegbar
- ✓ Worktree `v8-mandanten-report` HEAD nach SLC-150 Records-Commit

## Micro-Tasks

### MT-1: `<ModulPage>` Sub-Component + Layout-Foundation
- **Goal**: Reusable Modul-Page-Layout mit Wheel-Focus links + 3-Sektionen-Text rechts. 1× implementieren, 9× verwenden.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/components/modul-page.tsx` (NEU) — `<ModulPage>` Component
  - `src/lib/pdf/mandanten-report-v2/components/__tests__/modul-page-resolvers.test.ts` (NEU) — Vitest fuer Pure-Logic-Helpers
  - `src/lib/pdf/mandanten-report-v2/components/modul-page-resolvers.ts` (NEU) — Pure-Function `resolveStufenInfo(modulKey, stufe, stufenLookup): StufenInfo` + Defensive-Fallback
- **Expected Behavior**:
  - Props: `{ modulKey: ModulKey, modulName: string, modulScore: number, modulStufe: number, wheelMixin: ModuleScores, stufenInfo: StufenInfo, worumEsGeht: string }`
  - A4-Page-Layout: Linke Spalte (~40% Breite) = Wheel mit `focusIdx` aus `modulKey` (m1=0, m2=1, ..., m9=8). Rechte Spalte (~60% Breite) = 3 Sektionen vertikal.
  - Wheel-Variante: `<Wheel moduleScores={wheelMixin} focusIdx={modulIdxFromKey(modulKey)} />` — alle 9 Module visible, nur das aktuelle vollfarbig, andere mit Alpha 0.3 (DEC-162)
  - Modul-Score-Anzeige: `Modul {N} • {modulScore}/10` als Sub-Title unter Modul-Name
  - 3 Text-Sektionen (Fraunces Regular, ~12pt, Line-Height 1.5):
    1. **"Worum es geht"** — `worumEsGeht` (kommt aus `template.metadata.worum_es_geht[modulKey]`)
    2. **"Was es in Ihrer Firma bedeutet"** — `stufenInfo.was_es_bedeutet` (resolveStufenInfo Output)
    3. **"Unsere Empfehlung"** — `stufenInfo.unsere_empfehlung` (resolveStufenInfo Output)
  - Pure-Logic: `resolveStufenInfo(modulKey, stufe, stufenLookup): StufenInfo` returns `{was_es_bedeutet, unsere_empfehlung}` oder wirft `Error("stufen_lookup missing for {modulKey}.{stufe}")` (Defensive-Check, im Renderer fail-fast besser als leere Sektion)
  - Page-Margins: konsistent zu Phase-A (40pt theme.spacing.page.margin)
- **Verification**:
  - Vitest: `resolveStufenInfo('m1', 3, mockLookup)` → `{was_es_bedeutet: 'mock', unsere_empfehlung: 'mock'}`
  - Vitest: `resolveStufenInfo('m99', 3, mockLookup)` → wirft Error (Defensive)
  - Vitest: `resolveStufenInfo('m1', 6, mockLookup)` → wirft Error (Stufe 6 existiert nicht in 5-Stufen-Lookup)
- **Dependencies**: SLC-150 MT-1 (Wheel-Component), SLC-150 MT-2 (Renderer-Foundation)

### MT-2: 9 Modul-Pages-Loop in Renderer-Foundation
- **Goal**: Renderer-Foundation um 9 `<ModulPage>`-Renders erweitern, Iteration ueber `{m1, ..., m9}`.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/renderer.tsx` (additiv aus SLC-150 MT-2) — 9× `<ModulPage>` zwischen Modul-Profil-Page und Hausaufgaben-Page eingefuegt
  - `src/lib/pdf/mandanten-report-v2/components/modul-page-resolvers.ts` (additiv) — Helper `getAllModulPagesProps(snapshot, template): ModulPageProps[]` mit 9 Eintraegen
- **Expected Behavior**:
  - `getAllModulPagesProps` iteriert `['m1', 'm2', ..., 'm9']`, extrahiert pro Modul:
    - `modulName` aus `template.blocks.find(b => b.modul_id === modulKey.toUpperCase())?.name`
    - `modulScore` aus `snapshot.moduleScores[modulKey]`
    - `modulStufe` aus `snapshot.stufenMapping[modulKey]`
    - `stufenInfo` aus `resolveStufenInfo(modulKey, stufe, template.metadata.stufen_lookup)`
    - `worumEsGeht` aus `template.metadata.worum_es_geht[modulKey]`
    - `wheelMixin` ist immer `snapshot.moduleScores` (selbe Daten, focusIdx unterscheidet)
  - Renderer-Foundation laesst `getAllModulPagesProps` aufrufen und rendert 9× `<ModulPage {...props} key={props.modulKey} />`
  - Reihenfolge strikt m1 → m9
- **Verification**:
  - Vitest: `getAllModulPagesProps(mockSnapshot, mockTemplate)` returns Array mit 9 Eintraegen, Reihenfolge m1..m9
  - Vitest: Wenn `template.blocks` einem Modul fehlt → Error mit klarer Message (Template-Drift-Schutz)
  - Smoke-PDF: 9 Modul-Pages rendern hintereinander (12 Seiten Phase-A + 9 = nach Page 12 sind alle 9 Module sichtbar)
- **Dependencies**: MT-1

### MT-3: Hausaufgaben-Page (Page 13) + Empty-State
- **Goal**: Modul-0-Findings (Hygiene-Status Nein/Teilweise) als strukturierte Seite gemaess Prototyp Page 13.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/pages/hausaufgaben.tsx` (NEU) — `<HausaufgabenPage>` Component
  - `src/lib/pdf/mandanten-report-v2/components/hausaufgaben-resolvers.ts` (NEU) — Helper `getHausaufgabenItemsWithErlaeuterung(hausaufgaben, template): HausaufgabeItemRendered[]`
  - `src/lib/pdf/mandanten-report-v2/components/__tests__/hausaufgaben-resolvers.test.ts` (NEU) — Vitest
- **Expected Behavior**:
  - A4-Seite mit Page-Titel: "Hausaufgaben — Hygiene-Fragen Modul 0" (Fraunces Bold, ~28pt)
  - Sub-Pitch: "Diese fuenf Fragen sind keine Schwaeche-Indikatoren, sondern Hygiene-Pflichten. Was hier offen ist, blockiert spaeter den Verkaufs-Prozess."
  - Liste der Hausaufgaben-Items aus `snapshot.hausaufgaben`:
    - Pro Item: Frage-Text (Fraunces Regular, ~14pt) + Status-Badge ("Nein" / "Teilweise") + "Was zu tun ist:"-Block mit Fix-Text aus `template.metadata.hausaufgaben_lookup[frage_id][status]` (DEC-161)
    - Status-Badge-Farben: Nein = rot-Akzent (theme.colors.classification.rot), Teilweise = amber-Akzent
  - Empty-State (wenn `snapshot.hausaufgaben.length === 0`): "Gratulation — alle Hygiene-Fragen sind erfuellt." mit Mini-Wheel-Decorator (gruen)
  - Pure-Function `getHausaufgabenItemsWithErlaeuterung` resolved `frage_id` + `status` zu Fix-Text aus `template.metadata.hausaufgaben_lookup` (DEC-161)
- **Verification**:
  - Vitest: 3 Hausaufgaben-Items + Mock-Lookup → 3 Items mit `was_zu_tun`-Text gefuellt
  - Vitest: 0 Hausaufgaben-Items → leeres Array (Empty-State im Renderer)
  - Vitest: Hausaufgabe mit unbekanntem `frage_id` → wirft Error (Defensive)
  - Smoke-PDF: Page 13 rendert korrekt (Founder-Visual-Check)
- **Dependencies**: MT-2

### MT-4: 3-Strategie-Hebel-Page (Page 14)
- **Goal**: Top-3 niedrigste Module mit Modul-Name + Score + Naechste-Schritte-Block gemaess Prototyp Page 14.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/pages/hebel.tsx` (NEU) — `<HebelPage>` Component
  - `src/lib/pdf/mandanten-report-v2/components/hebel-resolvers.ts` (NEU) — Helper `formatHebelBlock(hebelItem): HebelBlockRendered`
  - `src/lib/pdf/mandanten-report-v2/components/__tests__/hebel-resolvers.test.ts` (NEU) — Vitest
- **Expected Behavior**:
  - A4-Seite mit Page-Titel: "Drei strategische Hebel" (Fraunces Bold, ~28pt)
  - Sub-Pitch: "Diese drei Module sind heute Ihre groessten Hebel — hier zaehlt jeder Schritt am meisten."
  - 3 Hebel-Bloecke aus `snapshot.hebel` (bereits sortiert + selektiert in SLC-148 MT-4 `selectThreeHebel`):
    - Pro Block: Modul-Name + Score-Badge (z.B. "Modul 3 — Vertriebsfaehigkeit • 2/10")
    - Empfehlungs-Text aus `hebelItem.empfehlung` (kommt aus `stufen_lookup[modul][stufe].unsere_empfehlung` per DEC-160)
    - Visueller Separator zwischen Bloecken (z.B. dezentes Linien-Separator)
    - Reihenfolge: niedrigster Score zuerst (Hebel-Auswahl-Logik in SLC-148)
  - Pure-Function `formatHebelBlock(hebelItem)` formattiert Render-Daten (Score-Suffix, Modul-Name-Capitalization)
- **Verification**:
  - Vitest: `formatHebelBlock({modul_id: 'm3', modul_name: 'Vertriebsfaehigkeit', score: 2, stufe: 2, empfehlung: 'mock'})` → korrektes Render-Object
  - Smoke-PDF: Page 14 zeigt 3 Bloecke mit Modul-Namen + Scores + Empfehlungen
- **Dependencies**: MT-2 (Page-Layout-Pattern)

### MT-5: Reflexion-Page (Page 15) + Empty-State
- **Goal**: Modul-10-Antworten als Quotation-Block-Layout gemaess Prototyp Page 15.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/pages/reflexion.tsx` (NEU) — `<ReflexionPage>` Component
- **Expected Behavior**:
  - A4-Seite mit Page-Titel: "Ihre Reflexion" (Fraunces Bold, ~28pt)
  - Sub-Pitch: "Was Sie selbst sagen, ist genauso wichtig wie was die Zahlen zeigen."
  - Liste der Reflexion-Items aus `snapshot.reflexionen`:
    - Pro Item: Frage-Text (klein, Fraunces Regular Italic, ~11pt) ueber Antwort-Text
    - Antwort-Text als Quotation-Block (Fraunces Regular, ~14pt, mit Quote-Marks-Decoration + Indent)
    - Visueller Separator zwischen Items
  - Empty-State (wenn `snapshot.reflexionen.length === 0`): "Reflexion offen — diskutieren wir im Folgegespraech." als gross-formatierte Pitch-Karte
  - Keine Pure-Logic-Helpers noetig (reine Layout-Komponente, Daten kommen 1:1 aus Snapshot)
- **Verification**:
  - Smoke-PDF: Page 15 mit 3-5 Reflexion-Quotes rendert
  - Smoke-PDF Empty-State-Test: Fixture mit 0 Reflexionen → Empty-State-Render statt leerer Seite
- **Dependencies**: MT-2 (Page-Layout-Pattern)

### MT-6: CTA-Folgegespraech-Page (Pages 16-17)
- **Goal**: 2-Seiten-CTA-Block mit Hero-Pitch + StB-Kontakt-Slot + Strategaize-Footer gemaess Prototyp Pages 16-17.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/pages/cta.tsx` (NEU) — `<CtaPage>` Component (rendert 2 `<Page>`-Elemente intern)
- **Expected Behavior**:
  - **Page 16 (CTA-Hero)**:
    - Page-Titel: "Wie geht es jetzt weiter?" (Fraunces Bold, ~36pt)
    - Pitch (Long-Form): "Diese Diagnose ist ein Anfang. Der naechste Schritt ist ein Folgegespraech, in dem wir konkret werden — welche drei Bewegungen in den naechsten 90 Tagen den groessten Unterschied machen."
    - Call-to-Action-Block: "Bereit fuer das Folgegespraech?" + StB-Kontakt-Info-Slot (wenn `input.stb` gesetzt)
    - Fallback wenn `input.stb` nicht gesetzt: Strategaize-Default-Kontakt
  - **Page 17 (Footer / Strategaize-Brand)**:
    - Strategaize-Brand-Block: "Powered by Strategaize" + Mini-Wheel-Decorator + URL-Slot
    - Datenschutz + Impressum-Verweis (Footer-Pflicht, [[feedback-pflicht-footer-server-side]])
    - Datum + Version: "Strategaize Uebergabefaehigkeits-Diagnose V8.0 • {input.mandant.datum}"
- **Verification**:
  - Smoke-PDF: Pages 16-17 rendern hintereinander
  - StB-Kontakt-Slot zeigt korrekt: mit `input.stb` Daten ODER Strategaize-Default
- **Dependencies**: MT-2 (Page-Layout-Pattern)

### MT-7: Tonalitaets-Audit-Skript + Records + /qa SLC-151
- **Goal**: Lint-Schutz fuer "Unsere Empfehlung"-Tonalitaet ueber 90+ Stufen-Lookup-Eintraege. Plus Records-Update + /qa fuer Code-Side + Vollstaendiger-Smoke gegen MANDANTEN_REPORT_PROTOTYP.html.
- **Files**:
  - `scripts/audit-v8-tonality.mjs` (NEU) — Skript, greppt `template.metadata.stufen_lookup` JSONB (via Supabase-Query gegen Coolify-DB) auf Blacklist-Phrasen
  - `docs/STATE.md` — Current-Focus auf SLC-151 done
  - `slices/INDEX.md` — SLC-151 status `done`
  - `planning/backlog.json` — BL-131 bleibt `in_progress` (SLC-152 noch offen)
  - `reports/RPT-XXX.md` (NEU) — Completion-Report + /qa-Report + Tonalitaets-Audit-Ergebnis
- **Expected Behavior** (Audit-Skript):
  - Liest `template.metadata.stufen_lookup` aus Coolify-DB (slug=exit-readiness-teaser-v1, version=1)
  - Iteriert alle 45 `unsere_empfehlung`-Texte + 45 `was_es_bedeutet`-Texte
  - Blacklist-Phrasen (case-insensitive): `['Ihr Steuerberater', 'wir empfehlen', 'der Berater', 'Wir sollten']` per [[feedback-mandanten-empfehlung-unsere-nicht-stb]]
  - Exit-Code 1 bei jedem Treffer, mit konkreter Trefferliste (modul + stufe + text-snippet)
  - Exit-Code 0 wenn alle 90 Texte clean
  - Audit-Output in Completion-Report
- **Expected Behavior** (/qa SLC-151):
  - tsc EXIT=0 Repo-weit
  - ESLint SLC-151-Scope EXIT=0
  - Vitest SLC-151-Scope alle PASS (modul-page-resolvers + hausaufgaben-resolvers + hebel-resolvers)
  - Smoke-PDF (`/tmp/v8-mandanten-report-full-smoke.pdf`) erzeugt mit 17 Seiten
  - Founder oeffnet Smoke-PDF + MANDANTEN_REPORT_PROTOTYP.html side-by-side, validiert alle Pages 4-17
  - Founder-Visual-Verdict: substanzielle Vorlagen-Treue (NICHT pixel-perfect, AC-11 von FEAT-066)
  - Tonalitaets-Audit-Skript Exit-Code 0
- **Verification**:
  - /qa-Report PASS code-side + Visual-Verdict
  - Tonalitaets-Audit Exit-Code 0 ODER Trefferliste in MIG-047-Re-Apply-Backlog (Founder muss LEVELS_MANDANT.md fixen + Migration 102 Re-Apply)
  - Co-Existenz: V6.3 V7.2 Renderer `src/lib/pdf/diagnose-report.tsx` unveraendert (Git-Diff)
- **Dependencies**: MT-6

## Acceptance Criteria (Phase B — aus FEAT-066 AC-5..10 + SLC-151-spezifisch)

- **AC-5 9 Modul-Pages gerendert** (FEAT-066 AC-5): Jede Page hat fokussiertes Wheel-Segment + 3-Sektionen-Text korrekt aus `stufen_lookup` basierend auf Modul-Stufe.
- **AC-6 Hausaufgaben-Page funktional** (FEAT-066 AC-6): Alle Hygiene-Findings mit Status Nein/Teilweise gerendert. Empty-State zeigt Gratulation-Page bei 0 Findings.
- **AC-7 3-Strategie-Hebel-Page funktional** (FEAT-066 AC-7): Drei Hebel-Bloecke mit Modul-Name + Score + Empfehlungs-Text gerendert.
- **AC-8 Reflexion-Page funktional** (FEAT-066 AC-8): Modul-10-Antworten als Zitate. Bei leeren Reflexionen: alternative Pitch-Page.
- **AC-9 CTA-Folgegespraech-Page funktional** (FEAT-066 AC-9): StB-Kontakt-Info-Slot gerendert (aus `input.stb` Daten), Strategaize-Footer Pflicht.
- **AC-10 Tonalitaets-Audit PASS** (FEAT-066 AC-10): 0 Vorkommnisse von "Ihr Steuerberater" / "der Berater" / "wir empfehlen" / "Wir sollten" in `stufen_lookup`-Texten. `scripts/audit-v8-tonality.mjs` Exit-Code 0.
- **AC-SLC-151-1 `<ModulPage>` reusable**: 1× implementiert, 9× verwendet. Vitest deckt `resolveStufenInfo` Defensive-Cases ab.
- **AC-SLC-151-2 17 Seiten gerendert**: `scripts/spike-v8-wheel-demo.mjs` (oder `render-v8-fixture.mjs`) erzeugt PDF mit exakt 17 Seiten (`pdftk dump_data` oder `pdfinfo` Verifikation).
- **AC-SLC-151-3 Founder-Visual-Verdict Pages 4-17**: Side-by-Side gegen MANDANTEN_REPORT_PROTOTYP.html, substanzielle Treue, Verdict-Note im Completion-Report.
- **AC-SLC-151-4 Empty-States gerendert**: Hausaufgaben + Reflexion Empty-Cases ergeben alternative Pitch-Pages, nicht leere Seiten.
- **AC-SLC-151-5 Quality-Gates**: tsc EXIT=0, ESLint EXIT=0, Vitest SLC-151-Scope PASS.
- **AC-SLC-151-6 V6.3-Renderer-Co-Existenz**: `src/lib/pdf/diagnose-report.tsx` Git-Diff = 0.

## Wiring-Verification-Liste

- ✓ `template.metadata.stufen_lookup[modul][stufe]` (SLC-148 MT-2 Migration 102) → `resolveStufenInfo` → `<ModulPage>` 3-Sektionen-Text
- ✓ `template.metadata.worum_es_geht[modul]` → `<ModulPage>` Sektion 1
- ✓ `snapshot.stufenMapping[modul]` (SLC-148 MT-4 `mapAllModuleScoresToStufen`) → `<ModulPage>` Stufe-Resolution
- ✓ `snapshot.hausaufgaben` (SLC-148 MT-4 `aggregateHausaufgaben`) → `<HausaufgabenPage>`
- ✓ `template.metadata.hausaufgaben_lookup[fragenId][status]` (SLC-148 MT-2 Migration 102) → "Was zu tun ist"-Text in HausaufgabenPage
- ✓ `snapshot.hebel` (SLC-148 MT-4 `selectThreeHebel`) → `<HebelPage>` 3 Bloecke
- ✓ `snapshot.reflexionen` (SLC-148 MT-4 `aggregateReflexion`) → `<ReflexionPage>` Quotes
- ✓ `input.stb` (RendererInput aus SLC-150 MT-2) → `<CtaPage>` StB-Kontakt-Slot
- ✓ `<Wheel focusIdx>` (SLC-150 MT-1) → `<ModulPage>` Wheel-Variante mit 1 Modul fokussiert
- ✓ V6.3 V7.2 Renderer UNVERAENDERT (Co-Existenz)

## Risks / Notable Concerns

- **R-1 Stufen-Lookup-Inkonsistenz**: `template.metadata.stufen_lookup` Migration 102 hat alle 45 Eintraege geseeded — wenn ein Modul/Stufe-Tupel fehlt → `resolveStufenInfo` wirft Error → PDF-Render schlaegt fehl.
  - **Mitigation**: SLC-148 MT-2 Vitest deckt Vollstaendigkeit ab (45 Eintraege). Bei Drift: MIG-047 Re-Apply mit fehlenden Eintraegen.
- **R-2 Tonalitaets-Drift in 90+ Texten**: Founder hat in SLC-148 Pre-MT-1 die LEVELS_MANDANT.md geschrieben — subtile StB-Tonalitaet-Reste moeglich.
  - **Mitigation**: MT-7 Audit-Skript haert die Tonalitaet aus. Bei Trefferliste: Founder-Re-Edit + Migration 102 Re-Apply (kein Code-Slice noetig).
- **R-3 Modul-Name-Drift aus `template.blocks`**: `<ModulPage>` braucht Modul-Name aus `template.blocks.find(b => b.modul_id === ...)?.name` — wenn template-block.modul_id Format-Drift hat ("M1" vs "m1" vs "modul_1") → Lookup-Fail.
  - **Mitigation**: SLC-148 MT-2 hat block.modul_id als Uppercase "M1".."M10" definiert. `getAllModulPagesProps` normalisiert via `modulKey.toUpperCase()`. Defensive: wirft Error bei Mismatch.
- **R-4 Empty-States selten getriggert in Founder-Test**: Founder-Test-Mandant hat typischerweise alle 47 Fragen ausgefuellt → Empty-States (0 Hausaufgaben / 0 Reflexionen) selten erreicht.
  - **Mitigation**: MT-3 + MT-5 Vitest haben Empty-State-Cases. Smoke-PDF mit Empty-Fixture als 2. Renderer-Run in MT-7.
- **R-5 PDF-Page-Count-Drift bei Empty-States**: Wenn Empty-State eine kuerzere Seite erzeugt → moeglicherweise 16 statt 17 Seiten Output.
  - **Mitigation**: AC-SLC-151-2 prueft `pdfinfo` auf exakt 17 Seiten. Empty-States sind eigene Seiten-Renders, nicht skipped.
- **R-6 Smoke-PDF-Founder-Inspect-Aufwand**: 17 Seiten manuell gegen 17 Seiten HTML-Prototyp side-by-side ist viel Klick-Arbeit.
  - **Mitigation**: MT-7 strukturierter Visual-Verdict-Workflow: Founder geht Page-by-Page durch, dokumentiert pro Page "PASS" / "POLISH-CANDIDATE" / "FAIL". POLISH-CANDIDATE-Liste in V8.1-BL.

## Verification Strategy

- **Pure-Logic-Vitest** fuer `resolveStufenInfo` + `getAllModulPagesProps` + `getHausaufgabenItemsWithErlaeuterung` + `formatHebelBlock` (jsdom-frei, [[feedback-pure-helper-extraction-for-jsdom-free-tests]])
- **Smoke-PDF-Render** mit vollstaendiger Fixture (alle 47 Antworten gefuellt) erzeugt 17 Seiten — `pdfinfo` Page-Count-Check
- **Empty-State-Smoke** mit Edge-Case-Fixture (0 Hausaufgaben + 0 Reflexionen) → alternative Pages rendern
- **Founder-Visual-Verdict** Page-by-Page gegen MANDANTEN_REPORT_PROTOTYP.html (substanziell, NICHT pixel-perfect)
- **Tonalitaets-Audit-Skript** als Lint-Gate vor Master-Merge (in SLC-152)
- **V6.3-Co-Existenz** via Git-Diff von V7.2-Renderer-File

## Dependencies / Pre-Conditions Tabelle

| Pre-Condition | Status | Aktion |
|---|---|---|
| SLC-150 done (Phase-A Foundation + Wheel + 3 Pages) | pending | /frontend SLC-150 vor /frontend SLC-151 |
| SLC-150 Spike-Decision dokumentiert | pending | MT-1 von SLC-150 |
| SLC-148 done (Snapshot-Format + stufen_lookup LIVE) | ✓ done | RPT-358 |
| MANDANTEN_REPORT_PROTOTYP.html Pages 4-17 | ✓ done | Dev-System |
| Worktree `v8-mandanten-report` aktiv | ✓ done | HEAD nach SLC-150 |

## Cross-References

- **Architektur**: `docs/ARCHITECTURE.md` V8-Addendum (Implementation Direction SLC-151)
- **Feature**: `features/FEAT-066-mandanten-report-renderer-v2.md` Phase B
- **Decisions**: DEC-159..161 (deterministische Score-Logik), DEC-162 (Wheel via @react-pdf <Svg>), DEC-163 (Snapshot-Persistenz), DEC-164 (Stufen-Lookup in template.metadata)
- **Reuse-Patterns**:
  - SLC-150 Phase-A `<Wheel>`-Component (focusIdx-Variante fuer Modul-Pages)
  - SLC-150 Phase-A Renderer-Foundation + Theme-Tokens + Fonts
  - SLC-148 MT-4 SUI-Engine Output-Struktur (`V8ReportSnapshot.hebel/hausaufgaben/reflexionen/stufenMapping`)
  - SLC-148 MT-2 Migration 102 `template.metadata.stufen_lookup/worum_es_geht/hausaufgaben_lookup`
- **Memory**:
  - [[feedback-cumulative-single-branch-pattern]] — Branch-Strategie
  - [[feedback-mandanten-empfehlung-unsere-nicht-stb]] — Tonalitaet
  - [[feedback-design-premium-look-pflicht]] — Premium-Look Pflicht
  - [[feedback-slice-phase-a-b-split-for-large-slices]] — Phase-Split-Pattern
  - [[feedback-pure-helper-extraction-for-jsdom-free-tests]] — Pure-Logic-Pattern jsdom-frei
- **Quelle (Dev-System, Founder-freigegeben 2026-05-28)**:
  - `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html` (Pages 4-17 als Visual-Master)
