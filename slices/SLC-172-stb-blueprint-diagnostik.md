# SLC-172 — Blueprint-Diagnostik (eigene Kanzlei)

- Version: V10
- Feature: FEAT-092
- Backlog: BL-511
- Status: planned
- Priority: High
- Created: 2026-06-21
- Parallel-Group: B (nach SLC-170b Blueprint-Welle) — parallel-faehig zu SLC-173, aber shared Capture-Wizard → siehe R-172-2
- MIG reserviert: **MIG-127** (DEC-249) — thin atomarer KU-Seed-RPC `rpc_seed_blueprint_diagnosis_input`. (Korrektur ggü. urspruenglicher Annahme „keine": DEC-244 „migrationsfrei" galt nur dem `diagnosis_generation`-Trigger-Pfad; der neue KU-Input-Seed ist ein atomarer Multi-Entity-Write → RPC per backend.md Decision-Tree.)
- Founder-Entscheid 2026-06-24 (M-BP §7.7): Vertiefung-Surfacing = **A (adaptiv)** — die 5 Vertiefungsfragen erscheinen nur bei Ampel gelb/rot der gekoppelten Kern-Frage (Live-Assessment). Architektur dazu: DEC-249 + ARCHITECTURE §13.
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
- **AC-172-5:** Tenant-Isolation (RLS) verifiziert; self-service Trigger nur fuer eigenen Tenant; `tsc`/`eslint` 0; hermetische Tests GREEN. MIG-127 (`rpc_seed_blueprint_diagnosis_input`) per DB-Sidecar (node:22 + SAVEPOINT) belegt: A–G-KU-Count + Idempotenz-Re-Run + Tenant-Scope.
- **AC-172-6 (adaptiv, Choice A):** Eine Vertiefungsfrage (F-BP-016/017/018/019/020) wird nur eingeblendet, wenn die gekoppelte Kern-Frage (F-BP-004/005/007/009/013) per Live-`assessAnswerAmpel` gelb/rot ergibt; bei gruen bleibt der Gratis-Test bei 15 Fragen. Kopplung via gemeinsames `unterbereich` (a2/b1/c1/d1/f1). Assess-Call = EU-Bedrock (`chatWithLLM`), in `error_log` auditiert (provider/region/model); Live-Ampel in `capture_session.metadata.blueprint_adaptive_ampel` (NICHT `answers` — Schema `record<string,string>`).

## Micro-Tasks

### MT-1: Blueprint-Capture-Eintritt + adaptive Vertiefung (Choice A)
- Goal: Blueprint-Lauf startbar im StB-Cockpit; adaptive Vertiefungs-Einblendung bei gelb/rot.
- Files: `src/app/dashboard/stb/blueprint/page.tsx` (neu — Reuse Capture-Wizard-Komponenten, Template `stb_blueprint_kanzlei`, Session tier=`blueprint`), `src/lib/stb-vertikale/blueprint.ts` (neu — Session-Start-Helper, Reuse `capture_session`-Mechanik + statische Kopplungstabelle a2/b1/c1/d1/f1), `src/app/api/stb/blueprint/assess-ampel/route.ts` ODER Server-Action `assessAnswerAmpel` (neu — synchroner EU-Bedrock-Mini-Call `chatWithLLM` temp 0 → `{ampel}`, `error_log`-Audit, Ampel-Stash in `capture_session.answers._adaptive_ampel`), Wizard-Wiring fuer dynamische Vertiefungs-Einblendung.
- Expected behavior: StB startet Blueprint-Session, beantwortet `stufe1_kern`; bei den 5 gekoppelten Kern-Fragen triggert ein Ampel-Assessment; gelb/rot blendet die gekoppelte Vertiefungsfrage ein; `block_checkpoint` wird geschrieben (Reuse `rpc_create_block_checkpoint`).
- Verification: hermetischer Test Session-Start + Kopplungs-Logik (gruen→keine Einblendung, gelb/rot→Einblendung) mit gemocktem Assess-Call + Checkpoint-Write; Env-/Tier-Gate (SLC-171) greift.
- Dependencies: SLC-170b (Blueprint-Template), SLC-171 (Env-Gate).

