# SLC-V9.7-A — OKF Concept-Emitter

- Feature: FEAT-083 (BL-162)
- Version: V9.7
- Status: planned
- Created: 2026-06-15
- Worktree: `v9-7-okf-export` (Cumulative-Single-Branch, EIN Master-Merge in SLC-V9.7-B)
- Basis: ARCHITECTURE.md §"V9.7 Architecture Addendum" (DEC-220..225), /architecture RPT-471

## Ziel
Isoliertes, deterministisches Emitter-Modul, das jede kuratierte Wissens-Row (`knowledge_unit` / `block_diagnosis` / `sop`) als **strukturiertes OKF-Concept-Objekt** nach Strategaize-OKF-Profil 1.0 erzeugt und als `{path, content}` (Frontmatter-YAML + Body) serialisiert. **Reine Pure-Functions — kein Worker-Touch, keine DB-Last, keine Migration.** Cross-Link-Rendering passiert erst in SLC-V9.7-B (Bundle hat den vollen Concept-Graph).

## In Scope
- `src/lib/handbook/okf/types.ts`, `src/lib/handbook/okf/emit.ts` + Unit-Tests.
- Per-Concept-Mapping inkl. Frontmatter, Body-Render, `type`-/`confidence`-Mapper, deterministische Pfade.
- `serializeConcept(concept) → {path, content}` (Frontmatter via `yaml`).

## Out of Scope
- Bundle-Assembly, `index.md`/`log.md`, Cross-Link-Rendering, Konformitaets-Check, Worker-Wiring, ZIP (alles SLC-V9.7-B).
- `email_synthesized_unit`, `tags`/`themes` (V9.8/BL-505), `# Citations`-Body (DEC-223), DB-Aenderung.

