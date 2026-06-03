# SLC-166 — V9 Pre-Filter (Haiku) + Thread-Aggregation + PII-Redaction (FEAT-071 + FEAT-072)

**Version:** V9
**Feature:** FEAT-071 (KI-Pre-Filter Haiku + Filter-Review-UI) + FEAT-072 (Thread-Aggregation + PII-Redaction)
**Backlog:** BL-148 + BL-149
**Status:** planned
**Created:** 2026-06-01
**Priority:** High
**Estimate:** ~6-8 MTs, ~4-5 Tage Code-Side + Vitest gegen Coolify-DB
**Worktree Branch:** `v9-bulk-email-import` (gleicher Cumulative-Branch wie SLC-165)

## Slice Goal

Liefert die **zentrale KI-Pipeline-Schicht** zwischen Upload (SLC-165) und Pattern-Extraktion (SLC-167):

1. **Bedrock-Haiku-Adapter** (`src/lib/ai/bedrock-haiku/`): neuer Modell-Adapter-Sub-Path fuer Haiku eu-central-1, Strict-JSON-Klassifikations-Schema. Wiederverwendet bestehende `bedrock-client`-Foundation, Reuse `data-residency`-Pattern.
2. **`email_bulk_pre_filter` Worker**: Async-Job-Type, Batch-Processing (50 Emails/Bedrock-Call), Klassifikation in 6 kanonische Labels (DEC-184), `ai_cost_ledger`-Audit pro Call.
3. **Filter-Review-UI**: Klassifikations-Counts + Pro-Email-Korrektur + Bulk-Reclassify + Approval-Button (GF-Gate 1 per DEC-178).
4. **Thread-Aggregation Pure-Function**: RFC-5322 message_id + in_reply_to + references-Array, Edge-Cases (Single-Email-Thread, Reply-Loops, Forward-Chains).
5. **PII-Email-Adapter** (`src/lib/ai/pii-patterns/email-adapter.ts`) per DEC-176: Header-Participant-Map P1/P2 + Signatur-Entfernung + V5-Pipeline-Wrapper.
6. **`email_bulk_thread_redact` Worker** (kombiniert Thread + Redact, DEC-178): persistiert email_thread + UPDATE email_message.thread_id + email_message.pii_redacted, schreibt redacted_body fuer SLC-167.
7. **Stage-Detail-View pro Run** (Threads-Count + Redact-Status) + RLS-Test-Erweiterung.

Output: alle content+unclear-Emails sind klassifiziert + GF-approved, alle Threads sind gebildet + PII-redacted. SLC-167 kann Pattern-Extraktion-Pass starten.

## In Scope

