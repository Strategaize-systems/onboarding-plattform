# SLC-167 — V9 Pattern-Extraktion (Sonnet) + Curation-UI + Cost-Cap (FEAT-073)

**Version:** V9
**Feature:** FEAT-073 (Pattern-Extraktion Sonnet + Curation-UI)
**Backlog:** BL-150
**Status:** planned
**Created:** 2026-06-01
**Priority:** High
**Estimate:** ~5-7 MTs, ~4-5 Tage Code-Side + Vitest gegen Coolify-DB
**Worktree Branch:** `v9-bulk-email-import` (gleicher Cumulative-Branch wie SLC-165/166)

## Slice Goal

Liefert den **eigentlichen Wert-Hebel** der V9-Pipeline: KI-Pattern-Extraktion + GF-Curation + Cost-Cap-Enforcement.

1. **Bedrock-Sonnet-Adapter** (`src/lib/ai/bedrock-sonnet/email-pattern.ts`): Pure-Function fuer Pattern-Extraktion mit Strict-JSON-Output-Schema (themes/patterns/decisions/open_questions). Wiederverwendet V8.1-Bedrock-Sonnet-Foundation, neuer Sub-Path fuer V9-Pattern-Prompt.
2. **Pre-Cost-Estimate-Service**: Token-Count-Heuristik pro Thread + EUR-Cost-Berechnung basierend auf Sonnet-Tarif.
3. **Cost-Cap-Service** (Reuse V8.1 FEAT-069-Pattern): Soft-Cap pro Run (20 EUR), Hard-Cap pro Tenant/Monat (100 EUR), Pre-Approval-Schwelle (10 EUR) — alle ENV-overridable (DEC-182).
4. **Pre-Approval-Modal** mit Token-Count-Anzeige + Cost-Estimate + "Fortfahren?"-Bestaetigung (GF-Gate 2).
5. **`email_bulk_pattern_extraction` Worker**: Async-Job, iteriert ueber Threads, INSERTs email_pattern Rows mit Confidence + suggested_section + evidence_snippets, ai_cost_ledger feature='email_bulk_pattern_extraction', Live-Cap-Check.
6. **Curation-UI**: Pattern-Cards sortiert nach Confidence DESC + Section-Dropdown (vorgegebene V4.1-Sections + "Andere..."-Free-Text per DEC-181) + Akzept./Ablehnen/Editieren + Bulk-Aktionen (GF-Gate 3).
7. **Vitest Cost-Cap + Curation-Actions + RLS**.

Output: alle Pattern sind extrahiert + GF-curated (akzeptiert/abgelehnt/editiert + Section-zugeordnet). SLC-168 kann akzeptierte Pattern in V4.1-Handbuch-Snapshot uebersetzen.

## In Scope

- **`src/lib/ai/bedrock-sonnet/email-pattern.ts`** — Pure-Function `extractPatternFromThread(redactedBody, threadMeta): Promise<PatternExtractionResult>` mit Strict-JSON-Output-Schema (themes/patterns/decisions/open_questions)
- **`src/lib/ai/bedrock-sonnet/email-pattern-prompt.ts`** — System-Prompt + `V9_PATTERN_PROMPT_VERSION` Konstante + Tonality-Vorgaben (verkaufsfrei, Strategaize-Wir-Voice-konform)
- **`src/lib/ai/bedrock-sonnet/__tests__/email-pattern.test.ts`** — Vitest mit Mock-Bedrock + Schema-Validation
- **`src/lib/bulk-email/cost-estimate.ts`** — Pure-Function `estimateBulkRunPatternCost(threads): { tokensIn, tokensOut, costEur }` mit Heuristik basierend auf redacted_body-Token-Count
- **`src/lib/bulk-email/cost-cap.ts`** — Service-Layer:
  - `checkRunCap(estimateEur, runCapEur): boolean`
  - `checkTenantMonthlyCap(tenantId, estimateEur, hardCapEur, supabaseClient): Promise<{ allowed, currentMonthEur, remainingEur }>`
  - `checkPreApprovalThreshold(estimateEur, thresholdEur): boolean`
  - `checkLiveCapInWorker(runId, capEur, supabaseClient): Promise<{ exceeded, currentEur }>`
