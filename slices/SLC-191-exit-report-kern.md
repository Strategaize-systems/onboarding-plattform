# SLC-191 — Exit-/Devil's-Advocate-Report Kern (FEAT-108)

- Feature: FEAT-108 (BL-515)
- Version: V10.5
- Status: code-done (alle 6 MTs; 33/33 Tests, tsc0/eslint0, build PASS — Route-Live-Smoke pending Gesamt-QA/Deploy, RPT-626)
- Priority: High
- Delivery-Mode: SaaS → TDD-Pflicht (owner-dependence + framing = Business-Logik)
- Branch/Worktree: `v10-5-exit-report` (Worktree `<repo>.worktrees/v10-5`, SaaS-Pflicht)
- Migration: **keine** (DEC-273: render-time, 0 Migration)

## Ziel
Der deterministische Käufer-/Devil's-Advocate-Report als PDF: Übergabe-Ampel-Scorecard pro Dimension (Diagnose-Block, DEC-275) + prominenter Owner-Dependence-Index (DEC-273) + pro Finding 3-Spalten-Käufer-Framing (Käufer-Sicht / Buy-Side-DD / Abmilderung), gebaut als Spiegel des Fahrplan-Report-V9.75-Moduls (DEC-272). 0 LLM.

## Step-0-Reconciliation (Architektur-Fragen → Entscheid)
- **Q-V10.5-G** (Aggregat-Index-Gewichtung + Block-Ampel-Regel): entschieden in dieser Spec (s. MT-2/MT-3), exakte Zahlen TDD.
- **Q-V10.5-H** (diagnosis_schema.question_keys live befüllt?) → **MT-0-Spike**.
- **Q-V10.5-I** (Client-Pfad Route): **ENTSCHIEDEN — `createAdminClient` + manueller Tenant-Scope-Check**, spiegelt die reale Fahrplan-Route (`fahrplan-report/route.ts:40-53`); **supersedet** die W.6-„User-Client+RLS"-Präferenz (Arch-Text als verfeinert markiert; kein neuer DEC — schließt das W.6-`UNVERIFIED`).
- **Q-V10.5-J** (Test-capture_session mit Diagnose-Daten vorhanden?) → **MT-0-Spike**.
- **Reuse-inherited (kein DEC):** Tier-READ-Gate blueprint+ via `fn_tier_rank` wird aus der Fahrplan-Route mitübernommen (Report ist ein Blueprint-Deliverable).

## Verified-Against-Code-Reality
- `src/lib/pdf/exit-report/` — **existiert NICHT** (`ls` bestätigt) → alle Modul-Files **NEU**, keine Kollision.
- `src/app/admin/debrief/[sessionId]/exit-report/` — **existiert NICHT** → Route **NEU**. Parent `src/app/admin/debrief/[sessionId]/fahrplan-report/route.ts` existiert (Reuse-Vorlage).
- Reuse-Quellen real geöffnet: `fahrplan-report/{data.ts,framing.ts,types.ts,renderer.tsx,route.ts→…/fahrplan-report/route.ts,index.ts}` (verifiziert), `getTemplateById` (`src/lib/db/template-queries.ts:73-86`), `computeModulReifeAmpel`/DEC-253/C (`src/lib/stb-vertikale/module-delivery/reife-ampel.ts:44-56`), Theme/Fonts (`src/lib/pdf/mandanten-report-v2/{fonts,theme}`).