- **`src/lib/ai/bedrock-haiku/index.ts`** — Bedrock-Client-Erweiterung fuer Haiku-Modell mit eu-central-1 + Strict-JSON-Schema-Validator
- **`src/lib/ai/bedrock-haiku/types.ts`** — `HaikuPromptRequest` + `HaikuClassificationResponse` + `HaikuPiiRedactRequest`/Response TypeScript-Interfaces
- **`src/lib/ai/bedrock-haiku/__tests__/index.test.ts`** — Vitest mit Mock-Bedrock-Client (kein Live-Call) + Region-Pflicht-Test
- **`src/lib/bulk-email/pre-filter/labels.ts`** — Konstante mit 6 kanonischen Labels + JSON-Schema fuer Strict-Output
- **`src/lib/bulk-email/pre-filter/prompt.ts`** — System-Prompt + V9_PRE_FILTER_PROMPT_VERSION (`"v1"`)
- **`src/workers/bulk-email/handle-pre-filter-job.ts`** — Worker: Batch von 50 Emails pro Bedrock-Call, Strict-JSON-Klassifikation, ai_cost_ledger feature=`email_bulk_pre_filter`, Confidence <0.6 → `unclear`
- **`src/workers/handle-job.ts`** — Dispatch fuer `email_bulk_pre_filter` + `email_bulk_thread_redact`
- **`src/app/dashboard/bulk-email-import/[run_id]/filter-review/page.tsx`** — Filter-Review-UI mit Counts, Pro-Email-Korrektur-Dropdown, Bulk-Reclassify-Selektion, Approval-Button
- **`src/app/dashboard/bulk-email-import/[run_id]/filter-review/actions.ts`** — Server-Action `updateEmailClassifications(updates)` + `approvePreFilterAndStartThreadRedact(run_id)`
- **`src/lib/bulk-email/thread-aggregation.ts`** — Pure-Function `aggregateThreads(emails): EmailThread[]` per RFC-5322-Headers, Edge-Cases
- **`src/lib/bulk-email/__tests__/thread-aggregation.test.ts`** — Vitest mit synthetischen Email-Arrays (Single-Email, Multi-Reply, Reply-Loop, Forward-Chain)
- **`src/lib/ai/pii-patterns/email-adapter.ts`** — Wrapper: extractParticipantMap(headers) → Map P1/P2/...; stripSignature(bodyText) → cleaned + bound-RegExp fuer `--`/`Mit freundlichen Gruessen`/`Best regards`; replaceParticipantsInBody(bodyText, map) → redacted
- **`src/lib/ai/pii-patterns/__tests__/email-adapter.test.ts`** — Vitest mit 3 Cases (Standard-Email, Multi-Reply-Thread, Forward-Chain)
- **`src/workers/bulk-email/handle-thread-redact-job.ts`** — Worker: kombiniert Thread-Aggregation + PII-Redaction in einem Job, Bedrock-Haiku-Call mit V5-PII-Prompt auf cleaned bodyText, INSERT email_thread + UPDATE email_message.thread_id + pii_redacted=true
- **`src/app/dashboard/bulk-email-import/[run_id]/page.tsx`** Erweiterung — Stage-Detail-View Threads + PII-Redact-Status
- **RLS-Test-Erweiterung** in bestehender `__tests__/rls/v9-bulk-email.rls.test.ts`: SELECT/UPDATE auf email_thread + pii_redacted-Flag, 8+ neue Cases
- **`ai_cost_ledger`-Spalten**: `feature='email_bulk_pre_filter'` (Pre-Filter-Calls), `feature='email_bulk_pii_redact'` (V5-PII-Calls auf Email-Adapter)

## Out of Scope

- **Pattern-Extraktion (Sonnet)** — SLC-167
- **Curation-UI** — SLC-167
- **Cost-Cap-Pre-Approval-Modal** — SLC-167
- **Handbuch-Integration** — SLC-168
- **Custom-Klassifikations-Schema pro Tenant** (V9.2+, DEC-184)
- **Multi-Sprachen-PII-Patterns ueber V5-Stand hinaus** (V9.1+, DEC-176)
- **Cross-Bulk-Run-Thread-Merge** (V9.1+, FEAT-072 Out-of-Scope)
- **Manuelle Thread-Korrektur** (V9.1+)
- **Anhang-Inhalts-Redaction** (V9.1+, FEAT-072 Out-of-Scope)
- **Learning-Loop von GF-Korrektur** (V10+, FEAT-071 Out-of-Scope)
- **Spam-Detection** (V9.1+ — `private` + `newsletter` reichen V9.0)

## Pre-Conditions

- ✓ SLC-165 COMPLETE (alle 7 MTs, Foundation + Upload + Parser LIVE)
- ✓ `email_message` + `email_thread`-Tabellen existieren mit RLS (MIG-051)
- ✓ Bedrock-Adapter-Foundation existiert (V8.1 SLC-161-Pattern als Reuse-Anker)
- ✓ V5-PII-Pattern-Library existiert (`src/lib/ai/pii-patterns/` SLC-076..078 deployed)
- ✓ Test-Email-Corpus aus SLC-165 MT-1 mit echten Token-Counts validiert
- ⏳ **Worktree `v9-bulk-email-import`** weiter aktiv

## Micro-Tasks

### MT-1: Bedrock-Haiku-Adapter
- **Goal**: `src/lib/ai/bedrock-haiku/` Adapter mit Strict-JSON-Output-Support, Region-Pflicht eu-central-1.
- **Files**:
  - `src/lib/ai/bedrock-haiku/index.ts` (NEU)
  - `src/lib/ai/bedrock-haiku/types.ts` (NEU)
  - `src/lib/ai/bedrock-haiku/__tests__/index.test.ts` (NEU, Mock-Bedrock-Client)
- **Expected behavior**:
  - `invokeHaiku<TResponse>(prompt, schema, options): Promise<TResponse>` — generischer Wrapper
  - Region hardcoded auf `eu-central-1` (CI-Test prueft das)
  - Strict-JSON-Schema-Validation post-Call (zod oder ajv)
  - Bei Schema-Drift: throw `HaikuSchemaError` + Audit-Entry
  - Modell-ID via ENV `BEDROCK_V9_HAIKU_MODEL_ID` (Default `anthropic.claude-3-haiku-20240307-v1:0`)