- **`src/lib/bulk-email/__tests__/cost-estimate.test.ts`** + **`__tests__/cost-cap.test.ts`** — Vitest mit synthetischen Token-Counts (3 Cases: unter Pre-Approval, ueber Pre-Approval, ueber Hard-Cap)
- **`src/app/dashboard/bulk-email-import/[run_id]/pattern-start/page.tsx`** — Pre-Cost-Estimate-Page mit Modal-Flow
- **`src/app/dashboard/bulk-email-import/[run_id]/pattern-start/actions.ts`** — Server-Action `startPatternExtraction(bulk_run_id, preApprovalGranted)` mit Cost-Cap-Pre-Check + ai_jobs-Enqueue
- **`src/workers/bulk-email/handle-pattern-extraction-job.ts`** — Worker: iterate Threads, Sonnet-Call, INSERT email_pattern, Live-Cap-Check nach jedem Call
- **`src/workers/handle-job.ts`** Erweiterung — Dispatch fuer `email_bulk_pattern_extraction`
- **`src/app/dashboard/bulk-email-import/[run_id]/curation/page.tsx`** — Curation-UI mit Pattern-Cards-Liste, Sortierung nach Confidence + Theme-Grouping, Bulk-Aktionen
- **`src/app/dashboard/bulk-email-import/[run_id]/curation/components/PatternCard.tsx`** — Card-Component mit Titel + Description + Evidence-Snippets-Akkordeon + Section-Dropdown + Aktions-Buttons
- **`src/app/dashboard/bulk-email-import/[run_id]/curation/components/EditPatternModal.tsx`** — Edit-Modal
- **`src/app/dashboard/bulk-email-import/[run_id]/curation/actions.ts`** — Server-Actions:
  - `updatePatternCuration(pattern_id, { status, curated_section, edited_title?, edited_description? })`
  - `bulkAcceptPatterns(bulk_run_id, { confidenceThreshold })`
  - `bulkRejectAll(bulk_run_id)`
  - `finishCurationAndStartHandbookImport(bulk_run_id)` (triggert SLC-168 Server-Action `importToHandbook`)
- **`src/lib/bulk-email/sections.ts`** — Helper `getAvailableSections(tenantId, templateId)`: liest V4.1 `template.handbook_schema` Sections + appended "Andere..."-Option
- **`src/lib/bulk-email/__tests__/sections.test.ts`** — Vitest fuer Section-Lookup
- **`src/app/dashboard/bulk-email-import/[run_id]/curation/__tests__/actions.test.ts`** — Vitest gegen Coolify-DB
- **ENV-Variablen in `.env.deploy.example`**: `V9_BULK_EMAIL_RUN_CAP_EUR=20`, `V9_BULK_EMAIL_TENANT_MONTH_CAP_EUR=100`, `V9_BULK_EMAIL_PRE_APPROVAL_THRESHOLD_EUR=10`, `BEDROCK_V9_SONNET_MODEL_ID` (Default `anthropic.claude-3-5-sonnet-20241022-v2:0`)

## Out of Scope

- **Handbuch-Integration (knowledge_unit-Insert)** — SLC-168
- **Source-Attribution-View im Handbuch-Reader** — SLC-168
- **Audit-Aggregation Cross-Tenant** — SLC-168
- **Auto-Akzeptanz ohne GF-Review** (V10+, FEAT-073 Out-of-Scope)
- **Pattern-Diff zwischen Bulk-Runs** (V10+, FEAT-073 Out-of-Scope)
- **Pattern-Vorschau im Handbuch-Reader vor Akzeptanz** (V9.1+)
- **A/B-Test verschiedener Prompts** (V9.1+)
- **Multi-Modell-Vergleich Sonnet vs Opus** (V9.1+)
- **Auto-Section-Mapping via ML** (V10+)
- **Cache-Invalidation-Pattern fuer Sonnet-Calls** (V9.1+ — V9.0 hat keinen Cache, jeder Run macht fresh Calls)