## Schema-Grounding (gegen sql/migrations/*, verbatim)
- `capture_session` (MIG-021:27-37): `template_id uuid NOT NULL REFERENCES template`, `template_version text`, `tier`, `tenant_id`; `answers jsonb` (MIG-030, Key `"${blockKey}.${questionId}"`→String).
- `template` (MIG-021, MIG-051): `blocks jsonb` = **Array** (`blocks[].questions[]` mit `id`(uuid), `frage_id`(z.B. `F-BP-003`), `owner_dependency:boolean` + 4 Flags — Schema `template-queries.ts:6-18`); `blocks[].key` = Block-Letter `A`..`I`. `diagnosis_schema jsonb`, MIG-051 für Exit-Readiness geseedet.
- **⚠️ KORREKTUR aus MT-0-Live-Spike (RPT-625):** `diagnosis_schema.blocks` ist **ein OBJEKT keyed by Block-Letter** (`{"A":{"subtopics":[…]}, "B":{…}, …}`), **NICHT ein Array** — die frühere `blocks[]`-Schreibweise war falsch. Iteration: `Object.entries(diagnosis_schema.blocks)`, NICHT `.map()`. Live-verifizierte Form: `diagnosis_schema.blocks[BLOCK_KEY].subtopics[] = {key, name, question_keys:[frage_id,…]}` (+ top-level `diagnosis_schema.fields`). tsc fängt das NICHT (jsonb→any).
- `block_diagnosis` (MIG-050): `content jsonb` = {block_key, block_title, subtopics[{key,name,fields}]}; fields: ist_situation/ampel(green|yellow|red)/reifegrad/risiko/hebel/relevanz_90d/empfehlung/belege/**owner(leer im KI-Output)**/aufwand/naechster_schritt/abhaengigkeiten/zielbild. RLS: admin_full + tenant_read.
- `block_checkpoint.quality_report jsonb` = OrchestratorOutput {overall_score, coverage{covered_subtopics,missing_subtopics,coverage_ratio}, gap_questions[{question_text,context,subtopic,priority}], recommendation}.
- `fn_tier_rank(p_tier)` RPC (Fahrplan-Route:56) — blueprint=Rang 1.

