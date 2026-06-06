# OP V9 SLC-167 MT-3 + MT-4 — Pre-Read

**Stand:** 2026-06-04
**Zweck:** Pflicht-Read vor MT-3 + MT-4 Implementation (Cost-Estimate + Cost-Cap-Service + Pre-Approval-UI)
**Worktree:** `c:/strategaize/strategaize-onboarding-plattform-v9` Branch `v9-bulk-email-import` HEAD `bd9d80e`

## Zusammenfassung

SLC-167 ist 2/7 MTs done (MT-1 MIG-054/109 Security-Hotfix LIVE + MT-2 Bedrock-Sonnet-Adapter Vitest 23/23 PASS). Naechster Schritt MT-3 (Cost-Estimate + Cost-Cap-Service) + MT-4 (Pre-Approval-Modal + Server-Action). Pattern-Reuse-Quelle: V8.1 SLC-161 `src/lib/llm/v8-1-augmentation/augment.ts` Cost-Cap-Loop. Pre-Conditions Code-Side alle erfuellt. ENV-Setup auf Coolify (User-Pflicht) blockiert MT-4 LIVE-Test nicht MT-3-Code.

Bundle dieser HTML:
- Resume-Stand (Memory)
- Slice-Spec SLC-167 mit Fokus MT-3 + MT-4
- RPT-406 (MT-1 Details)
- RPT-407 (MT-2 Details)
- augment.ts Pattern-Quelle (V8.1 Cost-Cap-Loop)

## Resume-Stand

**Worktree:** `c:/strategaize/strategaize-onboarding-plattform-v9` Branch `v9-bulk-email-import` HEAD `bd9d80e` (gepusht).

**Commits (2 atomic per git-release.md):**
- `ff42e36` feat(SLC-167/MT-1): MIG-054/109 vw_bulk_email_cost_monthly Security-Hotfix + Vitest 7/7 PASS
- `bd9d80e` feat(SLC-167/MT-2): Bedrock-Sonnet Email-Pattern-Adapter + Mock-Bedrock Vitest 23/23 PASS

**Records-State (per IMP-950 Defense):**
- SLC-167 `in_progress`
- FEAT-073 `in_progress`
- BL-150 `in_progress`
- V9 `active`
- MIG-054 NEU in MIGRATIONS.md mit `applied 2026-06-04`
- ISSUE-090 eroeffnet + sofort `resolved` (RLS-Bypass MIG-051/106 durch MIG-054/109 gefixt)

### Pre-Conditions fuer MT-3

| Pre-Condition | Status |
|---|---|
| MIG-054/109 View LIVE auf Coolify-DB | DONE (MT-1) |
| Sonnet-Adapter mit Pricing-Konstanten | DONE (MT-2) |
| V8.1 Cost-Cap-Pattern als Reuse-Anker | verfuegbar in `src/lib/llm/v8-1-augmentation/augment.ts` |
| ENV-Setup auf Coolify (User-Pflicht) | offen — blockiert MT-4 LIVE-Test nicht MT-3-Code-Side: `BEDROCK_V9_SONNET_MODEL_ID`, `V9_BULK_EMAIL_RUN_CAP_EUR=20`, `V9_BULK_EMAIL_TENANT_MONTH_CAP_EUR=100`, `V9_BULK_EMAIL_PRE_APPROVAL_THRESHOLD_EUR=10` |

### Forbidden Shortcuts (BLOCKING per IMP-950)

- SLC-167 nicht `done` setzen (5/7 MTs offen)
- V9 nicht `released` setzen (4 Slices noch zu liefern: SLC-167 5 MTs + SLC-168)
- V9-Master-Merge nicht vor SLC-168 done (Cumulative-Branch-Pflicht per Slice-Plan)
- Memory schreiben "V9 released/stable" verboten ohne `/go-live` + `/post-launch`

### Next Session Resume Point

**Primary:** MT-3 (`src/lib/bulk-email/cost-estimate.ts` + `cost-cap.ts`) starten. Pattern-Quelle V8.1 SLC-161 `augment.ts` Cost-Cap-Loop. Vitest gegen Coolify-DB fuer `checkTenantMonthlyCap` (View-Lookup auf MIG-054/109). ca. 3-4 Stunden Code-Side.