- **Verification**: Vitest mit Mock-Bedrock-Client: (a) Region-Header eu-central-1 verifiziert, (b) Schema-Pass-Case returnt typed TResponse, (c) Schema-Fail-Case throws + Audit-Entry.
- **Dependencies**: SLC-165 COMPLETE

### MT-2: Pre-Filter Labels + Prompt + Worker
- **Goal**: 6-Label-Klassifikations-Schema + Worker `email_bulk_pre_filter` mit Batch-Processing.
- **Files**:
  - `src/lib/bulk-email/pre-filter/labels.ts` (NEU, Konstante + JSON-Schema)
  - `src/lib/bulk-email/pre-filter/prompt.ts` (NEU, System-Prompt + V9_PRE_FILTER_PROMPT_VERSION)
  - `src/workers/bulk-email/handle-pre-filter-job.ts` (NEU)
  - `src/workers/handle-job.ts` (UPDATE — Dispatch)
  - `src/lib/bulk-email/pre-filter/__tests__/prompt.test.ts` (NEU)
  - `src/workers/bulk-email/__tests__/handle-pre-filter-job.test.ts` (NEU, Vitest gegen Coolify-DB mit Mock-Bedrock)
- **Expected behavior**:
  - Worker liest email_message WHERE bulk_run_id=X AND pre_filter_label IS NULL
  - Batch von 50 → Haiku-Call mit Strict-JSON-Schema-Output (Array von {message_id, label, confidence})
  - Pro Email: UPDATE email_message.pre_filter_label + pre_filter_confidence
  - Confidence <0.6 → label='unclear' (Default-Schwelle DEC, ENV-overridable `V9_PRE_FILTER_CONFIDENCE_THRESHOLD`)
  - INSERT ai_cost_ledger Entry pro Bedrock-Call mit feature='email_bulk_pre_filter', region='eu-central-1', model_id, tokens_in/out, cost_eur
  - UPDATE email_bulk_run: status='pre_filtering' am Anfang, status='pre_filtered' + pre_filter_cost_eur=SUM am Ende
  - Bei Bedrock-Fail: status='failed' + failure_reason='haiku_pre_filter_error'
- **Verification**: Vitest gegen Coolify-DB mit Mock-Bedrock:
  - 150 Emails → 3 Bedrock-Batches → 150 email_message-Updates + 3 ai_cost_ledger-Entries
  - Confidence 0.5 → label='unclear' (Override)
  - Bedrock-Mock-Fail → status='failed' + failure_reason gesetzt
- **Dependencies**: MT-1

### MT-3: Filter-Review-UI + Server-Actions
- **Goal**: UI fuer GF-Klassifikations-Review + Bulk-Reclassify + Approval-Button (GF-Gate 1).
- **Files**:
  - `src/app/dashboard/bulk-email-import/[run_id]/filter-review/page.tsx` (NEU)
  - `src/app/dashboard/bulk-email-import/[run_id]/filter-review/actions.ts` (NEU)
  - `src/app/dashboard/bulk-email-import/[run_id]/filter-review/__tests__/actions.test.ts` (NEU, Vitest gegen Coolify-DB)
- **Expected behavior**:
  - UI zeigt Klassifikations-Counts (z.B. "342 Emails: 87 content, 200 short_reply, 35 notification, 18 newsletter, 0 private, 2 unclear")
  - Filter-Dropdown nach Label
  - Pro-Email-Detail-Card mit Klassifikation + Confidence + Korrektur-Dropdown
  - Bulk-Reclassify-Selektion via Checkbox-Multi-Select (z.B. "alle unclear → content")
  - Approval-Button "Pre-Filter approved → weiter zu Thread-Aggregation"
  - Server-Action `updateEmailClassifications(updates: { message_id, new_label }[])`: UPDATE email_message.pre_filter_label + SET pre_filter_corrected=true; Audit via Touch updated_at
  - Server-Action `approvePreFilterAndStartThreadRedact(bulk_run_id)`: enqueue `email_bulk_thread_redact` Worker-Job
