# SLC-138 — FEAT-057 Helper-Texts mit Beispieldefinitionen pro Frage

**Feature:** FEAT-057
**Version:** V7.1
**Status:** planned
**Created:** 2026-05-20
**Estimated effort:** ~6-10h Code-Side + ~3-6h User-Content-Erstellung
**Pre-Conditions:** SLC-137 done (EditableText verfuegbar)
**Worktree:** `slc-138-helper-texts-questions` (Pflicht)

## Zweck

Schema-Erweiterung `template.blocks[].questions[].helper_text + .examples_md` JSONB-Sub-Pfade (DEC-070 + DEC-073 Cross-Repo-konform). Initial-Content fuer 24 Fragen `partner_diagnostic v1`. Info-Icon + Modal-UI im Diagnose-Run. Helper-Text-Edit via EditableText. Pre-Wiring fuer FEAT-058 Telemetry-Event `helper_text_open`.

## Pre-Migration-Check

VOR Migration 099 Apply:
- Cross-Repo-Cross-Check IS V3 Schema-Form (siehe Memory `project_op_v71_cross_repo_helper_text_sync.md`).
- Falls IS V3 Schema seit 2026-05-20 geaendert -> Schema-Konsistenz vor Migration sicherstellen.

## In Scope

Siehe FEAT-057 In-Scope. Konkret:
- Migration 099 mit Schema-Validation-Function (helper_text max 300, examples_md max 800).
- Migration 099a mit 24 Fragen Initial-Content (User-Mitarbeit ~3-6h).
- Info-Icon-Render in Frage-Karte (lucide-react Info 14px).
- HelperTextModal-Komponente mit remark@15 Markdown-Rendering.
- Admin-Helper-Edit-Page.
- Telemetry-Event-Emission `helper_text_open` (Stub-Wiring fuer SLC-139).

## Out of Scope

- Helper-Texts fuer andere Templates (`exit_readiness`, `mitarbeiter_wissenserhebung`) — Schema erweitert global, Initial-Content nur partner_diagnostic.
- Multi-Sprach-Helper-Texts — V8+ NL.
- Versions-Diff der Helper-Texts — V8+.
- Per-Partner-Helper-Override-eigenes-UI — Standard EditableText reicht.

## Micro-Tasks

### MT-1: IS V3 Cross-Repo-Schema-Cross-Check + Memory-Update
- Goal: Schema-Form `helper_text: string` (max 300) + `examples_md: string` (max 800) ist in IS-Repo DEC-070 + DEC-073 + DEC-071 (Snapshot-Mechanik) bestaetigt. Cross-Check 2026-05-20-Stand vor MT-2.
- Files: Memory `project_op_v71_cross_repo_helper_text_sync.md` (Update mit Cross-Check-Datum/Commit-Hash).
- Expected behavior: Schema in beiden Repos identisch dokumentiert. Falls Drift: IS-Side-Fix VOR OP-Migration 099.
- Verification: Manual-Cross-Check der IS DEC-070 + DEC-073 + DEC-071 Inhalt vs. OP DEC-142 + MIG-045. Memory-Eintrag mit Datum.
- Dependencies: Keine.

### MT-2: Migration 099 Schema-Validation-Function
- Goal: `validate_helper_text_schema()`-Function appliziert auf Coolify-DB. Validiert dass helper_text + examples_md in template-JSONB innerhalb Laengen-Limits sind. Idempotent.
- Files: `sql/migrations/099_v71_helper_text_validation.sql`, `docs/MIGRATIONS.md` (MIG-045 -> live).
- Expected behavior: Function rejected Templates mit helper_text > 300 oder examples_md > 800. Apply via `docker exec ... psql`. NOTIFY pgrst.
- Verification: Function-Test-Insert mit helper_text=301chars -> Error. helper_text=300chars -> OK.
- Dependencies: MT-1.

### MT-3: Migration 099a Initial-Content fuer 24 Fragen
- Goal: UPDATE `template SET blocks = jsonb_path-Mutationen` fuer partner_diagnostic v1. Pro Frage: helper_text (Definition, ~100-200 Worte) + examples_md (2-3 Branchen-Beispiele Markdown). User-Content-Mitarbeit ~3-6h Parallel-Arbeit.
- Files: `sql/migrations/099a_v71_partner_diagnostic_helper_initial_content.sql`, optional `docs/HELPER_TEXTS_CONTENT.md` (User-Briefing-File mit 24 Fragen).
- Expected behavior: Migration laeuft idempotent, ergaenzt JSONB-Felder ohne Frage-Texte zu aendern. Validation passed (alle <= 300/800 chars).
- Verification: Query `SELECT key, helper_text, examples_md FROM template ..., jsonb_array_elements(blocks)->blocks, jsonb_array_elements(block->questions)->q WHERE template.slug='partner_diagnostic'` zeigt alle 24 Fragen mit gefuellten Feldern. validate_helper_text_schema() runs clean.
- Dependencies: MT-2 + User-Content-Lieferung.