**Bundle-Plan:** MT-3 + MT-4 in einer Session (ca. 1-1.5 Tage Code-Side). MT-4 = Pre-Cost-Estimate-Page + Pre-Approval-Modal + Server-Action.

## Slice-Spec SLC-167 (Auszug, Fokus MT-3 + MT-4)

**Version:** V9
**Feature:** FEAT-073 (Pattern-Extraktion Sonnet + Curation-UI)
**Backlog:** BL-150
**Priority:** High
**Estimate:** ca. 5-7 MTs, ca. 4-5 Tage Code-Side

### Slice Goal

Liefert den eigentlichen Wert-Hebel der V9-Pipeline: KI-Pattern-Extraktion + GF-Curation + Cost-Cap-Enforcement.

1. **Bedrock-Sonnet-Adapter** (MT-2 DONE)
2. **Pre-Cost-Estimate-Service** (MT-3): Token-Count-Heuristik pro Thread + EUR-Cost-Berechnung basierend auf Sonnet-Tarif.
3. **Cost-Cap-Service** (MT-3, Reuse V8.1 FEAT-069-Pattern): Soft-Cap pro Run (20 EUR), Hard-Cap pro Tenant/Monat (100 EUR), Pre-Approval-Schwelle (10 EUR), alle ENV-overridable (DEC-182).
4. **Pre-Approval-Modal** (MT-4) mit Token-Count-Anzeige + Cost-Estimate + Bestaetigung (GF-Gate 2).
5. **email_bulk_pattern_extraction Worker** (MT-5)
6. **Curation-UI** (MT-6)
7. **Vitest Cost-Cap + Curation-Actions + RLS** (MT-7)

### MT-3: Pre-Cost-Estimate + Cost-Cap-Service

**Goal:** Cost-Estimate-Pure-Function + Cost-Cap-Service-Layer mit allen 4 Check-Methoden.

**Files:**
- `src/lib/bulk-email/cost-estimate.ts` (NEU)
- `src/lib/bulk-email/cost-cap.ts` (NEU)
- `src/lib/bulk-email/__tests__/cost-estimate.test.ts` (NEU)
- `src/lib/bulk-email/__tests__/cost-cap.test.ts` (NEU, Vitest gegen Coolify-DB)

**Expected behavior:**
- `estimateBulkRunPatternCost(threads): { tokensIn, tokensOut, costEur }`
  - Heuristik: `tokensIn = sum(redacted_body.length / 4) + Prompt-Overhead`
  - `tokensOut = threads.length * 800` (avg Pattern-Output)
  - `costEur = (tokensIn * SONNET_INPUT_PRICE + tokensOut * SONNET_OUTPUT_PRICE) * EUR_USD_RATE`
- `checkRunCap(estimateEur, runCapEur): boolean`
- `checkTenantMonthlyCap(tenantId, estimateEur, hardCapEur, supabaseClient): Promise<{ allowed, currentMonthEur, remainingEur }>`
- `checkPreApprovalThreshold(estimateEur, thresholdEur): boolean`
- `checkLiveCapInWorker(runId, capEur, supabaseClient): Promise<{ exceeded, currentEur }>`
- Reuse V8.1 FEAT-069-Pattern fuer ai_cost_ledger-Lookup

**Verification:** Vitest 3 Cases:
- 100-Thread-Run mit kleinem redacted_body, estimate 0.5 EUR, alle Checks PASS
- 1000-Thread-Run mit grossem redacted_body, estimate 25 EUR, runCap-Block (ueber 20)
- Tenant hat im aktuellen Monat schon 95 EUR verbraucht + 10 EUR estimate, `checkTenantMonthlyCap` rejects (ueber 100)
- `checkLiveCapInWorker`: SELECT SUM(cost_eur) FROM ai_cost_ledger WHERE bulk_run_id=X funktioniert mit Vitest-Mock

**Dependencies:** MT-1 (View)

### MT-4: Pre-Cost-Estimate-Page + Pre-Approval-Modal + Server-Action

