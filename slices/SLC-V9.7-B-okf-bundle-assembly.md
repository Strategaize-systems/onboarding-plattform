# SLC-V9.7-B — OKF Bundle-Assembly + Konformitaets-Check + Worker-Wiring

- Feature: FEAT-084 (BL-163)
- Version: V9.7
- Status: planned
- Created: 2026-06-15
- Worktree: `v9-7-okf-export` (selber Branch wie SLC-V9.7-A; EIN Master-Merge hier)
- Basis: ARCHITECTURE.md §"V9.7 Architecture Addendum" (DEC-220..225), /architecture RPT-471
- Dependency: **nach SLC-V9.7-A** (importiert `emit`/`serializeConcept`/`OkfConcept`)

## Ziel
Die von SLC-V9.7-A erzeugten `OkfConcept[]` zu einem OKF-v0.1-konformen Bundle assemblieren (root `index.md` + `log.md` + Section-Ordner + Cross-Links), programmatisch validieren (Konformitaets-Check, **TDD-RED zuerst**), additiv in den Snapshot-Worker verdrahten und **alongside** dem unveraenderten `handbuch/`-Ordner in EIN Download-ZIP packen. Dann Gesamt-/qa + Pre-Merge-Re-Check + Master-Merge.

## In Scope
- `src/lib/handbook/okf/bundle.ts` + `conformance.ts` + Tests.
- `src/workers/handbook/zip-builder.ts` (Multi-Folder, backward-compat) + bestehender Test.
- `src/workers/handbook/handle-snapshot-job.ts` (SELECT-Erweiterung + additiver OKF-Call + weiche Degradation) + `types.ts` (Row-Felder).
- Gesamt-/qa, Pre-Merge-Re-Check, Master-Merge.

## Out of Scope
- Per-Concept-Serializer (SLC-V9.7-A). Neuer Download-Endpoint (DEC-220: selber ZIP). `email_synthesized_unit`. DB-Migration. UI-Aenderung.

## Fixierte Architektur-Offenpunkte (aus /architecture §9)
- **OKF-Fehler-Degradation = WEICH (DEC-225 final):** OKF-Emit/Assemble/Conformance laeuft additiv NACH erfolgreichem `renderHandbook`. Bei OKF-Fehler/Konformitaets-Verstoss → `captureException`/error_log + ZIP **ohne** `okf/`-Ordner. Das narrative Handbuch (Kern-Deliverable) bricht NIE. Job-Status bleibt `ready`.
- **Cross-Link-Regel = block_key-Gruppierung:** Bundle-Assembly haengt je Concept eine `## Verwandte` Section an (bundle-root-absolute Links zu allen anderen Concepts mit gleichem `block_key`). Resolvable gegen die emittierten Pfade.
- **Test-Layout = `__tests__/`** (OP-Konvention, 212 vs 3; IMP-1262 erfuellt).

## Micro-Tasks

#### MT-1: Konformitaets-Check (TDD-RED zuerst)
- Goal: Programmatische OKF-v0.1-Bundle-Validierung (SC-V9.7-1..5).
- Files: `src/lib/handbook/okf/conformance.ts` (neu), `src/lib/handbook/okf/__tests__/conformance.test.ts` (neu — **RED zuerst** gegen handgebaute conformant/non-conformant Fixtures)
- Expected behavior: `checkOkfConformance(files: Record<string,string>) → {ok: boolean, violations: {file, rule, message}[]}`. Parst jede Nicht-Reserved-`.md` via `yaml` (Frontmatter zwischen `---`): SC-1 parsebar + non-empty `type`; SC-2 `type` ∈ registrierte Tabelle (finding/risk/action/observation/sop/diagnosis/handbook-section); SC-3 `strategaize_source` + `strategaize_tenant` vorhanden; SC-4 root `index.md` Frontmatter hat `okf_version` + `strategaize_okf_profile`; SC-5 `log.md` vorhanden + ≥1 Eintrag.
- Verification: `conformance.test.ts` GREEN — conformant-Fixture ok=true; je 1 gezielte Verletzung pro SC → ok=false + korrekter `rule`. tsc/ESLint=0.
- Dependencies: SLC-V9.7-A (Typen)

