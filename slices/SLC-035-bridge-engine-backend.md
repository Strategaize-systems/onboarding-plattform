# SLC-035 — Bridge-Engine Backend

## Goal
Backend der Hybrid-Bridge-Engine (DEC-034). Worker-Job-Type `bridge_generation` plus Migration 073 (3 RPCs) plus Cost-Logging. Bridge erzeugt pro Lauf Template-Verfeinerungs-Proposals (KI optimiert Mitarbeiter-Auswahl und Wortlaut je subtopic_bridge) plus bis zu 3 Free-Form-Proposals. Keine UI — die Review-UI baut SLC-036. Keine Approval-Action — der `rpc_approve_bridge_proposal` spawned die employee-capture_session und wird in SLC-036 UI-seitig integriert, die RPC selbst aber in diesem Slice ausgeliefert.

## Feature
FEAT-023

## In Scope
- Migration 073 `073_rpc_bridge.sql`:
  - `rpc_trigger_bridge_run(capture_session_id)` — tenant_admin-only. INSERT bridge_run mit status='running', source_checkpoint_ids aus aktuellem Session-Zustand. INSERT ai_jobs mit job_type='bridge_generation' + payload {bridge_run_id}. Return bridge_run_id.
  - `rpc_approve_bridge_proposal(proposal_id, edited_payload jsonb)` — tenant_admin-only. UPDATE bridge_proposal SET status='approved', reviewed_by_user_id, reviewed_at, proposed_block_title/description/questions ueberschrieben mit edited_payload (wenn vorhanden). INSERT capture_session mit capture_mode='employee_questionnaire', owner_user_id=proposed_employee_user_id, template_id=Tenant-Template, answers='{}', status='open'. UPDATE bridge_proposal SET status='spawned', approved_capture_session_id. Return capture_session_id.
  - `rpc_reject_bridge_proposal(proposal_id, reason)` — tenant_admin-only. UPDATE bridge_proposal SET status='rejected', reject_reason.
- Worker-Job-Handler `src/workers/bridge/handle-bridge-job.ts`:
  - Laedt bridge_run + Tenant-Template + employee_capture_schema.
  - Laedt block_checkpoint (submitted/finalized) + KUs (accepted/proposed) + Diagnose (confirmed) der Quell-Session.
  - Laedt aktive Employees des Tenants.
  - Pro subtopic_bridge: evaluiert skip_if, prueft ob Subtopic in Diagnose vorkommt. Bei Match: Bedrock-Call (~$0.01-$0.03) fuer Mitarbeiter-Auswahl + minimale Wortlaut-Verfeinerung. INSERT bridge_proposal mit mode='template'.
  - Free-Form-Slot: ein Bedrock-Call (~$0.05-$0.10) mit max 3 Vorschlaegen. INSERT bridge_proposal mit mode='free_form'.
  - UPDATE bridge_run SET status='completed', proposal_count, cost_usd, generated_by_model, completed_at.
  - ai_cost_ledger per Bedrock-Call: feature='bridge_template_refine' oder 'bridge_free_form', role='bridge_engine'.
  - Bei Fehler: UPDATE bridge_run SET status='failed', error_message.
- Prompt-Builder `src/workers/bridge/prompts.ts`:
  - `buildTemplatePromptForSubtopic(subtopic_bridge, subtopic_context, employees)` → System+User-Prompt.
  - `buildFreeFormPrompt(all_kus, all_diagnoses, existing_subtopic_keys, employees, system_prompt_addendum)` → System+User-Prompt.
  - JSON-Output-Schema enforced (Claude Sonnet JSON Mode).
- Worker-Registrierung in `src/workers/run.ts` (Dispatcher nach job_type, DEC-017 Pattern).
- Cost-Ledger CHECK-Erweiterung falls noetig (feature-Werte pruefen — bestehender `ai_cost_ledger.feature` CHECK ggf. um `bridge_template_refine` und `bridge_free_form` erweitern; falls CHECK bereits frei definiert ist, keine Migration noetig).
- Unit-Tests `src/workers/bridge/__tests__/handle-bridge-job.test.ts`:
  - Mock-Bedrock + Fixture-Session-Snapshot → erwartete Proposal-Anzahl und -Struktur.
  - Edge-Cases: Keine Employees → Proposals mit role_hint statt user_id. Keine Diagnose → Proposal nur aus KU-Basis. skip_if true → Subtopic uebersprungen.
- RPC-Integration-Tests `src/__tests__/rls/bridge-rpcs.test.ts`: tenant_admin-Only, Approval spawned tatsaechlich capture_session.

## Out of Scope
- UI fuer Bridge-Review/Approve/Reject (SLC-036).
- Stale-Hinweis-UI im Dashboard (SLC-036 + SLC-040).
- Diff-View zwischen Bridge-Laeufen (V4.1).
- Bridge-Prompt-Editor-UI (spaeter).
- Bridge-Auto-Trigger nach Submit (explizit ausgeschlossen, DEC-037).
- Mitarbeiter-UI (SLC-037).