### MT-4: HelperTextModal-Komponente
- Goal: Modal-Dialog mit Frage-Label-Titel + Definition (helper_text plain) + Beispiele (examples_md remark@15-rendered) + Close-Button. Triggert Telemetry-Event `helper_text_open` beim Open.
- Files: `src/app/dashboard/diagnose/run/components/HelperTextModal.tsx`, `src/lib/markdown/render.ts` (Reuse falls existent, sonst neu mit remark@15+remark-html@16).
- Expected behavior: Modal-Open via Prop. Markdown-Render mit Sanitizer-Whitelist (kein HTML). Telemetry-Hook `useDiagnoseTelemetry().trackEvent('helper_text_open', { question_key })`.
- Verification: Vitest mit 4+ Cases (Plain-Rendering, Markdown-Rendering, Telemetry-Hook-Call, Close-Button-Trigger).
- Dependencies: MT-3, SLC-137 MT-1 (EditableText fuer Admin-Edit) - aber Lese-Pfad funktioniert ohne EditableText.

### MT-5: Info-Icon-Integration in Frage-Karte
- Goal: Info-Icon (lucide-react Info 14px) neben Frage-Label rendert nur wenn helper_text oder examples_md gesetzt. Klick oeffnet HelperTextModal.
- Files: `src/app/dashboard/diagnose/run/components/QuestionCard.tsx` (Erweiterung), `src/app/dashboard/diagnose/run/page.tsx` (Telemetry-Hook-Init falls fehlend).
- Expected behavior: Visuell dezent (opacity 0.5 hover 1.0). Bei leerem helper_text + examples_md -> kein Icon (kein leeres Modal).
- Verification: Visual-Smoke im Browser: 24 Fragen zeigen Info-Icon. Klick zeigt Modal mit korrektem Inhalt.
- Dependencies: MT-3, MT-4.

### MT-6: Admin-Helper-Edit-Page
- Goal: Kompakte Edit-Page fuer Strategaize-Admin pro Frage: helper_text (EditableText multiline) + examples_md (EditableText multiline + markdown=true).
- Files: `src/app/admin/templates/partner-diagnostic/questions/[questionKey]/helper/page.tsx`, `src/app/admin/templates/partner-diagnostic/questions/[questionKey]/helper/actions.ts` (falls EditableText nicht direkt funktioniert).
- Expected behavior: Page als strategaize_admin sichtbar. EditableText speichert Override mit keyPath `template.partner_diagnostic.block.<blockKey>.question.<qKey>.helper_text` + entsprechend examples_md.
- Verification: Manueller Smoke: Edit Helper-Text als strategaize_admin, Re-Render Diagnose-Run-Page zeigt neuen Text.
- Dependencies: MT-4, MT-5, SLC-137 MT-1.

### MT-7: Records-Update + Cross-Repo-Memory-Refresh
- Goal: Slice + Backlog + Feature + Migration + STATE auf done. Memory `project_op_v71_cross_repo_helper_text_sync.md` mit aktuellem Stand (Migration 099 live, OP-Konsum aktiv).
- Files: `slices/INDEX.md`, `planning/backlog.json` (BL-115 -> done), `features/INDEX.md` (FEAT-057 -> done), `docs/STATE.md`, `docs/MIGRATIONS.md` (MIG-045 -> live).
- Expected behavior: Cockpit zeigt SLC-138 done, FEAT-057 done.
- Verification: Cockpit-Refresh.
- Dependencies: MT-1..6.

## Acceptance Criteria

Siehe FEAT-057 AC-1..10. Plus:
- AC-SLC-138-1: Migration 099 + 099a LIVE auf Coolify-DB.
- AC-SLC-138-2: Alle 24 partner_diagnostic-Fragen haben helper_text + examples_md.
- AC-SLC-138-3: HelperTextModal triggert Telemetry-Event `helper_text_open` (Stub-Wiring, voll-verifiziert in SLC-139).

## Risiken

- IS V3 Schema-Drift seit 2026-05-20 (MT-1 deckt das auf).
- User-Content fuer 24 Fragen kommt nicht zeitnah -> Migration 099a kann ohne Initial-Content laufen (leere helper_text-Felder), aber dann erfuellt SLC-138 NICHT AC-SLC-138-2. Empfehlung: Slice-Block bis User-Content fertig.
- Markdown-Render-Pipeline (remark@15) - falls noch nicht im Repo, MT-4 muss Lib-Setup mit aufnehmen.
- Modal-Auto-Close bei Outside-Klick muss Telemetry-Trigger-Race vermeiden.