- **Verification**: Vitest:
  - updateEmailClassifications(50-Updates) → 50 email_message UPDATEs + corrected=true
  - approvePreFilterAndStartThreadRedact → 1 neuer ai_jobs-Row mit type='email_bulk_thread_redact'
  - RLS: tenant_member kann NICHT updateEmailClassifications ausfuehren (Cross-Test)
- **Dependencies**: MT-2

### MT-4: Thread-Aggregation Pure-Function
- **Goal**: `aggregateThreads(emails): EmailThread[]` per RFC-5322 Headers, Edge-Cases.
- **Files**:
  - `src/lib/bulk-email/thread-aggregation.ts` (NEU)
  - `src/lib/bulk-email/__tests__/thread-aggregation.test.ts` (NEU)
- **Expected behavior**:
  - Input: `email_message[]` mit `message_id`, `in_reply_to`, `references_array`, `subject`, `date`
  - Output: `EmailThread[]` mit `root_message_id`, `subject`, `email_count`, `first_date`, `last_date`, `message_ids[]`
  - Algorithmus: Map<message_id, email> + Iterate-zur-Root-via-in_reply_to-Pointer; Fallback auf references[0] wenn in_reply_to fehlt; Single-Email-Threads als 1-Email-Thread
  - Edge-Cases:
    - Reply-Loop (zirkulaer): max 100 Iterationen pro Thread, dann hart abbrechen + Thread-Status='aggregated' bleibt (kein Crash)
    - Forward-Chain (`Fwd:` subject): bleibt separate Threads (kein Auto-Join)
    - Fehlende References: Single-Email-Thread
- **Verification**: Vitest mit synthetischen Email-Arrays:
  - 5 Emails, 1 Konversation → 1 Thread mit 5 Emails
  - 5 Emails ohne Reply-Relation → 5 Single-Email-Threads
  - Reply-Loop (Email A → B → A) → 1 Thread mit hartem Cut nach 100
  - Forward-Chain → 2 separate Threads
- **Dependencies**: keine (Pure-Function, kein DB-Access)

### MT-5: PII-Email-Adapter
- **Goal**: V5-PII-Pipeline-Wrapper mit Email-Spezial-Pre-Processing per DEC-176.
- **Files**:
  - `src/lib/ai/pii-patterns/email-adapter.ts` (NEU)
  - `src/lib/ai/pii-patterns/__tests__/email-adapter.test.ts` (NEU)
- **Expected behavior**:
  - `extractParticipantMap(emails: email_message[]): ParticipantMap` — sammelt alle from+to+cc-Adressen, mappt zu `P1`, `P2`, ... (GF-eigene Adresse zuerst wenn erkennbar via Tenant-Domain-Match)
  - `stripSignature(bodyText: string): string` — entfernt Signatur-Block via RegExp-Trigger (`^--\s*$`, `Mit freundlichen Gruessen`, `Best regards`, `Viele Gruesse`, `Beste Gruesse`) + 3 Folge-Lines
  - `replaceParticipantsInBody(bodyText: string, map: ParticipantMap): string` — ersetzt alle Email-Adressen + bekannte Namen aus Map durch Pseudonyme
  - `redactEmailThread(thread: EmailThread, emails: email_message[]): { participantMap, redactedBody }` — orchestriert obigen Steps + ruft V5-Bedrock-Haiku-PII-Pipeline auf cleaned bodyText (mit V5-Walkthrough-PII-Prompt + neuem Email-spezifischen Hint)
- **Verification**: Vitest mit 3 Cases:
  - Standard-Email mit "--\nMax Mustermann\nGF\nmuster@firma.de" → Signatur entfernt
  - Multi-Reply-Thread: P1=Kunde, P2=GF konsistent ueber alle 5 Emails
  - Forward-Chain: Pseudonyme bleiben konsistent ueber Hop-Boundaries
  - V5-Bedrock-Mock-Call returnt redacted text mit Pseudonymen statt Klarnamen
- **Dependencies**: MT-1 (Bedrock-Haiku-Adapter fuer V5-PII-Call), Reuse V5 SLC-076..078 PII-Pattern-Library

### MT-6: Worker `email_bulk_thread_redact`
- **Goal**: Worker kombiniert Thread-Aggregation (MT-4) + PII-Redaction (MT-5) in einem Job.
- **Files**:
  - `src/workers/bulk-email/handle-thread-redact-job.ts` (NEU)
  - `src/workers/bulk-email/__tests__/handle-thread-redact-job.test.ts` (NEU, Vitest gegen Coolify-DB mit Mock-Bedrock)