#### MT-2: Bundle-Assembly (index.md + log.md + Cross-Links)
- Goal: `OkfConcept[]` → `Record<path,content>` (validierbares Bundle).
- Files: `src/lib/handbook/okf/bundle.ts` (neu), `src/lib/handbook/okf/__tests__/bundle.test.ts` (neu)
- Expected behavior: `assembleOkfBundle(concepts: OkfConcept[], ctx: {tenantName, generatedAt, snapshotId}) → Record<string,string>`. (a) Cross-Link-Injektion: pro Concept `## Verwandte`-Section mit bundle-root-absoluten Links (`/<section>/<file>.md`) zu Concepts gleichen `block_key`; (b) `serializeConcept` (aus emit.ts) je Concept → Pfade `<section-key>/<file>.md`; (c) `index.md` mit Frontmatter `type: handbook-section`? **nein** — root index.md ist Reserved (kein `type`-Pflicht laut OKF); Frontmatter nur `okf_version: "0.1"` + `strategaize_okf_profile: "1.0"`; Body = Section-gruppierte OKF-Bullet-Form `* [Title](/<section>/<file>.md) - <description>`; (d) `log.md` = ein `## <ISO-Datum>` + `- Creation: Bundle aus Snapshot <id8>, <N> Concepts`.
- Verification: `bundle.test.ts` — index.md-Frontmatter (okf_version+profile), Section-Gruppierung, log.md-Eintrag, Cross-Links zeigen auf existierende Pfade im File-Set; danach `checkOkfConformance(assembled)` → ok=true (Integration MT-1↔MT-2). tsc/ESLint=0.
- Dependencies: MT-1

#### MT-3: zip-builder Multi-Folder (backward-compat)
- Goal: `handbuch/` + `okf/` in EIN ZIP (DEC-220), bestehende Single-Folder-Signatur unveraendert.
- Files: `src/workers/handbook/zip-builder.ts`, `src/workers/handbook/__tests__/zip-builder.test.ts` (BESTEHT — erweitern)
- Expected behavior: `ZipBuilderInput` akzeptiert optional `extraFolders?: {root: string, files: Record<string,string>}[]` zusaetzlich zum bestehenden `{files, rootFolder}`. Alle Sets in EIN Archiv; bestehender Aufruf (`{files}` → `handbuch/`) verhaelt sich byte-identisch.
- Verification: bestehende zip-builder-Tests GREEN (Regression) + neuer Test: `okf/`-Pfade + `handbuch/`-Pfade beide im Archiv, Reihenfolge/Inhalt stabil.
- Dependencies: none (parallel zu MT-1/2 moeglich, aber selber Branch sequentiell)

#### MT-4: Worker-Wiring (SELECT-Erweiterung + additiver OKF-Call + weiche Degradation)
- Goal: Snapshot-Worker erzeugt zusaetzlich das OKF-Bundle, Kern bleibt OKF-agnostisch.
- Files: `src/workers/handbook/handle-snapshot-job.ts`, `src/workers/handbook/types.ts`, `src/workers/handbook/__tests__/` (neuer Wiring-Test)
- Expected behavior: (a) `types.ts`: `KnowledgeUnitRow` + `evidence_refs`/`created_at`/`updated_at`; `DiagnosisRow`/`SopRow` + `updated_at` (generische Felder, keine OKF-Details). (b) SELECTs erweitern: KU `+ evidence_refs, created_at, updated_at`; block_diagnosis `+ updated_at`; sop `+ updated_at`. (c) Nach `renderHandbook`: OKF-Concepts bauen aus **selben gefilterten Arrays** — KU = `knowledgeUnits` (post-block-review-filter); diagnoses **gefiltert `status==='confirmed'`**; sops alle. `assembleOkfBundle` → `checkOkfConformance`. (d) **Weiche Degradation:** try/catch um den gesamten OKF-Block; bei Fehler ODER `!conformance.ok` → `captureException`/error_log + OKF weglassen (kein `okf/` im ZIP), narrativer Pfad unberuehrt. (e) `buildHandbookZip` mit `extraFolders:[{root:'okf', files: okfBundle}]` wenn ok.
- Verification: Wiring-Test (Mapping-Selektion confirmed-Diagnosen + KU-Set + weiche-Degradation-Pfad). Full-Suite 0 Regression; tsc/ESLint=0. (Worker-Integration ist schwer voll-unit-testbar → Logik-Smoke + Verlass auf MT-1/2/3-Units; Live-Smoke im /deploy via echtem Snapshot-Download + okf/-Inspektion.)
- Dependencies: MT-2, MT-3