## Pre-Conditions

- ✓ SLC-166 COMPLETE (Pre-Filter + Thread + Redact LIVE)
- ✓ email_thread.redacted_body Pseudonymisierung verifiziert (kein Klarname-Leak)
- ✓ email_pattern-Tabelle existiert mit Idempotenz via curation_status (SLC-165 MIG-051)
- ✓ V8.1 FEAT-069 Cost-Cap-Pattern verfuegbar als Reuse-Anker (`src/lib/llm/v8-1-augmentation/cache.ts` + analoge Pattern)
- ✓ V4.1 `template.handbook_schema` existiert mit Sections-Liste pro Template (FEAT-026 deployed)
- ✓ `vw_bulk_email_cost_monthly` View muss vor SLC-167 angelegt sein — entweder als Teil von MT-X in SLC-167 oder vorgezogen aus SLC-168 MT-1
- ⏳ **Worktree `v9-bulk-email-import`** weiter aktiv

## Micro-Tasks

### MT-1: vw_bulk_email_cost_monthly View Vorzug (MIG-052)
- **Goal**: View aus MIG-052 vorgezogen aus SLC-168 ins SLC-167, weil Cost-Cap-Tenant-Monatscheck es schon braucht. `sql/migrations/107_v9_bulk_email_cost_view.sql` schreiben + LIVE apply.
- **Files**:
  - `sql/migrations/107_v9_bulk_email_cost_view.sql` (NEU)
  - `__tests__/migrations/107-v9-bulk-email-cost-view.test.ts` (NEU)
- **Expected behavior**:
  - `CREATE VIEW vw_bulk_email_cost_monthly` (SELECT tenant_id + date_trunc('month', created_at) + SUM(total_cost_eur) + COUNT(*) FROM email_bulk_run WHERE status != 'failed' GROUP BY ...)
  - GRANT SELECT ON vw_bulk_email_cost_monthly TO authenticated
  - RLS folgt email_bulk_run.tenant_id-Filter automatisch
- **Verification**:
  - LIVE: ssh+base64+psql -U postgres
  - Vitest gegen Coolify-DB: SELECT vw_bulk_email_cost_monthly liefert korrekte Aggregation; RLS-Test: anderer Tenant sieht 0 Rows
- **Dependencies**: SLC-166 COMPLETE

### MT-2: Bedrock-Sonnet-Adapter + Pattern-Prompt
- **Goal**: `src/lib/ai/bedrock-sonnet/email-pattern.ts` Pure-Function + Strict-JSON-Output-Schema + Pattern-Prompt.
- **Files**:
  - `src/lib/ai/bedrock-sonnet/email-pattern.ts` (NEU)
  - `src/lib/ai/bedrock-sonnet/email-pattern-prompt.ts` (NEU)
  - `src/lib/ai/bedrock-sonnet/__tests__/email-pattern.test.ts` (NEU, Mock-Bedrock + Schema-Validation)
- **Expected behavior**:
  - `extractPatternFromThread(redactedBody, threadMeta): Promise<PatternExtractionResult>`
  - Strict-JSON-Output-Schema: `{ thread_id, themes: string[], patterns: [{ title, description, evidence_snippets, confidence, suggested_section }], decisions: [...], open_questions: [...] }`
  - Region hardcoded eu-central-1 (CI-Test prueft das)
  - Bei Schema-Drift: throw `SonnetSchemaError` + Audit-Entry + Fallback (Pattern-Pass markiert als `failed` fuer betroffenen Thread, nicht ganzen Run)
  - Modell-ID via ENV `BEDROCK_V9_SONNET_MODEL_ID` (Default Sonnet 3.5)
  - Prompt enthaelt: Strategaize-Wir-Voice-Vorgabe, Pseudonym-Konvention "P1=Kunde, P2=GF", "keine Pricing-Hinweise", "max 5 Pattern pro Thread"