- **Expected behavior**:
  - Worker liest email_message WHERE bulk_run_id=X AND pre_filter_label IN ('content', 'unclear')
  - Thread-Aggregation per MT-4 → Array EmailThread
  - INSERT email_thread Rows + UPDATE email_message.thread_id per FK
  - PII-Redaction per MT-5 pro Thread → UPDATE email_thread.participant_pseudonyms + redacted_body + thread_status='redacted'
  - UPDATE email_message.pii_redacted=true pro Thread-Member
  - INSERT ai_cost_ledger pro V5-PII-Bedrock-Call mit role='email_bulk_pii_redact'
  - UPDATE email_bulk_run: status='thread_redacting' am Anfang, status='thread_redacted' + thread_count=N am Ende
  - Bei Bedrock-Fail: status='failed' + failure_reason='thread_redact_error', betroffener email_thread.thread_status='failed'
- **Verification**: Vitest gegen Coolify-DB mit Mock-Bedrock:
  - 89 content+unclear Emails → 42 email_thread-Rows + 89 email_message-Updates (thread_id + pii_redacted)
  - redacted_body enthaelt KEINE Email-Adressen, KEINE Klarnamen (Pattern-Scan)
  - participant_pseudonyms-JSONB enthaelt korrekte Anzahl
  - Re-Run idempotent: bestehende email_thread werden skipped (WHERE bulk_run_id NOT IN bestehende)
- **Dependencies**: MT-4, MT-5

### MT-7: Stage-Detail-View Erweiterung + RLS-Test-Erweiterung
- **Goal**: Bulk-Run-Detail-View aus SLC-165 MT-6 erweitern um Thread-Count + Redact-Status + Filter-Review-Link. RLS-Tests fuer email_thread.
- **Files**:
  - `src/app/dashboard/bulk-email-import/[run_id]/page.tsx` (UPDATE)
  - `__tests__/rls/v9-bulk-email.rls.test.ts` (UPDATE — +8 RLS-Cases fuer email_thread: 3 Sensitive-Spalten-Read + 3 Status-Transitions + 2 Default-Deny)
- **Expected behavior**:
  - Detail-View zeigt jetzt: Threads (X aus Y content+unclear Emails), Redact-Status (X/Y abgeschlossen), Link zu Filter-Review-UI bei status='pre_filtered'
  - Polling-Loop weiter aktiv fuer Live-Progress
  - RLS-Test-Erweiterung: tenant_admin SELECT own email_thread, tenant_member KEIN SELECT, Cross-Tenant-Read blockiert, strategaize_admin Cross-Tenant SELECT
- **Verification**: Vitest 8+ RLS-Cases GREEN. Manuell-Smoke-Test in Browser zeigt Threads-Count nach Approval.
- **Dependencies**: MT-6

### MT-8: SLC-166 Records-Update + Commit
- **Goal**: slices/INDEX.md SLC-166 `planned → in_progress`. features/INDEX.md FEAT-071 + FEAT-072 `planned → in_progress`. planning/backlog.json BL-148 + BL-149 bleiben in_progress. SLC-166 commit-Bundle pruefen.
- **Files**:
  - `slices/INDEX.md` (UPDATE)
  - `features/INDEX.md` (UPDATE)
  - `planning/backlog.json` (UPDATE wenn nicht schon)
- **Expected behavior**: Status-Updates wie spec.
- **Verification**: `grep "in_progress" slices/INDEX.md | grep SLC-166` matched.
- **Dependencies**: MT-7

## Acceptance Criteria