#### MT-5: Records + Gesamt-/qa + Pre-Merge-Re-Check + Master-Merge
- Goal: V9.7-Abschluss.
- Files: `slices/INDEX.md`, `features/INDEX.md`, `planning/backlog.json`, `docs/STATE.md`, Report
- Expected behavior: Gesamt-/qa V9.7 (A+B Cross-Slice: emit→bundle→conformance→worker-wiring drift-frei; full `npm run test`). Pre-Merge-Re-Check (rebase auf main, Tests post-rebase, MIG-Kollision=keine, Pattern-Drift gegen `strategaize-okf-profile.md`, Cross-Repo OKF-Pattern in sync [OP=kanonische Quelle fuer IS-Port], manueller Diff-Review). Records-Flip: SLC-V9.7-A/B → done, FEAT-083/084 → done, BL-162/163 → done. **EIN** Master-Merge `v9-7-okf-export` → `main` (--no-ff).
- Verification: /qa-PASS + Pre-Merge-Re-Check-Verdict 6/6; Master-Merge clean.
- Dependencies: MT-4

## Acceptance Criteria
- AC-B-1: root `okf/index.md` deklariert `okf_version: "0.1"` + `strategaize_okf_profile: "1.0"`, Section-gruppierte Bullet-Form (SC-V9.7-4).
- AC-B-2: `okf/log.md` mit ≥1 Creation-Eintrag fuer den Snapshot (SC-V9.7-5).
- AC-B-3: Cross-Links bundle-root-absolut + aufloesbar (Linkziel existiert im Bundle) (SC-V9.7-6).
- AC-B-4: `checkOkfConformance` parst das erzeugte Bundle + prueft SC-1..5 programmatisch; RED-zuerst-Test belegt Wirksamkeit (SC-V9.7-8).
- AC-B-5: Download-ZIP enthaelt `handbuch/` **byte-identisch** zu vor V9.7 + zusaetzlich `okf/` (SC-V9.7-10, DEC-220); selber Endpoint.
- AC-B-6: Worker-Kern ruft nur das isolierte `okf/`-Modul; SELECT-Erweiterungen sind generische Felder (SC-V9.7-7).
- AC-B-7: Weiche Degradation — OKF-Fehler → error_log + ZIP ohne `okf/`, Snapshot trotzdem `ready` (DEC-225).
- AC-B-8: Quality-Gates tsc=0 / ESLint=0 / Full-Suite 0 Regression; Gesamt-/qa + Pre-Merge-Re-Check PASS.

## Risiken
- R-B-1: `zip-builder`-Backward-Compat — bestehende Tests muessen unveraendert GREEN bleiben (Regression-Gate fuer das narrative Deliverable).
- R-B-2: Content-Paritaet narrativ vs OKF ist Nicht-Ziel (DEC-225) — Diagnose-Selektion `confirmed` kann minimal von per-Section `min_status` abweichen; bewusst akzeptiert, im Report vermerken.
- R-B-3: Cross-Link-Aufloesung — wenn ein block_key nur ein Concept hat, keine `## Verwandte`-Section (kein leerer Link-Block). Test abdecken.
- R-B-4: Live-Smoke (echter Snapshot-Download + `okf/`-Inspektion + conformance gegen reales Bundle) ist /deploy-gated (kein lokaler Worker-Run gegen Prod-DB) — im /qa als deferred-live markieren.