## Acceptance Criteria
- AC-1: `rpc_trigger_bridge_run` erzeugt bridge_run (status=running) + ai_jobs-Row mit job_type='bridge_generation'.
- AC-2: Worker-Job erzeugt bei Test-Session mit ≥3 submitted Bloecken und ≥3 aktiven Employees mind. 3 Template-Proposals plus bis zu 3 Free-Form-Proposals.
- AC-3: bridge_run wechselt nach Abschluss auf status='completed', proposal_count reflektiert tatsaechliche Proposal-Anzahl, cost_usd ist gesetzt.
- AC-4: ai_cost_ledger hat pro Bedrock-Call einen Eintrag mit korrektem feature-Wert und tenant_id.
- AC-5: Bei Worker-Fehler wechselt bridge_run auf status='failed' mit error_message.
- AC-6: Trigger `bridge_run_set_stale` (aus SLC-033) wirkt: Nach Abschluss eines Bridge-Laufs, bei neuem block_checkpoint → bridge_run.status='stale'.
- AC-7: `rpc_approve_bridge_proposal(id, {"proposed_block_title":"Edit","proposed_questions":[...]})` erzeugt eine capture_session mit capture_mode='employee_questionnaire' + owner_user_id=proposed_employee_user_id. bridge_proposal.status='spawned'. capture_session ist danach fuer den Mitarbeiter sichtbar (RLS-Matrix laeuft).
- AC-8: `rpc_reject_bridge_proposal(id, "Zu vage")` setzt status='rejected' + reject_reason.
- AC-9: Cross-Tenant-Schutz: tenant_admin von Tenant B kann NICHT bridge_proposal von Tenant A approven/rejecten.
- AC-10: Leerer Free-Form-Slot (Template setzt max_proposals=0) erzeugt keinen Free-Form-Call.

## Dependencies
- Vorbedingung: SLC-033 done (Migrations 068, 069 landed; bridge_run/bridge_proposal + employee_capture_schema in exit_readiness).
- Vorbedingung: SLC-034 done (employees existieren, sonst keine user_id-Zuordnung moeglich — alternativ mit role_hint ohne user).
- Folge-Voraussetzung fuer: SLC-036 (UI), SLC-037 (Mitarbeiter bearbeitet gespawnte Session).

## Worktree
Mandatory (SaaS, Bedrock-Kosten-kritisch).

## Migrations-Zuordnung
073 (aus MIG-023). Ggf. CHECK-Erweiterung `ai_cost_ledger.feature` als Mini-Migration 073b falls noetig.

## Pflicht-QA-Vorgaben
- `/qa` muss folgende Punkte abdecken:
  - Unit-Tests mit Mock-Bedrock gruen (mind. 3 Szenarien: Happy, Edge-Case ohne Employees, skip_if).
  - Integration-Test gegen Coolify-DB: rpc_trigger_bridge_run → Worker verarbeitet → bridge_run completed, Proposals existieren.
  - Cost-Check: ai_cost_ledger-Eintrag nach jedem Bedrock-Call.
  - RLS-Test: nicht-tenant_admin darf rpc_trigger_bridge_run NICHT aufrufen.
  - Stale-Trigger-Verifikation (erweitert aus SLC-033).
  - `npm run test` gruen (inkl. bridge-Tests).
  - SQL-Migration auf Hetzner nach Pattern.
- IMP-112: Re-Read vor Write.
- Datenschutz (Data-Residency-Rule): Bedrock-Region = `eu-central-1` explizit geprueft in Worker-Config.

## Risks
- Bedrock-Kosten-Runaway bei sehr grossen Sessions: Mitigation: max_proposals-Limit auf Template + Token-Budget pro Call im Prompt-Builder.
- JSON-Parse-Fehler bei Free-Form-Output: Mitigation: JSON-Mode + Retry-Logic (1x Retry) + Fallback auf 0 Free-Form bei Parse-Fail.
- Zuordnung ohne passende Employees: Mitigation: Fallback auf role_hint ohne proposed_employee_user_id.
- R15 (Bridge-Qualitaet): Prompt-Design kritisch — Tests mit mehreren Fixture-Szenarien + User-Review im /qa.

### Micro-Tasks

#### MT-1: Migration 073 — 3 Bridge-RPCs
- Goal: rpc_trigger_bridge_run + rpc_approve_bridge_proposal + rpc_reject_bridge_proposal.
- Files: `sql/migrations/073_rpc_bridge.sql`, `sql/schema.sql`
- Expected behavior: SECURITY DEFINER, tenant_admin-Check in jedem RPC. trigger_bridge_run auch strategaize_admin zulassen (fuer Debugging). approve-RPC atomar in einer Transaktion: bridge_proposal UPDATE + capture_session INSERT + bridge_proposal UPDATE erneut. Edited_payload ist optional (NULL = unveraenderte Proposal-Daten uebernehmen).
- Verification: Integration-Tests `src/__tests__/rls/bridge-rpcs.test.ts` pro RPC: Rolle-Check, Cross-Tenant-Block, approval erzeugt capture_session.
- Dependencies: SLC-033, SLC-034 done
- TDD-Note: TDD strikt, RLS-Test pro RPC.

