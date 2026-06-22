# SLC-172 — Blueprint-Diagnostik (eigene Kanzlei)

- Version: V10
- Feature: FEAT-092
- Backlog: BL-511
- Status: planned
- Priority: High
- Created: 2026-06-21
- Parallel-Group: B (nach SLC-170b Blueprint-Welle) — parallel-faehig zu SLC-173, aber shared Capture-Wizard → siehe R-172-2
- MIG reserviert: keine (Q-B1-1/DEC-244: `diagnosis_generation`-Pfad ist migrationsfrei; R-172-1 (b) „+MIG-126" entfaellt)
- Worktree (SaaS-Pflicht): eigener Branch `v10-slc172-blueprint`, Merge nach /qa-PASS
- **HART GEBLOCKT auf SLC-170b (Blueprint-Welle):** `stb_blueprint_kanzlei` (Blocks + `diagnosis_schema` + `diagnosis_prompt` + Block→`modul_key`-Routing-Map) = Founder-IP, existiert noch nicht. Ohne diesen Seed kann SLC-172 nicht starten.

## Ziel
Der StB durchlaeuft fuer die eigene Kanzlei einen Blueprint-Diagnostik-Lauf: `capture_session` auf `stb_blueprint_kanzlei` → `block_checkpoint` → (duenne Fragebogen→KU-Seed-Vorstufe) → bestehender `diagnosis_generation`-Job → **`block_diagnosis`** (Ampel/Reifegrad/Empfehlung als first-class Felder) → deterministisches Routing in die relevanten Finanz-Module. Mechanismus-Reuse (DEC-234, praezisiert in **DEC-244 / Q-B1-1**), Inhalt aus SLC-170b.

## Architektur-Anker
- **DEC-244 (Q-B1-1) — Reuse-Pfad korrigiert:** Mechanismus = der separate `diagnosis_generation`-Job (`src/workers/diagnosis/handle-diagnosis-job.ts`), der pro Block `knowledge_unit` als **Input** liest, schema-getrieben (`template.diagnosis_schema`/`diagnosis_prompt`) Bedrock ruft und via `rpc_create_diagnosis` nach **`block_diagnosis`** schreibt. Nur dieser Pfad liefert Ampel/Reifegrad/Empfehlung strukturiert. **NICHT** die light-pipeline (`usage_kind='self_service_partner_diagnostic'` → `runLightPipeline` → `rpc_finalize_partner_diagnostic`): die schreibt nur Score+Freitext nach `knowledge_unit`, kein Ampel/Reifegrad/Empfehlung. Die fruehere „Reuse-Target"-Notiz (condensation/usage_kind/light-pipeline) war ein Mis-Mapping.
- DEC-234: Blueprint reust die Template-/Diagnostik-Maschinerie (`capture_session` + `diagnosis_generation` + `block_diagnosis`); Content = `stb_blueprint_kanzlei` (SLC-170b).
- **KU-Input-Vorstufe (im /backend festlegen):** der `diagnosis_generation`-Worker wirft, wenn pro Block keine `knowledge_unit` existiert. Empfohlen: duenne Fragebogen→KU-Seed aus dem Blueprint-`block_checkpoint` (Reuse KU-Schreib-Muster aus `rpc_finalize_partner_diagnostic`, MIG-094), NICHT der schwere condensation-Loop.
- **Trigger/Auth-Delta:** `triggerDiagnosisGeneration` ist heute `strategaize_admin`-only (Berater-Debrief). Blueprint = self-service → tenant-scoped Trigger (`tenant_admin`-Action oder Auto-Enqueue nach Finalize), tier-gated (`blueprint`-Tier, `assertSessionTierAllows`). Code-only.
- ARCHITECTURE §V10.12 + §V10.2. Reuse-Vorbild: Exit-Readiness-Diagnose-Maschinerie (Mechanik), Inhalt neu.
- DATEV-Abgrenzung (SC-6): Naming/Copy = „operative Wirk-Schicht", NICHT DATEV-„ReifegradCheck".

## Akzeptanzkriterien
- **AC-172-1:** StB startet + durchlaeuft Blueprint fuer die eigene Kanzlei (Reuse Capture-Wizard auf `stb_blueprint_kanzlei`), `block_checkpoint`-Submit funktioniert.
- **AC-172-2:** Diagnostik-Lauf erzeugt strukturierte **`block_diagnosis`**-Rows (via bestehendem `diagnosis_generation`-Job + KU-Input-Vorstufe) — Ampel/Reifegrad/Empfehlung sichtbar. (NICHT `knowledge_unit`-Findings als Deliverable — die sind Input; DEC-244.)
- **AC-172-3:** Ergebnis empfiehlt/routet deterministisch in die relevanten Module — Block→`modul_key`-Map aus dem Blueprint-Template (SLC-170b), Schwellwert auf `block_diagnosis` (Ampel/Reifegrad). Kein LLM-Routing.
- **AC-172-4:** DATEV-Begriffs-Abgrenzung in Naming/Output gewahrt (Copy-Review).
- **AC-172-5:** Tenant-Isolation (RLS) verifiziert; self-service Trigger nur fuer eigenen Tenant; `tsc`/`eslint` 0; hermetische Tests GREEN.

## Micro-Tasks

### MT-1: Blueprint-Capture-Eintritt (Reuse Wizard)
- Goal: Blueprint-Lauf startbar im StB-Cockpit.
- Files: `src/app/dashboard/stb/blueprint/page.tsx` (neu — Reuse Capture-Wizard-Komponenten, Template `stb_blueprint_kanzlei`), `src/lib/stb-vertikale/blueprint.ts` (neu — Session-Start-Helper, Reuse `capture_session`-Mechanik).
- Expected behavior: StB startet Blueprint-Session, beantwortet Blocks, `block_checkpoint` wird geschrieben (Reuse `rpc_create_block_checkpoint`).
- Verification: hermetischer Test Session-Start + Checkpoint-Write; Env-Gate (SLC-171) greift.
- Dependencies: SLC-170b (Blueprint-Template), SLC-171 (Env-Gate).

### MT-2: KU-Seed + Diagnostik-Trigger + block_diagnosis-Render + Modul-Routing (DEC-244)
- Goal: Diagnose-Lauf + sichtbare Ampel/Reifegrad/Empfehlung + deterministische Modul-Empfehlung.
- Files: `src/lib/stb-vertikale/blueprint-diagnosis.ts` (neu — (1) duenne Fragebogen→KU-Seed aus `block_checkpoint` [Reuse KU-Write-Muster aus `rpc_finalize_partner_diagnostic`], (2) tenant-scoped Enqueue von `diagnosis_generation` pro Block, tier-gated `blueprint`), `src/lib/stb-vertikale/blueprint-routing.ts` (neu — deterministisches Block→`modul_key`-Routing aus Template-Map + Schwellwert auf `block_diagnosis`), `src/app/dashboard/stb/blueprint/[sessionId]/page.tsx` (neu — `block_diagnosis`-Reader Ampel/Reifegrad/Empfehlung + Modul-Routing-Card), Tests.
- Expected behavior: nach Submit → KU-Seed → `diagnosis_generation`-Job (Reuse) → **`block_diagnosis`**; Reader zeigt Ampel/Reifegrad/Empfehlung + „relevante Module" mit Link in den Capture-Flow (SLC-173).
- Verification: hermetischer Test (KU-Seed + Job-Enqueue + `block_diagnosis`-Render + Routing-Logik); Copy DATEV-konform.
- Dependencies: MT-1.

## Risiken & Dependencies
- **R-172-1 (GELOEST durch DEC-244 / Q-B1-1):** die fruehere Routing-Branch-Frage (light-pipeline `usage_kind` (a) vs. neuer Branch +MIG-126 (b)) war auf den **falschen** Mechanismus gemappt. Aufloesung: weder (a) noch (b) — Reuse des **separaten `diagnosis_generation`-Jobs** → `block_diagnosis` (migrationsfrei; `job_type` existiert im CHECK). Die light-pipeline (`self_service_partner_diagnostic`) ist KEIN gangbarer Reuse-Pfad (kein Ampel/Reifegrad/Empfehlung). Restliche Bauentscheidungen (KU-Seed-Mechanik, self-service Trigger) sind code-only, im /backend zu fixieren.
- **R-172-2 (Shared Capture-Wizard mit SLC-173):** beide Slices reusen den `capture/`-Wizard. Wenn beide gemeinsame Komponenten anfassen → gleiche Parallel-Group, sequenzieren oder File-Touchpoints disjunkt halten (Blueprint = `dashboard/stb/blueprint/*`, Modul = `dashboard/stb/modul/*`). Pre-Merge-Re-Check Pattern-Drift-Schritt Pflicht.
- **R-172-3 (Content-Gate, BLOCKING):** SLC-172 startet erst, wenn SLC-170b die Blueprint-Welle geseedet hat (`diagnosis_schema` + `diagnosis_prompt` + Block→`modul_key`-Map). Bis dahin kann MT-2 weder Diagnose noch Routing erzeugen.
- **Dependency:** SLC-170b (Blueprint-Template + Routing-Map), SLC-171 (Env-Gate). Liefert Modul-Routing → SLC-173.

## Out of Scope
Mandanten-Blueprint (V11+); vollstaendige 46-Modul-Routing-Matrix (V10 nur M-04/05/06); Modul-Output-Generierung (SLC-174).