- **Verification**: Vitest:
  - Mock-Bedrock returns valid JSON → parsed PatternExtractionResult mit allen Pflicht-Feldern
  - Mock-Bedrock returns invalid JSON → SonnetSchemaError + Fallback
  - Region-Header eu-central-1 verifiziert
- **Dependencies**: MT-1 (kein DB-Bedarf, aber Pattern-Resource-Order konsistent), Reuse V8.1 SLC-161 Bedrock-Sonnet-Foundation

### MT-3: Pre-Cost-Estimate + Cost-Cap-Service
- **Goal**: Cost-Estimate-Pure-Function + Cost-Cap-Service-Layer mit allen 4 Check-Methoden.
- **Files**:
  - `src/lib/bulk-email/cost-estimate.ts` (NEU)
  - `src/lib/bulk-email/cost-cap.ts` (NEU)
  - `src/lib/bulk-email/__tests__/cost-estimate.test.ts` (NEU)
  - `src/lib/bulk-email/__tests__/cost-cap.test.ts` (NEU, Vitest gegen Coolify-DB)
- **Expected behavior**:
  - `estimateBulkRunPatternCost(threads): { tokensIn, tokensOut, costEur }` — Heuristik: tokensIn = sum(redacted_body.length / 4) + Prompt-Overhead, tokensOut = threads.length * 800 (avg Pattern-Output), costEur = (tokensIn * SONNET_INPUT_PRICE + tokensOut * SONNET_OUTPUT_PRICE) * EUR_USD_RATE
  - `checkRunCap`, `checkTenantMonthlyCap`, `checkPreApprovalThreshold`, `checkLiveCapInWorker` — alle 4 Service-Methoden mit ENV-overridable Default-Werten
  - Reuse V8.1 FEAT-069-Pattern fuer ai_cost_ledger-Lookup
- **Verification**: Vitest 3 Cases:
  - 100-Thread-Run mit kleinem redacted_body → estimate 0.5 EUR, alle Checks PASS
  - 1000-Thread-Run mit grossem redacted_body → estimate 25 EUR, runCap-Block (ueber 20)
  - Tenant hat im aktuellen Monat schon 95 EUR verbraucht + 10 EUR estimate → checkTenantMonthlyCap rejects (ueber 100)
  - checkLiveCapInWorker: SELECT SUM(cost_eur) FROM ai_cost_ledger WHERE bulk_run_id=X funktioniert mit Vitest-Mock
- **Dependencies**: MT-1 (View)

### MT-4: Pre-Cost-Estimate-Page + Pre-Approval-Modal + Server-Action
- **Goal**: UI fuer GF-Cost-Estimate-Review + Pre-Approval-Modal + Server-Action `startPatternExtraction`.
- **Files**:
  - `src/app/dashboard/bulk-email-import/[run_id]/pattern-start/page.tsx` (NEU)
  - `src/app/dashboard/bulk-email-import/[run_id]/pattern-start/actions.ts` (NEU)
  - `src/app/dashboard/bulk-email-import/[run_id]/pattern-start/__tests__/actions.test.ts` (NEU)
- **Expected behavior**:
  - Page liest email_thread.redacted_body fuer aktuelle Bulk-Run → ruft `estimateBulkRunPatternCost` auf → zeigt Token-Count + EUR-Cost-Estimate
  - Wenn estimateEur > V9_BULK_EMAIL_PRE_APPROVAL_THRESHOLD_EUR (10 EUR): Modal mit "Erwartete Kosten: X EUR. Fortfahren?"
  - Wenn estimateEur > V9_BULK_EMAIL_RUN_CAP_EUR (20 EUR): Block mit Fehlermeldung "Run-Limit ueberschritten" (Status bleibt `thread_redacted`)
  - Wenn Tenant-Monatscap erreicht: Block mit Fehlermeldung "Tenant-Monatslimit erreicht"
  - Server-Action `startPatternExtraction(bulk_run_id, preApprovalGranted)`:
    - Re-Check alle 3 Caps in Server-Side (UI-Check ist Convenience, Server-Check ist Sicherheit)
    - Enqueue ai_jobs-Row mit type='email_bulk_pattern_extraction'
    - UPDATE email_bulk_run.status='pattern_extracting'
