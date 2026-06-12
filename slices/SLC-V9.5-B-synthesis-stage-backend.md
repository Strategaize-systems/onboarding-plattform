# SLC-V9.5-B — Synthese-Stage Backend (Cross-Thread-Synthese)

- Feature: FEAT-080
- Version: V9.5
- Status: done
- Priority: High
- Backlog: BL-159 (Teil 1/2 — Backend; Curation-Anbindung folgt in SLC-V9.5-D)
- Parallel-Group: **Sequential-Chain S1** (nach SLC-V9.5-A)
- MIG: **MIG-111 reserviert → `sql/migrations/119_v95_synthesis_stage.sql`**
- Created: 2026-06-12

## Goal
Eine additive Pipeline-Stage zwischen `email_bulk_run.status` `pattern_extracted` und `curating`. Ein neuer Claim-Loop-Worker `email_bulk_synthesis` liest **alle** rohen `email_pattern`-Rows eines Runs, partitioniert sie deterministisch nach `suggested_section` (DEC-215), ruft pro Section **einen** Sonnet-Synthese-Call (Dedup/Merge/Evidenz-Aggregation/Frequenz-Gewichtung) und persistiert die Draft-Units (Filter `evidence_count >= 2`) in eine **neue Tabelle `email_synthesized_unit`** + Provenance-Join `email_synthesized_unit_source`. Der flache Per-Thread-Extraktor bleibt im Kern unveraendert — **eine** Enqueue-Zeile am Success-Tail (OQ-1, SC-V9.5-7).

**Diese Slice enthaelt NOCH KEINE Critic-Phase (SLC-V9.5-C) und NOCH KEINE Curation-Umstellung (SLC-V9.5-D).** Der Worker persistiert nach der Synthese direkt mit dem `evidence_count >= 2`-Filter. Der Persist-Schritt wird so strukturiert, dass SLC-V9.5-C die Critic-Phase **additiv** davor einhaengen kann (Filter-Hook, siehe MT-4).

## In Scope
- MIG-111: 2 neue Tabellen + Status-Erweiterung + `synthesis_cost_eur` + `total_cost_eur` GENERATED-Rebuild + RLS + Indizes.
- Synthese-Pure-Function `bedrock-sonnet/email-synthesis.ts` + `-prompt.ts` + zod-Schema (in `types.ts` oder eigenem Schema-File).
- Cost-Cap-Erweiterung: `getRunTotalCostEur(runId)` + Live-Total-Cap-Check.
- Worker `handle-synthesis-job.ts` (Partition → Synthese-Call/Section → evidence>=2-Filter → Persist → Status-Flip → Live-Cap → Idempotenz).
- Dispatcher-Wiring (`claim-loop.ts` JOB_TYPES + Handler-Param + else-if) + Registrierung (`run.ts`) + job-type-Konstante (`job-types.ts`).
- Enqueue-Tail im Extraktor (1 Statement, OQ-1).

## Out of Scope
- Critic-Phase (SLC-V9.5-C).
- Curation-UI + `importAcceptedPatterns`-Umstellung auf `email_synthesized_unit` (SLC-V9.5-D).
- Drill-Down von konsolidierten Units auf rohe Patterns in der UI (OQ-3 → out, `_source`-Join wird nur fuer Provenance/Audit persistiert).

