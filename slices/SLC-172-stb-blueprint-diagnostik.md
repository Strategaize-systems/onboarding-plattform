# SLC-172 — Blueprint-Diagnostik (eigene Kanzlei)

- Version: V10
- Feature: FEAT-092
- Backlog: BL-511
- Status: planned
- Priority: High
- Created: 2026-06-21
- Parallel-Group: B (nach SLC-170 Seed) — parallel-faehig zu SLC-173, aber shared Capture-Wizard → siehe R-172-2
- MIG reserviert: keine
- Worktree (SaaS-Pflicht): eigener Branch `v10-slc172-blueprint`, Merge nach /qa-PASS

## Ziel
Der StB durchlaeuft fuer die eigene Kanzlei einen Blueprint-Diagnostik-Lauf: `capture_session` auf `stb_blueprint_kanzlei` → `block_checkpoint` → bestehender `diagnosis_generation`-Job → `knowledge_unit`-Diagnostik-Findings (Ampel/Reifegrad/Empfehlung) → Empfehlung/Routing in die 3 Finanz-Module M-04/05/06. Mechanismus-Reuse (DEC-234), Inhalt aus SLC-170.

## Architektur-Anker
- DEC-234: Blueprint reust die Template-/Diagnostik-Maschinerie (`capture_session` + Diagnose-Pipeline + `knowledge_unit`-Findings); Content = `stb_blueprint_kanzlei` (SLC-170).
- **Konkrete Reuse-Targets (QA-verifiziert 2026-06-21):** `src/workers/condensation/handle-job.ts` routet per `template.metadata.usage_kind` → `src/workers/condensation/light-pipeline.ts` (V6.3 DGN-A `runLightPipeline`) → `rpc_finalize_partner_diagnostic` (MIG-094). job_type `diagnosis_generation` existiert bereits im `ai_jobs`-CHECK. NICHT der schwere Orchestrator (v8-pipeline).
- ARCHITECTURE §3.3 + §5.2. Reuse-Vorbild: V6.3 `partner_diagnostic` Light-Pipeline.
- DATEV-Abgrenzung (SC-6): Naming/Copy = „operative Wirk-Schicht", NICHT DATEV-„ReifegradCheck".

## Akzeptanzkriterien
- **AC-172-1:** StB startet + durchlaeuft Blueprint fuer die eigene Kanzlei (Reuse Capture-Wizard auf `stb_blueprint_kanzlei`), `block_checkpoint`-Submit funktioniert.
- **AC-172-2:** Diagnostik-Lauf erzeugt `knowledge_unit`-Findings (via bestehendem `diagnosis_generation`-Job, Reuse) — Strukturen sichtbar (Ampel/Reifegrad/Empfehlung).
- **AC-172-3:** Ergebnis empfiehlt/routet in die relevanten Module (V10: M-04/05/06) — Routing-Hinweis aus `diagnosis_schema` (SLC-170 MT-1).
- **AC-172-4:** DATEV-Begriffs-Abgrenzung in Naming/Output gewahrt (Copy-Review).
- **AC-172-5:** Tenant-Isolation (RLS) verifiziert; `tsc`/`eslint` 0; hermetische Tests GREEN.

## Micro-Tasks

### MT-1: Blueprint-Capture-Eintritt (Reuse Wizard)
- Goal: Blueprint-Lauf startbar im StB-Cockpit.
- Files: `src/app/dashboard/stb/blueprint/page.tsx` (neu — Reuse Capture-Wizard-Komponenten, Template `stb_blueprint_kanzlei`), `src/lib/stb-vertikale/blueprint.ts` (neu — Session-Start-Helper, Reuse `capture_session`-Mechanik).
- Expected behavior: StB startet Blueprint-Session, beantwortet Blocks, `block_checkpoint` wird geschrieben (Reuse `rpc_create_block_checkpoint`).
- Verification: hermetischer Test Session-Start + Checkpoint-Write; Env-Gate (SLC-171) greift.
- Dependencies: SLC-170 (Blueprint-Template), SLC-171 (Env-Gate).

### MT-2: Diagnostik-Trigger + Findings + Modul-Routing-Render
- Goal: Diagnose-Lauf + sichtbare Strukturen + Modul-Empfehlung.
- Files: `src/lib/stb-vertikale/blueprint-diagnosis.ts` (neu — Trigger des bestehenden `diagnosis_generation`-Jobs auf den Blueprint-Run), `src/app/dashboard/stb/blueprint/[sessionId]/page.tsx` (neu — Findings + Modul-Routing-Card), Tests.
- Expected behavior: nach Submit → `diagnosis_generation`-Job (Reuse) → `knowledge_unit`-Findings; Reader zeigt Ampel/Reifegrad + „relevante Module: M-04/05/06" mit Link in den Capture-Flow (SLC-173).
- Verification: hermetischer Test (Job-Enqueue + Findings-Render); Copy DATEV-konform.
- Dependencies: MT-1.

## Risiken & Dependencies
- **R-172-1 (Routing-Branch-Entscheidung, QA-Finding — Scope-relevant):** der condensation-Worker `handle-job.ts` routet per `usage_kind`; aktuell nur `self_service_partner_diagnostic` + `mandanten_report_teaser_v1` erkannt — ein unbekannter Wert faellt auf Standard-`block_checkpoint` durch (KEINE Diagnose). Zwei Optionen: **(a)** `stb_blueprint_kanzlei` nutzt `usage_kind='self_service_partner_diagnostic'` → 0 Worker-Code, falls die Blueprint-Output-Shape zur Partner-Diagnostik passt (Empfehlung, prüfen); **(b)** neuer Wert `stb_blueprint` + neuer Branch in `handle-job.ts` + ggf. eigene `rpc_finalize_*` → **dann +1 Migration (MIG-126)** und Slice ist NICHT pure-Reuse (backend.md: atomare RPC als zusaetzliche File-Anforderung notieren, Decision-Trail in DECISIONS.md). Entscheidung im /backend treffen + mit SLC-170 MT-1 (`usage_kind`-Wert) abgleichen.
- **R-172-2 (Shared Capture-Wizard mit SLC-173):** beide Slices reusen den `capture/`-Wizard. Wenn beide gemeinsame Komponenten anfassen → gleiche Parallel-Group, sequenzieren oder File-Touchpoints disjunkt halten (Blueprint = `dashboard/stb/blueprint/*`, Modul = `dashboard/stb/modul/*`). Pre-Merge-Re-Check Pattern-Drift-Schritt Pflicht.
- **Dependency:** SLC-170 (Template), SLC-171 (Env-Gate). Liefert Modul-Routing → SLC-173.

## Out of Scope
Mandanten-Blueprint (V11+); vollstaendige 46-Modul-Routing-Matrix (V10 nur M-04/05/06); Modul-Output-Generierung (SLC-174).