- **Verification**: Vitest gegen Coolify-DB:
  - Estimate <Pre-Approval-Schwelle → kein Modal-Anzeige, Direkt-Enqueue
  - Estimate >Pre-Approval-Schwelle ohne preApprovalGranted → Action throws PreApprovalRequiredError
  - Estimate >Pre-Approval-Schwelle mit preApprovalGranted → Direkt-Enqueue
  - Estimate >Run-Cap → Action throws RunCapExceededError immer
  - Tenant-Monatscap erreicht → Action throws TenantMonthlyCapError
- **Dependencies**: MT-3

### MT-5: Worker `email_bulk_pattern_extraction` + Live-Cap-Check
- **Goal**: Worker-Implementation mit Live-Cap-Check nach jedem Bedrock-Call.
- **Files**:
  - `src/workers/bulk-email/handle-pattern-extraction-job.ts` (NEU)
  - `src/workers/handle-job.ts` (UPDATE — Dispatch)
  - `src/workers/bulk-email/__tests__/handle-pattern-extraction-job.test.ts` (NEU, Vitest gegen Coolify-DB mit Mock-Bedrock)
- **Expected behavior**:
  - Worker liest email_thread WHERE bulk_run_id=X AND thread_status='redacted' AND id NOT IN (SELECT thread_id FROM email_pattern WHERE bulk_run_id=X)
  - Iteriert Threads, ruft `extractPatternFromThread` auf
  - INSERT email_pattern Rows (1..5 pro Thread) mit confidence + suggested_section + evidence_snippets
  - INSERT ai_cost_ledger Entry pro Bedrock-Call (feature='email_bulk_pattern_extraction', region='eu-central-1', model_id, tokens, cost_eur)
  - Live-Cap-Check NACH jedem Call: SELECT SUM(cost_eur) FROM ai_cost_ledger WHERE bulk_run_id=X → wenn > V9_BULK_EMAIL_RUN_CAP_EUR: status='failed' + failure_reason='cost_cap_run_exceeded', Loop-Abbruch
  - Bei Bedrock-Schema-Drift (SonnetSchemaError) auf einzelnem Thread: Skip Thread + Error-Log, weiter mit naechstem
  - Update email_bulk_run.status='pattern_extracted' + pattern_extraction_cost_eur=SUM + patterns_extracted=COUNT am Ende
- **Verification**: Vitest gegen Coolify-DB:
  - 42 Threads → 8+ email_pattern-Rows (~min 5 Pattern aus Test-Corpus per FEAT-073 AC-1)
  - Mock-Bedrock liefert Schema-Drift auf Thread 5 → Skip + Error-Log + Continue
  - Live-Cap-Check rejects nach Call 30 wenn cumulative > Cap → status='failed', failure_reason gesetzt, ~11 Threads ohne Pattern (acceptable, GF kann Re-Try mit hoeherem Cap)
- **Dependencies**: MT-2, MT-4

### MT-6: Curation-UI + Components + Section-Lookup
- **Goal**: Curation-UI mit Pattern-Cards + Section-Dropdown + Bulk-Aktionen + Edit-Modal.
- **Files**:
  - `src/app/dashboard/bulk-email-import/[run_id]/curation/page.tsx` (NEU)
  - `src/app/dashboard/bulk-email-import/[run_id]/curation/components/PatternCard.tsx` (NEU)
  - `src/app/dashboard/bulk-email-import/[run_id]/curation/components/EditPatternModal.tsx` (NEU)
  - `src/app/dashboard/bulk-email-import/[run_id]/curation/actions.ts` (NEU)
  - `src/lib/bulk-email/sections.ts` (NEU)
  - `src/lib/bulk-email/__tests__/sections.test.ts` (NEU)
  - `src/app/dashboard/bulk-email-import/[run_id]/curation/__tests__/actions.test.ts` (NEU)