## Daten-Grounding (Coolify-DB 2026-06-15)
- `knowledge_unit`: `confidence` text-Enum **low/medium/high** (DEC-224, 1:1, KEIN numeric-Mapping); `unit_type` ∈ finding/risk/action/observation/**ai_draft**; `status` ∈ proposed/accepted/edited; `evidence_refs` jsonb (PII-UUIDs → nur Count, DEC-223); `created_at`/`updated_at`; **keine `themes`-Spalte**.
- `block_diagnosis`: `content` = `{block_key, subtopics:[{key,name,fields:{k:v}}]}`; `status` draft/reviewed/confirmed; `updated_at`.
- `sop`: `content` = `{title?, objective?, steps?[]}` (Step 2 Formate, siehe `workers/handbook/types.ts`); `updated_at`; kein status/confidence.

## Reuse (Pflicht-Search erfuellt)
- **Slugify:** bestehenden Helper `src/lib/handbook/slugify.ts` wiederverwenden (NICHT neu schreiben — `src/lib/handbook/__tests__/slugify.test.ts` belegt Existenz). Vor MT-1 mit Read bestaetigen.
- **yaml:** `yaml@^2.9.0` (bereits Dependency) fuer Frontmatter-Serialisierung — KEINE neue Dep.

## Micro-Tasks

#### MT-0: Worktree-Setup
- Goal: Isolierter Cumulative-Single-Branch-Worktree fuer V9.7.
- Files: — (git/infra)
- Expected behavior: `git worktree add c:/strategaize/strategaize-onboarding-plattform-v97 -b v9-7-okf-export` aus main HEAD; **echtes `npm install`** im Worktree (IMP-1112, keine Junction-Tricks).
- Verification: `npm run test` Baseline laeuft (grueun/erwartete pre-existing), `tsc --noEmit` EXIT=0.
- Dependencies: none

#### MT-1: OKF-Typen + Frontmatter-Serializer + Mapper-Helper
- Goal: Typ-Vertrag + Pure-Helper (Frontmatter→YAML, type-/confidence-Mapper, Pfad-Bildung).
- Files: `src/lib/handbook/okf/types.ts` (neu), `src/lib/handbook/okf/emit.ts` (neu, Helper-Teil), `src/lib/handbook/okf/__tests__/emit.test.ts` (neu, TDD-RED zuerst)
- Expected behavior: `OkfConcept` = `{ type, frontmatter: OkfFrontmatter, body: string, blockKey: string, sourceTable: 'knowledge_unit'|'block_diagnosis'|'sop', sectionKey: string, path: string }`. Helper: `mapUnitTypeToOkf(unit_type)` (finding/risk/action/observation 1:1; **`ai_draft`→`observation`** + Log-Hinweis; unbekannt→Fehler), `mapConfidence(text)` (Passthrough low/medium/high, sonst Fehler — **kein numeric-Mapping**, DEC-224), `serializeFrontmatter(obj)` via `yaml` (deterministische Key-Reihenfolge), `conceptFilename(type, title, id)` = `<type>-<slug(title)>-<id.slice(0,8)>.md` (slugify aus `src/lib/handbook/slugify.ts`), `serializeConcept(concept) → {path, content}` (`---\n<yaml>---\n\n<body>\n`).
- Verification: `emit.test.ts` GREEN — Frontmatter parsebar (round-trip via `yaml.parse`), ai_draft→observation, confidence-Passthrough + Reject, deterministische Pfade/Slugs. `tsc`/ESLint EXIT=0.
- Dependencies: MT-0

#### MT-2: emitKnowledgeUnitConcept
- Goal: `knowledge_unit`-Row → `OkfConcept`.
- Files: `src/lib/handbook/okf/emit.ts`, `src/lib/handbook/okf/__tests__/emit.test.ts`
- Expected behavior: `emitKnowledgeUnitConcept(row, ctx)` → Frontmatter: `type`=mapUnitTypeToOkf, `title`=row.title, `description`=erster Satz von body, `timestamp`=row.updated_at (ISO 8601), `strategaize_source: "op"`, `strategaize_tenant`=ctx.tenantId, `confidence`=mapConfidence(row.confidence), `curation_status`=row.status (proposed/accepted/edited 1:1), `evidence_count`=`row.evidence_refs.length`, `strategaize_id`=row.id. **KEIN `tags`** (DEC-224). **KEIN `# Citations`-Body, evidence_refs-Inhalt NIE im Output** (DEC-223, DSGVO). Body = row.body. sectionKey/blockKey = row.block_key.
- Verification: Tests — vollstaendiges Frontmatter; `ai_draft`-Fixture→observation; **DSGVO-Test: `recorded_by_user_id`/`walkthrough_session_id` erscheinen NICHT im content, aber `evidence_count` korrekt**; kein `tags`-Key; conformance-Minimum (parsebar + non-empty type) erfuellt.
- Dependencies: MT-1

#### MT-3: emitDiagnosisConcept
- Goal: `block_diagnosis`-Row → ein `OkfConcept` (`type: diagnosis`, 1/Row, DEC-222).
- Files: `src/lib/handbook/okf/emit.ts`, `src/lib/handbook/okf/__tests__/emit.test.ts`
- Expected behavior: `emitDiagnosisConcept(row, ctx)` → `type: "diagnosis"`, `title`=`Diagnose: <block_key>` (oder content-abgeleitet), `timestamp`=updated_at, `strategaize_source/tenant/id`, `curation_status: "accepted"` (nur confirmed werden vom Worker uebergeben), **kein confidence** (Spalte fehlt). Body: subtopics als `## <name>`-Subsections, `fields` als `- **<key>:** <value>`-Listen. blockKey=row.block_key.
- Verification: Tests mit subtopics-Fixture (aus Live-Sample A: a1_zielgruppe/a2_value_proposition/a3_pricing) — alle Subtopics + Felder im Body, 1 Concept, parsebares Frontmatter.
- Dependencies: MT-1

#### MT-4: emitSopConcept
- Goal: `sop`-Row → `OkfConcept` (`type: sop`).
- Files: `src/lib/handbook/okf/emit.ts`, `src/lib/handbook/okf/__tests__/emit.test.ts`
- Expected behavior: `emitSopConcept(row, ctx)` → `type: "sop"`, `title`=content.title ?? `SOP: <block_key>`, `description`=content.objective, `timestamp`=updated_at, `strategaize_source/tenant/id`, kein confidence/curation_status. Body: objective + steps (beide Step-Formate aus `workers/handbook/types.ts` — `action` vor `title`, mit responsible/timeframe/success_criterion wo vorhanden).
- Verification: Tests fuer Generator- + Legacy-Step-Format; parsebares Frontmatter; Steps in Reihenfolge.
- Dependencies: MT-1

#### MT-5: Slice-/qa SLC-V9.7-A (Code-Side)
- Goal: Slice-Verifikation Emitter.
- Files: — (Test-Run + Report)
- Expected behavior: `npm run test` (okf-Scope) GREEN, `tsc --noEmit` EXIT=0, ESLint 0 (okf-Diff), Stub-Scan 0. AC-A-1..A-6 (siehe unten).
- Verification: /qa-PASS Code-Side; Report RPT.
- Dependencies: MT-2, MT-3, MT-4

## Acceptance Criteria
- AC-A-1: emit produziert pro Quell-Row genau ein `OkfConcept` mit parsebarem Frontmatter + nicht-leerem `type` (SC-V9.7-1).
- AC-A-2: `type` ∈ {finding,risk,action,observation,diagnosis,sop}; `ai_draft`→observation (SC-V9.7-2, DEC-224).
- AC-A-3: Pflicht-Extension `strategaize_source: op` + `strategaize_tenant` je Concept; `confidence`/`curation_status` wo Quelle; **kein numeric-confidence-Mapping** (SC-V9.7-3, DEC-224).
- AC-A-4 (DSGVO): `evidence_refs`-Rohwerte (insb. `recorded_by_user_id`) erscheinen NIE im Output; nur `evidence_count` (SC-V9.7-9, DEC-223).
- AC-A-5: deterministische Pfade `<section>/<type>-<slug>-<id8>.md`; `serializeConcept` rundreisefest (yaml.parse).
- AC-A-6: Quality-Gates tsc=0 / ESLint=0 / okf-Tests GREEN; Emitter hat 0 Worker-/DB-Imports (Isolation, SC-V9.7-7).

## Risiken
- R-A-1: `description`-Ableitung (erster Satz) bei leerem/mehrsprachigem body → Fallback auf title. Test abdecken.
- R-A-2: slugify-Reuse — Pfad/Signatur des bestehenden Helpers vor MT-1 mit Read bestaetigen (sonst Drift).