### MT-2: KU-Seed-RPC (MIG-127) + tenant-scoped Diagnostik-Trigger (DEC-244/249)
- Goal: aus den Capture-Antworten KUs je Diagnose-Block A–G atomar seeden + 7 `diagnosis_generation`-Jobs enqueuen.
- Files: `sql/migrations/127_*.sql` (neu — `rpc_seed_blueprint_diagnosis_input(p_session_id)` PL/pgSQL, atomar, idempotent; je A–G KUs aus `diagnosis_schema.blocks[X].subtopics[].question_keys`, `body`="Frage:…/Antwort:…", `block_key=X`; Checkpoint-Ref), `src/lib/stb-vertikale/blueprint-diagnosis.ts` (neu — Action `triggerBlueprintDiagnosis`: Owner-Auth + `assertSessionTierAllows(session, "diagnosis_generation")` + `rpc.seed…` + 7× `ai_jobs`-Insert `diagnosis_generation` mit `session_tier`-Stempel; Klon von `triggerDiagnosisGeneration` ohne `strategaize_admin`-Check), DB-Sidecar-Test.
- Expected behavior: nach Capture-Submit → `rpc_seed_blueprint_diagnosis_input` (KUs A–G) → 7 `diagnosis_generation`-Jobs → Worker `handle-diagnosis-job` (Reuse, unveraendert) → **`block_diagnosis`** A–G.
- Verification: DB-Sidecar (node:22 + SAVEPOINT) MIG-127: A–G-KU-Count + Idempotenz-Re-Run + Tenant-Scope; hermetischer Test Trigger (Owner-Auth + Tier-Gate + 7 Enqueues).
- Dependencies: MT-1. **Offen (im /backend aufloesen):** ob `rpc_create_diagnosis`/`block_diagnosis` einen Checkpoint mit gleichem `block_key=X` verlangt (→ 7 thin Checkpoints) oder den Capture-Checkpoint reused (MIG-050/052 lesen).

### MT-3: block_diagnosis-Subtopic-Reader + deterministisches Modul-Routing
- Goal: sichtbare Ampel/Reifegrad/Empfehlung je Unterthema + „relevante Module".
- Files: `src/components/stb/SubtopicDiagnosisCard.tsx` (neu — Ampel-Badge/Reifegrad/Empfehlung; Layout-Reuse `BerichtRenderer`/`BlockSectionCard`), `src/lib/stb-vertikale/blueprint-routing.ts` (neu — deterministisch: pro `metadata.routing[]`-Eintrag `Subtopic-Ampel ∈ activate_when.ampel → primaer(+sekundaer) modul_key`), `src/app/dashboard/stb/blueprint/[sessionId]/page.tsx` (neu — Reader, reuse `fetchDiagnosis` je A–G + Modul-Routing-Card mit Link in den Modul-Capture SLC-173), Tests.
- Expected behavior: Reader zeigt je A–G die Subtopic-Diagnosen + eine Routing-Card „relevante Module"; kein LLM-Routing.
- Verification: hermetischer Render-Test (Subtopic-Felder + Routing-Logik gelb/rot→Modul, gruen→kein Modul); Copy DATEV-konform (AC-172-4).
- Dependencies: MT-2.

## Risiken & Dependencies
- **R-172-1 (GELOEST durch DEC-244 / Q-B1-1):** die fruehere Routing-Branch-Frage (light-pipeline `usage_kind` (a) vs. neuer Branch +MIG-126 (b)) war auf den **falschen** Mechanismus gemappt. Aufloesung: weder (a) noch (b) — Reuse des **separaten `diagnosis_generation`-Jobs** → `block_diagnosis` (migrationsfrei; `job_type` existiert im CHECK). Die light-pipeline (`self_service_partner_diagnostic`) ist KEIN gangbarer Reuse-Pfad (kein Ampel/Reifegrad/Empfehlung). Restliche Bauentscheidungen (KU-Seed-Mechanik, self-service Trigger) sind code-only, im /backend zu fixieren.
- **R-172-2 (Shared Capture-Wizard mit SLC-173):** beide Slices reusen den `capture/`-Wizard. Wenn beide gemeinsame Komponenten anfassen → gleiche Parallel-Group, sequenzieren oder File-Touchpoints disjunkt halten (Blueprint = `dashboard/stb/blueprint/*`, Modul = `dashboard/stb/modul/*`). Pre-Merge-Re-Check Pattern-Drift-Schritt Pflicht.
- **R-172-3 (Content-Gate, BLOCKING):** SLC-172 startet erst, wenn SLC-170b die Blueprint-Welle geseedet hat (`diagnosis_schema` + `diagnosis_prompt` + Block→`modul_key`-Map). Bis dahin kann MT-2 weder Diagnose noch Routing erzeugen.
- **Dependency:** SLC-170b (Blueprint-Template + Routing-Map), SLC-171 (Env-Gate). Liefert Modul-Routing → SLC-173.

## Out of Scope
Mandanten-Blueprint (V11+); vollstaendige 46-Modul-Routing-Matrix (V10 nur M-04/05/06); Modul-Output-Generierung (SLC-174).