- **Expected behavior**:
  - Curation-Page: liest email_pattern WHERE bulk_run_id=X, sortiert nach confidence DESC, gruppiert nach Theme
  - PatternCard: Titel + Description + Evidence-Snippets-Akkordeon (read-only mit Pseudonym-Hint) + Confidence-Pill (gruen/gelb/rot per Schwellen) + Section-Dropdown (Pflicht) + Aktions-Buttons
  - Section-Dropdown: `getAvailableSections(tenantId, templateId)` liest V4.1 `template.handbook_schema` Sections + appended "Andere..."; bei "Andere..." → Inline-Free-Text-Input
  - EditPatternModal: Titel + Description editierbar, evidence_snippets read-only; Save → UPDATE email_pattern.title + description, curation_status='edited'
  - Bulk-Aktion "alle confidence >0.8 akzeptieren": SELECT WHERE confidence > 0.8 AND curation_status='pending_curation' → UPDATE alle → status='accepted'
  - Progress-Bar: "X von Y Patterns curated" (zaehlt curation_status != 'pending_curation')
  - Abschluss-Button "Curation abschliessen → in Handbuch uebernehmen" → Server-Action `finishCurationAndStartHandbookImport(bulk_run_id)` (triggert SLC-168-Import-Action; in SLC-167 erstmal nur UPDATE email_bulk_run.status='importing' + Hinweis "SLC-168 noch nicht implementiert" oder bei kombiniertem Worktree direkt Import wenn SLC-168 schon im selben Worktree)
- **Verification**: Vitest gegen Coolify-DB:
  - updatePatternCuration({status:'accepted', curated_section:'vertrieb/einwand'}) → email_pattern UPDATE mit curator_user_id + curated_at
  - bulkAcceptPatterns(confidenceThreshold:0.8) → alle qualifizierten Pattern UPDATE
  - EditModal Save → title + description geupdatet, evidence_snippets unveraendert
  - Section-Lookup: V4.1-Template-Sections + "Andere..." appended
  - "Andere..."-Wahl → curated_section enthaelt Free-Text-String
- **Dependencies**: MT-5

### MT-7: SLC-167 Records-Update + Commit
- **Goal**: slices/INDEX.md SLC-167 `planned → in_progress`. features/INDEX.md FEAT-073 `planned → in_progress`. planning/backlog.json BL-150 bleibt in_progress.
- **Files**:
  - `slices/INDEX.md` (UPDATE)
  - `features/INDEX.md` (UPDATE)
  - `planning/backlog.json` (UPDATE wenn nicht schon)
  - `docs/MIGRATIONS.md` (UPDATE — MIG-052 PLANNED → live nach MT-1)
- **Expected behavior**: Status-Updates wie spec.
- **Verification**: `grep "in_progress" slices/INDEX.md | grep SLC-167` matched.
- **Dependencies**: MT-6

## Acceptance Criteria

- **AC-SLC-167-1**: MIG-052 (vw_bulk_email_cost_monthly View) LIVE auf Coolify-Postgres.
- **AC-SLC-167-2**: Pre-Cost-Estimate-Modal erscheint bei estimateEur >10 EUR (Pflicht-Vitest).
- **AC-SLC-167-3**: Run-Cap-Check blockt Run bei estimateEur >20 EUR mit klarer Fehlermeldung.
- **AC-SLC-167-4**: Hard-Cap pro Tenant pro Monat blockt weitere Runs bei >100 EUR Monatssumme.
- **AC-SLC-167-5**: 42 Threads (aus Test-Corpus) liefern mindestens 8 Pattern (Realistic-Case-Heuristik aus FEAT-073).
- **AC-SLC-167-6**: Cost pro 1000 Emails Pattern-Extraktion <8 EUR (Sonnet-Bedrock-Schaetzung).
- **AC-SLC-167-7**: Curation-UI zeigt Pattern-Liste sortierbar nach Confidence + Theme.
- **AC-SLC-167-8**: GF kann pro Pattern Akzeptieren/Ablehnen/Editieren/Section-Zuordnen.
- **AC-SLC-167-9**: Bulk-Aktion "alle confidence >0.8 akzeptieren" funktioniert.
- **AC-SLC-167-10**: Edit-Modal speichert Titel + Description-Edits, evidence_snippets bleiben read-only.
- **AC-SLC-167-11**: Section-Dropdown zeigt V4.1-Template-Sections + "Andere..." als Free-Text-Fallback (DEC-181).
- **AC-SLC-167-12**: ai_cost_ledger erhaelt Entries pro Sonnet-Call mit Region eu-central-1.
- **AC-SLC-167-13**: Live-Cap-Check im Worker abortet bei Cap-Exceed mit status='failed' + failure_reason='cost_cap_run_exceeded'.
- **AC-SLC-167-14**: Bedrock-Schema-Drift auf einzelnem Thread: Skip + weiter, kein Crash des ganzen Runs.
- **AC-SLC-167-15**: Abschluss-Button setzt Bulk-Run-Status `importing` und triggert SLC-168-Import.
- **AC-SLC-167-16**: TypeScript-Compile EXIT=0, ESLint EXIT=0, alle Vitest-Tests GREEN.