## Acceptance
- **AC-B-1 (SC-V9.5-1):** Messbare Reduktions-Quote raw `email_pattern` → konsolidierte `email_synthesized_unit` auf einer Vorher/Nachher-Fixture (mehrere Patterns desselben Themas → 1 Unit).
- **AC-B-2 (SC-V9.5-2):** Multi-Thread-Evidenz-Aggregation: eine Unit, die n Threads belegt, traegt `evidence_count = n` + bis zu 5 quellattribuierte `evidence_snippets` + `n` `email_synthesized_unit_source`-Rows.
- **AC-B-3 (DEC-214 / Privacy):** Keine thread-lokalen Pseudonyme (P1/P2) in `email_synthesized_unit.description` (Synthese-Prompt verbietet sie; /qa-Pattern-Scan).
- **AC-B-4 (SC-V9.5-4 / DEC-217):** Alle Calls Bedrock eu-central-1; `ai_cost_ledger` role `email_bulk_synthesis` mit regulaerer `ai_jobs`-Row (KEIN synthetic — echter Claim-Loop-Job); Live-Cap gegen `total_cost_eur` vs `V9_BULK_EMAIL_RUN_CAP_EUR` → bei Hit `status='failed'`.
- **AC-B-5 (SC-V9.5-7):** Extraktor-Algorithmus unveraendert; **genau eine** Enqueue-Zeile am Success-Tail (bewusster Minimal-Touch, NICHT „0 Touch").
- **AC-B-6 (SC-V9.5-8 / RLS):** Tenant-RLS auf beide neue Tabellen — Cross-Tenant-Read/Write rejected (node:20-Sidecar SAVEPOINT-Pen-Test, 4 Rollen).
- **AC-B-7 (OQ-4 Idempotenz):** Re-Run des Workers fuer denselben `bulk_run_id` legt keine Duplikate an (skip wenn `email_synthesized_unit` fuer den Run existiert).
- **AC-B-8 (Status-Maschine):** `pattern_extracted → synthesizing → synthesized`; falscher Eingangsstatus → no-op + `rpc_complete_ai_job` (analog Extraktor-Skip).
- **AC-B-9 (Quality-Gates):** tsc=0, ESLint=0, Vitest-Vollsuite ohne Regression; MIG-111 LIVE auf Coolify-DB applied + verifiziert.

## Decisions referenced
- DEC-214 (neue Tabelle), DEC-215 (Partition nach suggested_section, 1 Call/Section), DEC-216 (bounded, Persist-Filter evidence>=2 — Critic kommt in C), DEC-217 (synthesis_cost_eur + total_cost_eur GENERATED-Rebuild + Live-Total-Cap).

## Micro-Tasks

#### MT-1: MIG-111 — Schema (Tabellen + Status + Cost + RLS)
- Goal: Migration `119_v95_synthesis_stage.sql` schreiben + LIVE applien.
- Files: `sql/migrations/119_v95_synthesis_stage.sql`, `docs/MIGRATIONS.md` (MIG-111 Skizze → finaler Eintrag).
- Expected behavior:
  1. **BLOCKING Pre-Step (R-B-1):** LIVE `\d email_bulk_run` inspizieren — die aktuelle `status`-CHECK hat **16 Werte** (MIG-058/113/117 ergaenzten `continuous`, `paused`, `awaiting_approval`); die `total_cost_eur` GENERATED-Expression aus dem LIVE-Stand lesen. Die CHECK-/GENERATED-Rebuilds MUESSEN vom Live-Stand ausgehen, NICHT von MIG-106.
  2. `email_bulk_run.status` CHECK Drop+Add: alle 16 bestehenden Werte + **`synthesizing`, `synthesized`** (= 18).
  3. `ADD COLUMN synthesis_cost_eur numeric(8,4) NOT NULL DEFAULT 0;`
  4. **DROP+RECREATE** der GENERATED-Spalte `total_cost_eur` auf `(pre_filter_cost_eur + pattern_extraction_cost_eur + synthesis_cost_eur) STORED` (GENERATED-Expression kann nicht per ALTER geaendert werden).
  5. `CREATE TABLE email_synthesized_unit` — spiegelt die curierbaren `email_pattern`-Felder (`title, description, evidence_snippets jsonb, themes text[], suggested_section`) + Aggregat (`aggregated_confidence numeric(3,2), evidence_count int NOT NULL, source_pattern_ids uuid[]`) + Curation-Felder analog `email_pattern` (`curation_status DEFAULT 'pending_curation' CHECK(pending_curation|accepted|rejected|edited), curated_section, curator_user_id FK auth.users, curated_at, imported_to_handbook_at, imported_knowledge_unit_id FK knowledge_unit ON DELETE SET NULL`) + `tenant_id NOT NULL FK tenants`, `bulk_run_id NOT NULL FK email_bulk_run ON DELETE CASCADE`, `created_at`.
  6. `CREATE TABLE email_synthesized_unit_source` — `(id, synthesized_unit_id NOT NULL FK email_synthesized_unit ON DELETE CASCADE, pattern_id NOT NULL FK email_pattern ON DELETE CASCADE, thread_id uuid, tenant_id NOT NULL FK tenants)` + `UNIQUE(synthesized_unit_id, pattern_id)`.
  7. RLS auf beide Tabellen analog MIG-106-Matrix (`strategaize_admin` SELECT cross-tenant; `tenant_admin` SELECT/INSERT/UPDATE own-tenant via `auth.user_role()` + `auth.user_tenant_id()`); GRANTs authenticated + service_role; Indizes `(bulk_run_id)`, `(bulk_run_id, curation_status)`, `(tenant_id)`, `_source(synthesized_unit_id)`, `_source(pattern_id)`.
- Verification: Apply via `sql-migration-hetzner.md` (base64 → `psql -U postgres`); `\d email_synthesized_unit` + `\d email_synthesized_unit_source` + `\d email_bulk_run` (18-Werte-CHECK + neue GENERATED-Expr) verifizieren.
- Dependencies: SLC-V9.5-A done.

#### MT-2: Synthese-Pure-Function + Prompt + Schema
- Goal: `email-synthesis.ts` analog `email-pattern.ts`-Struktur (Bedrock-Client + Test-Injection-Hook + JSON-Extraction + zod-Validation + SonnetSchemaError-Reuse).
- Files: `src/lib/ai/bedrock-sonnet/email-synthesis.ts`, `src/lib/ai/bedrock-sonnet/email-synthesis-prompt.ts`, `src/lib/ai/bedrock-sonnet/types.ts` (neues `SynthesisResultSchema` + Typen), `src/lib/ai/bedrock-sonnet/__tests__/email-synthesis.test.ts`.
- Expected behavior: `synthesizeSection(sectionName, patterns[], options?)` → `{ units: [{ title, description, themes, suggested_section, source_pattern_ids[], evidence_count, evidence_snippets:[{text, source_pattern_id}], aggregated_confidence }] }`. Region hardcoded eu-central-1; Modell-ID via `BEDROCK_V9_SONNET_MODEL_ID` || eu-Sonnet-4 (aus SLC-V9.5-A); Prompt = ARCH §6 (thread-agnostisch, keine P1/P2-Token, Evidenz-Aggregation, kein Verwerfen — das macht der Critic).
- Verification: TDD — injizierter Caller liefert Fixture-JSON; Schema-Parse RED→GREEN; P1/P2-Token-Scan-Test (keine Pseudonyme im Output bei pseudonym-haltigem Input passieren NICHT, da das LLM sie weglassen soll — der Test prueft die Schema-Form + dass `source_pattern_id` je Snippet gesetzt ist; der echte Privacy-Scan ist /qa AC-B-3).
- Dependencies: MT-1 (Schema-Form kennt die persistierbaren Felder).

#### MT-3: Cost-Cap-Erweiterung (getRunTotalCostEur + Live-Total-Cap)
- Goal: `CostCapStore` um `getRunTotalCostEur(runId)` erweitern (liest `total_cost_eur`) + eine Live-Cap-Check-Funktion fuer die Synthese-Stage.
- Files: `src/lib/bulk-email/cost-cap.ts`, `src/lib/bulk-email/__tests__/cost-cap.test.ts`.
- Expected behavior: `getRunTotalCostEur(runId)` im Interface + Supabase-Adapter (liest `email_bulk_run.total_cost_eur`). Eine `checkLiveTotalCapInWorker(runId, capEur, store)` (oder Wiederverwendung von `checkLiveCapInWorker`-Signatur mit der neuen Store-Methode) → `{ exceeded, currentEur }` gegen `total_cost_eur`. DEC-217: der Synthese-Worker inkrementiert `synthesis_cost_eur`, der Live-Cap prueft die **Gesamt**kosten.
- Verification: TDD — Mock-Store; exceeded/not-exceeded-Cases RED→GREEN.
- Dependencies: MT-1 (synthesis_cost_eur + total_cost_eur-Rebuild existieren).

#### MT-4: Worker `email_bulk_synthesis`
- Goal: Claim-Loop-Job-Handler mit Synthese-Phase + Persist (Critic-Hook fuer SLC-V9.5-C vorbereitet).
- Files: `src/workers/bulk-email/handle-synthesis-job.ts`, `src/workers/bulk-email/__tests__/handle-synthesis-job.test.ts`.
- Expected behavior (Pattern: `executeEmailBulkSynthesis(job, deps)` + thin `handleEmailBulkSynthesisJob(job)` Wrapper, DI fuer Tests analog Extraktor):
  1. Load `email_bulk_run`; Status-Skip wenn != `pattern_extracted` → `rpc_complete_ai_job` + return (AC-B-8).
  2. **Idempotenz (AC-B-7):** wenn `email_synthesized_unit` fuer `bulk_run_id` existiert → skip + complete.
  3. Status `pattern_extracted → synthesizing`.
  4. SELECT alle `email_pattern` WHERE bulk_run_id (id, title, description, evidence_snippets, themes, confidence, suggested_section, thread_id).
  5. Partition nach `suggested_section` (NULL/`'andere'` → eigene Gruppe, DEC-215).
  6. Pro Section: `synthesizeSection()`-Call → Draft-Units. Nach jedem Call: `synthesis_cost_eur += cost` (UPDATE) + `ai_cost_ledger` (role `email_bulk_synthesis`, job_id = diese Job-ID) + Live-Cap-Check (MT-3) → bei Hit `status='failed'` + break.
  7. **Filter-Hook (DEC-216):** `survivingUnits = draftUnits.filter(u => u.evidence_count >= 2)`. **SLC-V9.5-C haengt hier die Critic-Phase ein** (Verdict-Filter VOR dem evidence-Filter). Die Filter-Logik als benannte Funktion `selectSurvivingUnits(draftUnits, criticVerdicts?)` strukturieren, damit C nur das optionale Argument fuellt.
  8. Pro ueberlebende Unit atomar: INSERT `email_synthesized_unit` + n× `email_synthesized_unit_source`.
  9. Status `synthesizing → synthesized` + `rpc_complete_ai_job`.
  10. try/catch: Run-Error → `status='failed'` + failure_reason + re-throw (analog Extraktor).
- Verification: TDD — Fixture mit 3 Threads/1 Section → 1 Unit (evidence_count=3); Cap-Exceed-Case → status=failed; Idempotenz-Re-Run → 0 neue Rows; Status-Skip-Case.
- Dependencies: MT-1, MT-2, MT-3.

#### MT-5: Dispatcher-Wiring + Enqueue-Tail (OQ-1)
- Goal: Worker registrieren + Extraktor enqueued die Synthese.
- Files: `src/workers/bulk-email/job-types.ts` (neue Konstante `JOB_TYPE_EMAIL_BULK_SYNTHESIS = "email_bulk_synthesis"`), `src/workers/condensation/claim-loop.ts` (JOB_TYPES-Array + neuer Handler-Param + else-if-Branch), `src/workers/condensation/run.ts` (Import + Handler-Arg + Log), `src/workers/bulk-email/handle-pattern-extraction-job.ts` (Enqueue-Tail).
- Expected behavior:
  - claim-loop: `email_bulk_synthesis` ans JOB_TYPES-Array; neuen positionalen `emailBulkSynthesisHandler?`-Param + else-if (folgt dem bestehenden Positions-Param-Pattern — bewusst dem Bestand folgend trotz Param-Sprawl, surgical).
  - run.ts: `handleEmailBulkSynthesisJob` importieren + als letztes Arg an `startClaimLoop` + Registrierungs-Log.
  - **Enqueue-Tail:** in `handle-pattern-extraction-job.ts` **nach** dem erfolgreichen `status='pattern_extracted'`-UPDATE (Z.~436) und **vor** `rpc_complete_ai_job`: `admin.from("ai_jobs").insert({ tenant_id: run.tenant_id, job_type: "email_bulk_synthesis", status: "pending", payload: { bulk_run_id: run.id } })`. Enqueue-Fehler → throw (Extract-Job bleibt offen → Retry; Retry ist via Thread-Skip + AC-B-7-Idempotenz harmlos). Genau 1 Statement-Block (AC-B-5). Cap-Exceed-Pfad (Z.381) und Approval-Pause-Pfad enqueuen NICHT (Run nicht `pattern_extracted`).
- Verification: Worker-Boot-Log zeigt `email_bulk_synthesis handler registered`; Extraktor-Test erweitert um Enqueue-Assertion (1 neue ai_jobs-Row im Success-Pfad, 0 im Cap/Approval-Pfad).
- Dependencies: MT-4.

#### MT-6: Slice-/qa
- Goal: AC-B-1..9 verifizieren inkl. RLS-Sidecar + MIG-LIVE.
- Files: `src/.../__tests__/email-synthesized-unit-rls.test.ts` (node:20-Sidecar).
- Verification: tsc=0, ESLint=0, Vollsuite kein Regress; RLS-Suite 4-Rollen GREEN gegen Coolify-DB (SAVEPOINT-Pattern); Vorher/Nachher-Reduktions-Fixture (AC-B-1); P1/P2-Pattern-Scan (AC-B-3); Live-Cap-Behavior; MIG-111 LIVE verifiziert.
- Dependencies: MT-1..MT-5.

## Risks
- **R-B-1 (Status-CHECK + GENERATED-Rebuild, BLOCKING):** Die LIVE `email_bulk_run.status` CHECK hat 16 Werte (V9.1 ergaenzte `continuous`/`paused`/`awaiting_approval`). Ein Rebuild aus MIG-106 (13 Werte) wuerde diese silent droppen → V9.1-Runtime-Break. MT-1 Pre-Step: LIVE-Schema inspizieren, Rebuild vom Live-Stand. Gilt auch fuer die `total_cost_eur` GENERATED-Expression.
- **R-B-2 (Cost-Cap-Leak):** Synthese-Calls muessen unter den Run-Hard-Cap fallen. Live-Cap auf `total_cost_eur` (DEC-217). Ohne das umgeht ein grosser Run den Cap.
- **R-B-3 (Over-Merge):** Konservativer Merge — lieber 2 Units als 1 ueber-gemergte. `evidence_count >= 2`-Persist-Filter; Critic-`REJECT` fuer Redundanz erst in SLC-V9.5-C. /qa Vorher/Nachher-Fixture.
- **R-B-4 (Param-Sprawl claim-loop):** `startClaimLoop` hat bereits 19 positionale Handler-Params. Neuer Param folgt dem Bestand (surgical), aber der Sprawl ist ein latenter Refactor-Kandidat → als Dev-System-IMP notieren, NICHT in dieser Slice refactoren.
- **R-B-5 (Worker-Boot-Sync):** `job-types.ts`, `claim-loop.ts` JOB_TYPES-Array und `run.ts`-Registrierung muessen synchron bleiben (3-Stellen-Sync, dokumentiert im job-types.ts-Header). Alle drei in MT-5.

## Notes
- Synthetic-ai_jobs-Pattern (backend.md) **entfaellt** — der Worker ist ein echter Claim-Loop-Job mit regulaerer `ai_jobs`-Row. `ai_cost_ledger.job_id` = Synthese-Job-ID (AC-B-4).
- Nach dieser Slice stallt ein Run bei `synthesized` (Curation liest noch `email_pattern`/erwartet `pattern_extracted`). Das ist OK innerhalb des Cumulative-Branch — kein Master-Merge bis Gesamt-/qa nach SLC-V9.5-D. Pro-Slice-Testbarkeit: der Worker produziert verifizierbare Rows (AC-B-1/2).

## Refs
- ARCHITECTURE.md §"V9.5 Architecture Addendum" §§1-6, §9-11. FEAT-080. BL-159. DEC-214/215/216/217.
- Contract-Files: `handle-pattern-extraction-job.ts` (Enqueue-Tail), `cost-cap.ts` (Store-Ext), `email-pattern.ts` (Pure-Function-Vorbild), `claim-loop.ts`+`run.ts` (Dispatcher).