**Goal:** UI fuer GF-Cost-Estimate-Review + Pre-Approval-Modal + Server-Action `startPatternExtraction`.

**Files:**
- `src/app/dashboard/bulk-email-import/[run_id]/pattern-start/page.tsx` (NEU)
- `src/app/dashboard/bulk-email-import/[run_id]/pattern-start/actions.ts` (NEU)
- `src/app/dashboard/bulk-email-import/[run_id]/pattern-start/__tests__/actions.test.ts` (NEU)

**Expected behavior:**
- Page liest `email_thread.redacted_body` fuer aktuelle Bulk-Run, ruft `estimateBulkRunPatternCost` auf, zeigt Token-Count + EUR-Cost-Estimate
- Wenn `estimateEur > V9_BULK_EMAIL_PRE_APPROVAL_THRESHOLD_EUR` (10 EUR): Modal mit "Erwartete Kosten: X EUR. Fortfahren?"
- Wenn `estimateEur > V9_BULK_EMAIL_RUN_CAP_EUR` (20 EUR): Block mit Fehlermeldung "Run-Limit ueberschritten" (Status bleibt `thread_redacted`)
- Wenn Tenant-Monatscap erreicht: Block mit Fehlermeldung "Tenant-Monatslimit erreicht"
- Server-Action `startPatternExtraction(bulk_run_id, preApprovalGranted)`:
  - Re-Check alle 3 Caps server-side (UI-Check ist Convenience, Server-Check ist Sicherheit)
  - Enqueue `ai_jobs`-Row mit `type='email_bulk_pattern_extraction'`
  - UPDATE `email_bulk_run.status='pattern_extracting'`

**Verification:** Vitest gegen Coolify-DB:
- Estimate unter Pre-Approval-Schwelle, kein Modal-Anzeige, Direkt-Enqueue
- Estimate ueber Pre-Approval-Schwelle ohne `preApprovalGranted`, Action throws `PreApprovalRequiredError`
- Estimate ueber Pre-Approval-Schwelle mit `preApprovalGranted`, Direkt-Enqueue
- Estimate ueber Run-Cap, Action throws `RunCapExceededError` immer
- Tenant-Monatscap erreicht, Action throws `TenantMonthlyCapError`

**Dependencies:** MT-3

### Acceptance Criteria (Auszug fuer MT-3 + MT-4)

- **AC-SLC-167-2**: Pre-Cost-Estimate-Modal erscheint bei `estimateEur > 10 EUR` (Pflicht-Vitest)
- **AC-SLC-167-3**: Run-Cap-Check blockt Run bei `estimateEur > 20 EUR` mit klarer Fehlermeldung
- **AC-SLC-167-4**: Hard-Cap pro Tenant pro Monat blockt weitere Runs bei `>100 EUR` Monatssumme
- **AC-SLC-167-6**: Cost pro 1000 Emails Pattern-Extraktion unter 8 EUR (Sonnet-Bedrock-Schaetzung)

### Notable Risks

- **R1 (DEC-179)**: Wenn Cost-Validation aus SLC-165 MT-1 Faktor-2-Abweichung zeigt: `V9_BULK_EMAIL_RUN_CAP_EUR` (20) ist zu eng. ENV-Override-Pattern erlaubt Adjust ohne Code-Change, aber Architektur-Update + DEC-187 muss in MT-3 dokumentiert werden.

## RPT-406 (MT-1 Details)

**Skill:** /backend, **Slice:** SLC-167, **Feature:** FEAT-073, **Datum:** 2026-06-04

### Outcome

MT-1 (MIG-054/109 vw_bulk_email_cost_monthly View) DONE.

- Migration SQL geschrieben (`109_v9_bulk_email_cost_view.sql`, 71 Zeilen)
- LIVE applied auf Coolify-Postgres `supabase-db-bwkg80w04wgccos48gcws8cs-084548596447` via base64+ssh+psql-postgres-Pattern (sql-migration-hetzner.md)
- View ist Schema-konform: `month date`, `total_cost_eur numeric(12,4)`, `run_count integer`, Options: `security_invoker=true`
- Vitest gegen Coolify-DB: 7/7 PASS in 247ms via node:22-Sidecar im `bwkg80w04wgccos48gcws8cs_strategaize-net`