## Notable Risks / Dependencies

- **R1 (DEC-179)**: Wenn Cost-Validation aus SLC-165 MT-1 Faktor-2-Abweichung zeigt: V9_BULK_EMAIL_RUN_CAP_EUR (20) ist zu eng. ENV-Override-Pattern erlaubt Adjust ohne Code-Change, aber Architektur-Update + DEC-187 muss in MT-3 dokumentiert werden.
- **R2**: Sonnet-Strict-JSON-Schema-Compliance kann bei langen Threads driften (>4000 Tokens Output). Pflicht: Fallback-Pattern (Skip-Thread + Error-Log).
- **R3**: GF-Curation-Fatigue bei vielen Pattern (50+): Bulk-Aktionen + Confidence-Sortierung muessen UX-fluessig sein. UI-Polling-Loop fuer Live-Status-Update, falls Worker parallel laeuft.
- **R4 (DEC-181)**: "Andere..."-Free-Text-Section kann zu Section-Spreading fuehren. V9.0 akzeptiert das, V9.1+ Auto-Section-Anlage.
- **R5**: Worker-Re-Try-Pattern bei status='failed': Idempotenz via `email_pattern.thread_id NOT IN bestehende` reicht NUR wenn pre-existing Pattern-Rows nicht beschaedigt sind. Bei partial-failure (z.B. 30 von 42 Threads erfolgreich): Re-Try macht nur die verbleibenden 12. Aber: bestehende Pattern-Rows von erfolgreichen Threads bleiben mit curation_status='pending_curation' — wenn GF schon kuriert hat, gehen Updates verloren bei Re-Try. Loesung: Worker prueft `WHERE curation_status='pending_curation'` zusaetzlich; bestehende kuriert-Pattern werden geschuetzt.
- **R6**: Section-Lookup `template.handbook_schema` kann variieren pro Template (FEAT-026/028). MT-6 Test-Setup braucht aktives V4.1-Template im Tenant.
- **R7**: vw_bulk_email_cost_monthly muss VOR MT-3 LIVE sein. MT-1 Vorzug aus SLC-168 ist Pflicht.
- **D1**: Hard-Dependency auf SLC-166 (email_thread.redacted_body Pseudonymisiert).
- **D2**: Hard-Dependency auf V8.1 FEAT-069 Cost-Cap-Pattern als Reuse-Anker.
- **D3**: Hard-Dependency auf V4.1 FEAT-026/028 (template.handbook_schema fuer Section-Lookup).

## Worktree

- **Branch**: `v9-bulk-email-import` (gleicher Cumulative-Branch)
- **Path**: `c:/strategaize/strategaize-onboarding-plattform-v9`

## Next After SLC-167

**SLC-168 — V9 Handbuch-Integration + Audit/Cost-Aggregation + Source-Attribution-View** (FEAT-074). Konsumiert email_pattern WHERE curation_status='accepted' AND imported_to_handbook_at IS NULL aus diesem Slice, uebersetzt in knowledge_unit-Rows, triggert handbook_snapshot, fuegt Source-Attribution-View im V4.1-Handbuch-Reader hinzu.