- **AC-SLC-166-1**: Bedrock-Haiku-Adapter erzwingt eu-central-1 (Region-Test in Vitest).
- **AC-SLC-166-2**: 1000 Emails durchlaufen Pre-Filter in <10 Minuten Worker-Zeit (Worker-Tier-Default).
- **AC-SLC-166-3**: Cost pro 1000 Emails Pre-Filter <0.20 EUR (Validierung gegen Test-Corpus aus SLC-165 MT-1).
- **AC-SLC-166-4**: GF sieht Klassifikations-Counts ("X content, Y short_reply, ...") nach Pre-Filter-Completion.
- **AC-SLC-166-5**: GF kann pro Email die Klassifikation per Dropdown korrigieren (pre_filter_corrected=true).
- **AC-SLC-166-6**: GF kann Bulk-Reclassify ausfuehren (z.B. "alle unclear → content").
- **AC-SLC-166-7**: Approval-Button setzt Bulk-Run-Status `pre_filtered` und triggert `email_bulk_thread_redact`-Worker-Job.
- **AC-SLC-166-8**: Thread-Aggregation erzeugt korrekte Threads via RFC-5322-Headers, Single-Email-Threads + Reply-Loops + Forward-Chains alle korrekt behandelt.
- **AC-SLC-166-9**: PII-Redaction entfernt Klarnamen + Email-Adressen + Telefonnummern aus body_text (Stichprobe 10% Threads in /qa).
- **AC-SLC-166-10**: Participant-Pseudonyms-Map persistiert pro Thread, redacted_body Pseudonym-konform.
- **AC-SLC-166-11**: ai_cost_ledger erhaelt Entries pro Bedrock-Call (Pre-Filter + V5-PII) mit Provider, Modell, Token-Count, Cost. Region wird implizit ueber den MODEL_ID-Prefix `eu.` kodiert (Bedrock Cross-Region-Inference-Konvention) — ai_cost_ledger hat keine separate `region`-Spalte. Pattern-Parallel zu V5-Walkthrough-Worker (MIG-035 Schema).
- **AC-SLC-166-12**: Confidence < 0.6 markiert Emails als `unclear` (ENV-overridable).
- **AC-SLC-166-13**: Bedrock-Fail markiert Run/Thread als `failed`, GF kann Re-Try ausloesen ohne Doppel-Charge.
- **AC-SLC-166-14**: Tenant-RLS verhindert Cross-Tenant-Read auf email_thread + participant_pseudonyms.
- **AC-SLC-166-15**: TypeScript-Compile EXIT=0, ESLint EXIT=0, alle Vitest-Tests GREEN.

## Notable Risks / Dependencies

- **R1**: Haiku-Strict-JSON-Output kann bei einzelnen Emails Schema-Drift erzeugen. Pflicht: post-Validation + Fallback auf `unclear`-Label statt Crash.
- **R2 (DEC-176)**: V5-PII-Pipeline ist auf Walkthrough-Transkripte zugeschnitten — Email-spezifische Patterns (Signaturen, Email-Adressen-Headers) muessen via Adapter-Wrapper vor V5-Call rein. MT-5 ist Hauptrisiko: wenn Pre-Processing Patterns nicht ausreichen, leaken Klarnamen nach Sonnet (SLC-167). /qa Pflicht-Pattern-Scan auf redacted_body in MT-7.
- **R3**: Worker-Crash mid-Thread-Aggregation kann partielle email_thread + thread_id-Updates hinterlassen. Idempotenz via `WHERE bulk_run_id NOT IN (bestehende thread_ids)` in MT-6.
- **R4 (DEC-178)**: Async-Pipeline mit GF-Gate zwischen Pre-Filter und Thread-Redact: GF kann theoretisch Filter-Review aufheben + neu starten. UI muss Approval-Button disablen wenn status NICHT `pre_filtered`. Race-Condition-Schutz.
- **R5**: Forward-Chain-Detection per Subject `Fwd:` ist nicht 100% zuverlaessig (sprachabhaengig). V9.0 akzeptiert false-positives als separate Threads. V9.1+ kann verbessern.
- **R6**: Reply-Loops sind extrem selten (~0.01% laut Discovery-Schaetzung), aber hart-Cut nach 100 muss verifiziert werden in MT-4-Test.
- **D1**: Hard-Dependency auf V5 SLC-076..078 PII-Pattern-Library deployed (Reuse-Anker).
- **D2**: Hard-Dependency auf SLC-165 Schema + Storage + Worker-Foundation.
- **D3**: Bedrock-Haiku Modell-ID muss in eu-central-1 verfuegbar sein (Stand 2026-06: ja, Anthropic Claude 3 Haiku in eu-central-1 GA).

## Worktree

- **Branch**: `v9-bulk-email-import` (gleicher Cumulative-Branch wie SLC-165)
- **Path**: `c:/strategaize/strategaize-onboarding-plattform-v9`

## Next After SLC-166

**SLC-167 — V9 Pattern-Extraktion (Sonnet) + Curation-UI + Cost-Cap** (FEAT-073). Konsumiert email_thread.redacted_body aus SLC-166, fuehrt Sonnet-Pattern-Extraktion-Pass durch + Curation-UI fuer GF + Cost-Cap-Logik.