### Sicherheitsfund (ISSUE-090)

Pre-Migration-Inspection zeigte: die View existierte bereits aus MIG-051/106 OHNE `security_invoker = true`. Default-PostgreSQL-Verhalten: View laeuft mit Owner-Privilegien (postgres = Superuser = BYPASSRLS), tenant_admin-Caller haetten Cross-Tenant-Cost-Aggregate gesehen.

MIG-054/109 droppt die alte Variante und ersetzt sie durch RLS-konforme + getyptes Schema.

### Files created

- `/sql/migrations/109_v9_bulk_email_cost_view.sql` — MIG-054 Security-Hotfix mit DROP + CREATE VIEW WITH (security_invoker = true) + GRANTs an authenticated/service_role. Idempotent, BEGIN/COMMIT-atomar.
- `/src/__tests__/migrations/109-v9-bulk-email-cost-view.test.ts` — 7 Vitest-Tests: 3 Schema-Existence + 4 Aggregation
- `/reports/RPT-406.md`

### Probleme

- **ISSUE-090 RLS-Bypass auf vw_bulk_email_cost_monthly (MIG-051/106)** — eroeffnet + sofort durch MIG-054/109 resolved
- **First-Run-Test-Failure 4/7 FAIL, dann 7/7 PASS:** Erste Test-Iteration scheiterte mit `handle_new_user: tenant_id required for role tenant_admin`-Trigger. Fix: `raw_user_meta_data` muss `tenant_id` + `role` enthalten.

## RPT-407 (MT-2 Details)

**Skill:** /backend, **Slice:** SLC-167, **Feature:** FEAT-073, **Datum:** 2026-06-04

### Outcome

MT-2 (Bedrock-Sonnet Email-Pattern-Extraktion-Adapter) DONE.

Vollstaendige Implementation des Sonnet-Adapters fuer V9-Pattern-Extraktion mit Strict-JSON-Output-Schema, Test-Injection-Pattern und Region-Hardcoding. Pattern-Reuse 1:1 aus `src/lib/ai/bedrock-haiku/` (V9 SLC-166 MT-1) mit Sonnet-spezifischen Erweiterungen.

### Quality-Gates GREEN

- Vitest: 23/23 PASS in 17ms (lokal via npx vitest run, pure-function ohne DB)
- TSC: EXIT=0 (npx tsc --noEmit)
- ESLint: 0 errors auf neuen `bedrock-sonnet/` + 109-test-File
- Full-Suite-Regression: 1502/2005 PASS (Differenz = 477 DB-Tests die TEST_DATABASE_URL brauchen, lokal erwartet ohne Sidecar). Keine Regression vs MT-1-Baseline.

### Implementations-Highlights

1. `PatternExtractionResultSchema` zod-Definition mit `themes`/`patterns`/`decisions`/`open_questions` + max 5 Pattern pro Thread (FEAT-073-Curation-Fatigue-Vermeidung) + confidence 0.0-1.0 + `suggested_section` String mit V4.1-Pfad-Konvention (DEC-181).
2. Sonnet 3.5 Pricing-Konstanten ($3 input / $15 output per 1M tokens via Bedrock eu-central-1), 12x teurer als Haiku, motiviert die strikte Cost-Cap-Logik in MT-3.
3. Thread-ID-Hallucination-Defense: Caller-vorgegebene `threadMeta.threadId` ueberschreibt das vom Modell ausgegebene `thread_id`-Feld nach JSON-Parse, vor zod-Validation.
4. Markdown-Codeblock-Strip defensiv: `extractJsonCandidate` strippt ` ```json ... ``` `-Wrapper bevor JSON.parse.
5. `__setSonnetCallerForTests` / `__resetSonnetCallerForTests` Test-Injection-Hook fuer Vitest ohne echte AWS-Calls.

### Files created (5 NEU)

- `/src/lib/ai/bedrock-sonnet/types.ts` (~110 LOC)
- `/src/lib/ai/bedrock-sonnet/email-pattern-prompt.ts` (~80 LOC)
- `/src/lib/ai/bedrock-sonnet/email-pattern.ts` (~200 LOC)
- `/src/lib/ai/bedrock-sonnet/index.ts` (~30 LOC)
- `/src/lib/ai/bedrock-sonnet/__tests__/email-pattern.test.ts` (~280 LOC, 23 Tests)