## Symbol-Verifikation
- Reuse: `loadFahrplanInput` (data.ts:240), `buildFahrplanInput` (data.ts:120), `exitCoupling`/`prioritize`/`ownerOrFallback`/`scopeEstimate`/`SCOPE_SENTENCE` (framing.ts, alle exportiert), `renderFahrplanReportPdf` (renderer.tsx:328)/`renderToBuffer` (import renderer.tsx:15), `getTemplateById` (template-queries.ts:73), `createClient`/`createAdminClient` (`@/lib/supabase/{server,admin}`). Barrel-Muster: `fahrplan-report/index.ts` exportiert types + build/load + render.
- **QA-Nuance (Plan-QA RPT-625):** `parseBlock` (data.ts:49) und `parseQualityReport` (data.ts:85) sind **intern/nicht exportiert** → NUR transitiv via `loadFahrplanInput` nutzbar bzw. das Muster nachbauen (so bereits in SLC-192 MT-2 „parseQualityReport-Muster"). **KEIN Direktimport** — sonst Build-Fehler.
- Neu (in dieser Spec definiert, konsistent über alle MTs): `loadExitReportInput`, `buildExitReportInput`, `computeOwnerDependenceIndex`, `buildBuyerFindings`, `renderExitReportPdf`.

## Test-Infra
- `vitest.config.ts`: `environment: "node"`, include `src/**/*.test.ts` → Tests in `src/lib/pdf/exit-report/*.test.ts` werden collected. **Kein jsdom** — owner-dependence + framing sind Pure-Functions (Pure-Mock-Vitest). Renderer-Smoke via `renderToBuffer(...)`→non-empty Buffer läuft in node-env (Beleg: `fahrplan-report/renderer.test.ts` existiert + grün). Route-E2E (Auth/Tier/PDF-Response) = Browser-/Live-Smoke in /qa bzw. /deploy.

## Micro-Tasks

#### MT-0: Grounding-Spike (read-only, keine Writes)
- Goal: Q-V10.5-H + Q-V10.5-J gegen die reale Test-Session klären; Fallback-Pfad festlegen.
- Files: keine (read-only; ggf. SSH-`psql` gegen Coolify-DB nach `docs/playbooks/coolify-test-setup.md`, oder Query über bestehende Test-Session).
- Expected behavior: Feststellen (a) ist `template.diagnosis_schema.blocks[].subtopics[].question_keys[]` für das/die genutzte(n) Template(s) befüllt? (b) existiert ≥1 `capture_session` mit befüllten `block_diagnosis` + beantworteten `owner_dependency`-Fragen? Wenn (a) leer → Owner-Dependence-Index läuft auf **Block-Granularität** (owner_dep-Fragen pro Block, ohne Subtopic-Ampel-Verlinkung, DEC-273-Fallback). Wenn (b) fehlt → synthetische Design-Referenz-Session als Fixture (Design-Time, nicht Prod).
- Verification: schriftlicher Befund im Completion-Report; Fixture-Grundlage für MT-2/MT-3-Tests festgelegt.
- Dependencies: none. **Blockiert MT-2/MT-3-Finalisierung** (Formel-Fallback).
- **✅ ERLEDIGT 2026-07-09 (Live-Spike gegen Coolify-Prod-DB, read-only, RPT-625):**
  - **(a) diagnosis_schema befüllt = JA → Subtopic-Granularität ist der Primärpfad (DEC-273), KEIN Block-Fallback nötig.** 2 Templates tragen `diagnosis_schema`: **Exit-Readiness** (`374f572d-9b2b-4e55-af44-fb0a646f1736`, Primär, volle Blocks A–I mit subtopics + `question_keys` in `F-BP-xxx`) + Kanzlei-Blueprint. **ABER Struktur = Objekt keyed by Block-Letter** (s. Schema-Grounding-Korrektur oben) — Code MUSS `Object.entries(diagnosis_schema.blocks)`.
  - **Linkage-Kette live bestätigt:** owner_dep-Frage `q` (block_key `A`..`I`, `q.frage_id`=`F-BP-xxx`, `q.id`=uuid) → `diagnosis_schema.blocks[block_key].subtopics[]` wo `question_keys` `q.frage_id` enthält → block_diagnosis(session, block_key).content.subtopics[key].fields.ampel/risiko. **„Beantwortet" = `answers["${block_key}.${q.id}"]` existiert** (MIG-030-Key = Frage-`id`, NICHT frage_id). Exit-Readiness = **33 owner_dep-Flags** über A–I (B=11, F=5, A=4).
  - **(b) KEINE nutzbare reale Session → synthetische Design-Referenz-Fixture bauen.** Einzige Session mit `block_diagnosis` ist `c1c1c1c1-…-c1c1c1c1043a` (synthetischer Seed, tier=handbook, Template Exit-Readiness, 9 block_diagnosis-Rows) — **unbrauchbar als Fixture:** (i) nur 2 Marker-Answers (`_fixture`/`_business_case`, 0 echte owner_dep-Antworten), (ii) ihre block_diagnosis-subtopic-keys (`a1_zielgruppe`) sind **stale** vs. aktuelles diagnosis_schema (`a1_grundverstaendnis`). MT-2/MT-3-Tests bauen daher eine synthetische Fixture, die die **aktuelle** Schema-Form nachbaut (Design-Time, nicht Prod).

#### MT-1: Typen + Loader
- Goal: Report-Input laden (Diagnose + Coverage + Template + Answers) und typisieren.
- Files: `src/lib/pdf/exit-report/types.ts` (NEU), `src/lib/pdf/exit-report/data.ts` (NEU), `src/lib/pdf/exit-report/data.test.ts` (NEU).
- Expected behavior: `types.ts` definiert `ExitReportInput` (blocks + todos wie Fahrplan **+** `template`-Flags-Map + `answers` + Dimensionen). `data.ts`: `buildExitReportInput(...)` PURE (Fixture-testbar) baut auf `buildFahrplanInput` auf + reichert Template-`owner_dependency`-Flags (`flags[frage_id]`-Muster aus persist-ampel) + `answers` + diagnosis_schema-Brücke an. `loadExitReportInput(admin, sessionId)` = dünner Fetch: `loadFahrplanInput` (block_diagnosis+quality_report) + `capture_session.select("template_id,answers,tenant_id,tier")` + `getTemplateById(admin, template_id)`. Quell-Pfad-Header-Kommentar (P-Header-Pflicht).
- Verification: `data.test.ts` Fixture-Tests (owner_dep-Flag-Map korrekt, answers-Key-Match `"${blockKey}.${questionId}"`, defensiv nullable); `npm run test` grün.
- Dependencies: MT-0 (Fixture-Form).

#### MT-2: Owner-Dependence-Index (TDD-Kern, DEC-273)
- Goal: deterministischen Owner-Dependence-Index pro Dimension + Aggregat berechnen.
- Files: `src/lib/pdf/exit-report/owner-dependence.ts` (NEU), `src/lib/pdf/exit-report/owner-dependence.test.ts` (NEU).
- Expected behavior: PURE `computeOwnerDependenceIndex(input)`: pro Block (Dimension) die owner_dependency-geflaggten Fragen → beantwortet? (answers-Key `"${block_key}.${q.id}"`) → verlinkte Diagnose-Subtopics (via `diagnosis_schema.blocks[block_key].subtopics[]` wo `question_keys` `q.frage_id` enthält — **`Object.entries` über blocks, kein `.map()`; MT-0-Korrektur**) → deren ampel/risiko. Fallback Block-Ebene nur bei fehlendem diagnosis_schema (real: befüllt, s. MT-0). **Per-Dimension-Ampel (DEC-273/DEC-253-C-Shape):** red wenn verlinktes owner-dep-Subtopic ampel=red ODER risiko≥7; yellow bei ampel=yellow/risiko 4–6 ODER unbeantworteter owner-dep-Frage (Blind Spot); sonst green. **Aggregat (Q-V10.5-G-Entscheid):** Level Hoch/Mittel/Gering aus Anteil roter/gelber owner-dep-Dimensionen + Headline-Zahl (0–10, deterministisch; exakte Gewichtung im Test fixiert). Definierter Fallback bei 0 owner-dep-Flags/leerer diagnosis_schema.
- Verification: `owner-dependence.test.ts` — Fälle: alle-green, ein-red-Subtopic→Dimension red, unbeantwortete owner-dep-Frage→yellow (Blind Spot), leere diagnosis_schema→Block-Fallback, 0 Flags→definierter Default. `npm run test` grün.
- Dependencies: MT-1 (Typen/Loader), MT-0 (Fallback-Entscheid).

#### MT-3: Käufer-Framing (TDD)
- Goal: pro Finding die 3-Spalten-Käufer-Narrative deterministisch erzeugen.
- Files: `src/lib/pdf/exit-report/framing.ts` (NEU), `src/lib/pdf/exit-report/framing.test.ts` (NEU).
- Expected behavior: PURE `buildBuyerFindings(todos)`: reuse `prioritize()` (Import aus fahrplan-report/framing) + erweitert `exitCoupling`-Muster zu drei Feldern pro Finding — `kaeuferSicht` (was ein Käufer sieht), `ddAnsatz` (wo die Buy-Side-DD ansetzt), `abmilderung` (Schritt vor dem Verkauf). Deterministisch aus risiko/hebel/relevanz_90d/empfehlung/ampel; band-stabil (gleiche Eingabe→gleicher Text). Quell-Pfad-Header.
- Verification: `framing.test.ts` — Band-Stabilität, 3 Spalten befüllt, high-risiko→DD-Deal-Breaker-Sprache, leere Felder defensiv. `npm run test` grün.
- Dependencies: MT-1.

#### MT-4: Scorecard-Renderer + Barrel
- Goal: react-pdf-Scorecard rendern.
- Files: `src/lib/pdf/exit-report/renderer.tsx` (NEU), `src/lib/pdf/exit-report/index.ts` (NEU), `src/lib/pdf/exit-report/renderer.test.ts` (NEU).
- Expected behavior: `renderExitReportPdf(input): Promise<Buffer>` via `renderToBuffer`, reuse `../mandanten-report-v2/{fonts,theme}` (COLOR/SPACING/TYPOGRAPHY/PAGE) wie Fahrplan-Renderer. Layout (DEC-275): Owner-Dependence-Index-Hero-Seite + Scorecard (Zeile pro Dimension: Block-Ampel [aus Subtopic-Ampeln aggregiert — worst-case, Q-V10.5-G] + Owner-Dependence-Ampel) + Findings (3-Spalten, priorisiert) — Positionierung/Coverage kommen in SLC-192. `index.ts` Barrel exportiert Typen + `loadExitReportInput`/`buildExitReportInput` + `computeOwnerDependenceIndex` + `renderExitReportPdf`.
- Verification: `renderer.test.ts` — `renderToBuffer` liefert non-empty Buffer aus Fixture (Muster fahrplan renderer.test.ts). `npm run test` grün. Visuelle PDF-Prüfung in /qa.
- Dependencies: MT-2, MT-3.

#### MT-5: GET-Route
- Goal: Report per HTTP ausliefern, tenant-gescopt + tier-gated.
- Files: `src/app/admin/debrief/[sessionId]/exit-report/route.ts` (NEU).
- Expected behavior: **Spiegel der Fahrplan-Route** (`fahrplan-report/route.ts`): `createClient`→getUser+profiles(role,tenant_id); `createAdminClient`→capture_session(tenant_id,tier); Tenant-Scope (strategaize_admin cross-tenant ODER session.tenant_id===profile.tenant_id — **plus** berater-Zweig, V10.4-Konsistenz); Tier-Gate `fn_tier_rank`≥blueprint; dann `loadExitReportInput(admin,sessionId)`→`computeOwnerDependenceIndex`→`buildBuyerFindings`→`renderExitReportPdf`→`NextResponse` application/pdf `inline; filename="exit-report-${sessionId}.pdf"`, `Cache-Control: private, no-store`.
- **QA-Grounding (Plan-QA RPT-625):** Die Fahrplan-Route selbst hat **KEINEN** berater-Zweig (nur admin+same-tenant, route.ts:51) — der berater-Zweig ist eine bewusste Erweiterung. Kanonische V10.4-Quelle (SLC-190/DEC-270), die MT-5 spiegelt: `resolveWorkspaceScope()` (`src/lib/workspace/workspace-scope.ts:30`) liefert `{ role: "strategaize_admin"|"strategaize_berater", allowedTenantIds }` (berater = `string[]`, aus `berater_tenant_assignments`), + `scopeTenants()` (`src/lib/workspace/tenant-scope.ts:32`). **Rollen-Literal ist `strategaize_berater`** (nicht `"berater"`). Berater-Zugang nur, wenn `session.tenant_id ∈ allowedTenantIds`.
- Verification: build PASS; Auth/Tier/PDF-Response = Browser-/Live-Smoke in /qa (401 unauth, 403 fremd-tenant/free-tier, 200 pdf admin).
- Dependencies: MT-4.

## Cross-Slice-Dependencies
- **Blockiert:** SLC-192 (Positionierung) — konsumiert `renderExitReportPdf` (MODIFY in 192) + den in MT-1 geladenen `quality_report` (für coverage.ts). SLC-192 startet erst nach SLC-191-Merge.
- **Blockiert-von:** keine (V10.4 deployed; Bestandstabellen).
- **Produced/Consumed:** SLC-191 produziert `src/lib/pdf/exit-report/*` (Modul) + Route; SLC-192 konsumiert renderer.tsx (Einbettung) + Loader-Output.
- Geteilte Datei über beide Slices: `src/lib/pdf/exit-report/renderer.tsx` (191 NEU → 192 MODIFY) + `index.ts` (Barrel, evtl. 192 erweitert um positioning/coverage-Exports).

## Worktree / Pre-Merge-Re-Check
Worktree `<repo>.worktrees/v10-5` auf `v10-5-exit-report` (SaaS-Pflicht). Vor Merge: Rebase auf origin/main + `npm run test` (Single-Flight-Minimum; kein Parallel-Slice, keine MIG → MIG-Kollision n/a). Manual-Diff-Review.