#### MT-2: Prompt-Builder (Template + Free-Form)
- Goal: Zwei Prompt-Builder-Funktionen inkl. JSON-Output-Schema.
- Files: `src/workers/bridge/prompts.ts` + `src/workers/bridge/__tests__/prompts.test.ts`
- Expected behavior: buildTemplatePromptForSubtopic: System definiert Rolle ("Du verfeinerst eine Mitarbeiter-Capture-Aufgabe aus einer Template-Schablone"). User enthaelt subtopic_key, block_template, subtopic-spezifische KUs und Diagnose, Employee-Liste. Output: {proposed_employee_user_id|role_hint, adjusted_title?, adjusted_description?, adjusted_questions?}. buildFreeFormPrompt: System fordert max 3 Vorschlaege fuer unbekannte Themen. User enthaelt alle KUs, Diagnose, existing_subtopic_keys (zum Ausschluss), Employees, system_prompt_addendum aus Template. Output: Array von {block_title, description, questions, proposed_employee}.
- Verification: Unit-Tests validieren Prompt-String-Struktur und JSON-Output-Schema.
- Dependencies: none
- TDD-Note: TDD-Pflicht.

#### MT-3: Worker-Handler bridge_generation
- Goal: `src/workers/bridge/handle-bridge-job.ts`
- Files: + `src/workers/bridge/__tests__/handle-bridge-job.test.ts`
- Expected behavior: Orchestriert den vollstaendigen Flow (laden → Template-Proposals → Free-Form → UPDATE bridge_run). Bedrock-Calls per existierendem Bedrock-Client (`src/lib/ai/bedrock-client.ts`). ai_cost_ledger-INSERT per Call. Try/catch mit Status='failed' bei Fehler.
- Verification: Mock-Bedrock liefert deterministische Responses. Test verifiziert Proposal-Count, Status-Transition, ai_cost_ledger-Eintraege.
- Dependencies: MT-1, MT-2
- TDD-Note: TDD mit mind. 3 Szenarien.

#### MT-4: Worker-Dispatcher-Registrierung
- Goal: Worker pollt und verarbeitet bridge_generation Jobs.
- Files: `src/workers/run.ts` (Dispatcher erweitern) + `src/workers/run.test.ts` falls Tests dafuer existieren
- Expected behavior: Neuer Case im Dispatcher-Switch: job_type='bridge_generation' → handle-bridge-job.
- Verification: Integration-Test gegen Coolify-DB: rpc_trigger_bridge_run → Worker picked Job → bridge_run completed nach wenigen Sekunden.
- Dependencies: MT-3
- TDD-Note: Integration-Test Pflicht.

#### MT-5: Stale-Trigger-Verifikations-Test
- Goal: End-to-End-Test bridge_run.status='stale' nach zweitem Block-Submit.
- Files: `src/__tests__/integration/bridge-stale-flow.test.ts`
- Expected behavior: Fixture: capture_session + 1 bridge_run (completed) + neuer block_checkpoint (questionnaire_submit) → bridge_run.status='stale'.
- Verification: Test gruen.
- Dependencies: MT-1
- TDD-Note: Pflicht-Verifikation DEC-039.

#### MT-6: ai_cost_ledger CHECK-Erweiterung (falls noetig)
- Goal: `ai_cost_ledger.feature` und/oder `ai_cost_ledger.role` CHECK erweitern falls restriktiv.
- Files: `sql/migrations/073b_cost_ledger_bridge.sql` (nur falls noetig) + `sql/schema.sql`
- Expected behavior: ADD Werte 'bridge_template_refine', 'bridge_free_form' als feature; 'bridge_engine' als role.
- Verification: `\d ai_cost_ledger` zeigt erweiterten CHECK.
- Dependencies: MT-1 (Anforderungs-Klarheit)
- TDD-Note: Nur falls bestehender CHECK enumeriert ist (pruefen vorher `\d+ ai_cost_ledger`).

#### MT-7: Record-Updates
- Goal: STATE.md + INDEX.md + backlog.json + MIGRATIONS.md.
- Files: `docs/STATE.md`, `slices/INDEX.md`, `planning/backlog.json`, `docs/MIGRATIONS.md`
- Expected behavior: SLC-035 done, BL-042 in_progress, MIG-023 Status reflektiert 073 landed.
- Verification: Re-Read vor Write (IMP-112).
- Dependencies: MT-1..MT-6
- TDD-Note: Doku.

## Aufwand-Schaetzung
~8-10 Stunden netto (Prompt-Builder + Worker + Integration-Tests sind aufwendig). Puffer Prompt-Tuning: +2-3h. Gesamt: ~10-13 Stunden.