### Probleme

- **Pre-Existing Haiku-Adapter Test-Path-Bug** (kein neuer Bug, nur dokumentiert)
- **Sonnet-vs-Haiku Adapter-Generizitaet:** Haiku ist generisch (`invokeHaiku<T>`), Sonnet ist V9.0-spezifisch (`extractPatternFromThread`). Begruendung: aktuell genau 1 Sonnet-Caller. V9.1+ kann generisch umbauen wenn mehrere Sonnet-Konsumenten dazukommen. Akzeptiert per "Simplicity first".
- **TEST_DATABASE_URL-Warning bei pure-function-Test:** cosmetic noise, keine Funktions-Auswirkung.

## Pattern-Quelle V8.1: augment.ts (Cost-Cap-Loop)

Pfad in Worktree: `src/lib/llm/v8-1-augmentation/augment.ts` (auf v9-bulk-email-import-Branch, urspruenglich aus V8.1 SLC-161 MT-4).

**Was wiederverwendet werden soll:**
- Pricing-Konstanten-Pattern (Konstanten am File-Anfang, klar dokumentiert)
- `BedrockCallResult`-Interface mit `tokensIn`/`tokensOut`/`costUsd`/`latencyMs`/`modelId`
- Cost-Cap-Loop: `accumulatedCost >= costCap` Vorab-Check vor jedem LLM-Call, bei Cap-Hit fallback ohne Call
- Audit-Recording: `recordLlmCall` mit success/fail-Flag in `ai_cost_ledger`
- Test-Injection-Pattern: `BedrockCaller`-Type + `bedrockCaller`-Option mit Default-Production-Caller

**Was NICHT 1:1 zu uebernehmen ist:**
- Word-Count-Check + Tonality-Validation (V8.1-spezifisch fuer 80-Wort-Empfehlungstexte)
- `capture_session.metadata`-Cache-Pattern (V8.1-spezifisch, V9 hat keinen Cache per Slice-Spec)
- `chatWithLLM`-Caller (V9 nutzt direkten Sonnet-Adapter aus MT-2)

### Code-Auszug — Pricing-Konstanten + Default-Caller

```typescript
// ─── Pricing (Sonnet 3.5: $3/$15 per 1M tokens) ───
const COST_PER_INPUT_TOKEN = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000;

// ─── Defaults ───
const DEFAULT_MODEL_ID =
  process.env.BEDROCK_V8_1_MODEL_ID ||
  "anthropic.claude-3-5-sonnet-20241022-v2:0";
const DEFAULT_COST_CAP_USD = 0.05;
const DEFAULT_MAX_TOKENS = 200;
const DEFAULT_TEMPERATURE = 0.3;

export interface BedrockCallResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  modelId: string;
}

export type BedrockCaller = (args: {
  system: string;
  user: string;
  modelId: string;
}) => Promise<BedrockCallResult>;

const defaultBedrockCaller: BedrockCaller = async ({ system, user, modelId }) => {
  const start = Date.now();
  const text = await chatWithLLM(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: DEFAULT_TEMPERATURE, maxTokens: DEFAULT_MAX_TOKENS }
  );
  const latencyMs = Date.now() - start;
  const tokensIn = Math.ceil((system.length + user.length) / 4);
  const tokensOut = Math.ceil(text.length / 4);
  return {
    text,
    tokensIn,
    tokensOut,
    costUsd: tokensIn * COST_PER_INPUT_TOKEN + tokensOut * COST_PER_OUTPUT_TOKEN,
    latencyMs,
    modelId,
  };
};
```

### Code-Auszug — Cost-Cap-Loop (Vorab-Check vor jedem LLM-Call)

```typescript
const outputs: AugmentOutput[] = [];
let accumulatedCost = 0;
let allLlmSuccess = true;

for (const h of hebel) {
  // ─── Cost-Cap (vor LLM-Call) ───
  if (accumulatedCost >= costCap) {
    outputs.push(fallbackOutput(h, "cost_cap_hit"));
    allLlmSuccess = false;
    await recordLlmCall(supabaseAdmin, {
      tenantId,
      modelId,
      modulName: h.modulName,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      latencyMs: 0,
      success: false,
    });
    continue;
  }

  // ─── Bedrock-Call ───
  let callResult: BedrockCallResult;
  try {
    callResult = await bedrockCall({
      system: V8_1_SYSTEM_PROMPT,
      user: buildUserPromptForHebel(h),
      modelId,
    });
  } catch {
    outputs.push(fallbackOutput(h, "bedrock_error"));
    allLlmSuccess = false;
    await recordLlmCall(/* ... */);
    continue;
  }

  accumulatedCost += callResult.costUsd;

  // ─── Tonality / Word-Count / Success-Branches (V8.1-spezifisch, V9 ueberspringt) ───
  // ...

  await recordLlmCall(supabaseAdmin, {
    tenantId,
    modelId,
    modulName: h.modulName,
    tokensIn: callResult.tokensIn,
    tokensOut: callResult.tokensOut,
    costUsd: callResult.costUsd,
    latencyMs: callResult.latencyMs,
    success: true,
  });
}
```

### V9 MT-3 Adaption-Hinweise

1. **EUR statt USD:** V9 spec setzt Cost-Caps in EUR (DEC-182). `EUR_USD_RATE` als Konstante (z.B. 0.92) und `costEur = costUsd * EUR_USD_RATE`. Live-Rate aus Coolify-ENV (optional V9.1+).
2. **3 Cap-Schwellen statt einer:** `runCapEur` (20), `tenantMonthCapEur` (100), `preApprovalThresholdEur` (10). Alle 4 Check-Methoden in `cost-cap.ts`.
3. **Live-Cap-Check im Worker** (MT-5 spaeter): `checkLiveCapInWorker(runId, capEur, supabaseClient)` macht SELECT SUM(cost_eur) FROM ai_cost_ledger WHERE bulk_run_id=X. Pattern aus V8.1 ist Single-Session-Cap (akkumulierter in-Memory), V9 ist Cross-Session/DB-basiert.
4. **MIG-054/109 vw_bulk_email_cost_monthly** ist die Quelle fuer `checkTenantMonthlyCap`. Query: `SELECT total_cost_eur FROM vw_bulk_email_cost_monthly WHERE tenant_id=X AND month=date_trunc('month', now())`.
5. **Pre-Approval-Threshold-Check** ist Pure-Function: `checkPreApprovalThreshold(estimateEur, thresholdEur): boolean`. Kein DB-Call.

## Open Questions vor MT-3-Start

1. Wann passt der ca. 1-1.5-Tage-Slot fuer MT-3 + MT-4? Subagent-Orchestrierung empfohlen wegen Scope.
2. Bist du bereit, ENV-Setup auf Coolify vor MT-4 LIVE-Test zu machen?
   - `BEDROCK_V9_SONNET_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0`
   - `V9_BULK_EMAIL_RUN_CAP_EUR=20`
   - `V9_BULK_EMAIL_TENANT_MONTH_CAP_EUR=100`
   - `V9_BULK_EMAIL_PRE_APPROVAL_THRESHOLD_EUR=10`

## Alternativen Cross-Repo (falls V9-Pause)

- IS V4 SLC-126 V4-Closure-Bridge (ca. 3-4h)
- BS V8.10 T+24h Full-Check
- BS V8.11 /architecture (ca. 1-2h fresh Session)
- ImSch V3.2 SLC-323 /qa GESAMT-Slice-Set (ca. 2-3h)

## Quellen

- Memory: `project_op_v9_slc167_mt1_mt2_done_2026_06_04` in Dev-System
- Slice-Spec: `slices/SLC-167-v9-pattern-curation-cost-cap.md` (OP Repo, v9-Branch)
- Reports: `reports/RPT-406.md` + `reports/RPT-407.md` (OP Repo, v9-Branch)
- Pattern-Quelle: `src/lib/llm/v8-1-augmentation/augment.ts` (OP Repo, v9-Branch, urspruenglich V8.1 SLC-161)
