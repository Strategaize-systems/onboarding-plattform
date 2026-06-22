// V10 SLC-174 — Worker-Handler `module_output_synthesis` (FEAT-094, BL-513).
//
// Erzeugt pro Modul aus den Capture-Antworten (block_checkpoint.content, SLC-173)
// via lean Fan-out (Draft) + Bounded-Critic (~2 LLM-Calls) das Liefer-Triple
// (entscheidung/standard/implementierungsschritt) + KI-Hebel (reifegrad 1-4) und
// schreibt sie als modul_output-Rows (MIG-124, service_role). DEC-235/DEC-239/DEC-245.
//
// Echter Claim-Loop-Job (Enqueue via rpc_enqueue_module_output, MIG-124) -> das
// synthetic-ai_jobs-INSERT-Pattern (backend.md) ENTFAELLT. ai_cost_ledger.job_id
// = diese Job-ID.
//
// Fail-Disziplin (AC-174-5): jeder Fehler (Schema-Drift, Cost-Cap, DB-Fehler) ->
// Job 'failed' (via Claim-Loop-Dispatch-Catch) UND Cleanup partiell geschriebener
// modul_output-Rows (DELETE WHERE ai_job_id = job.id) -> kein halb-fertiger Stand.
//
// Idempotenz: existieren bereits modul_output-Rows fuer (session, modul_key) ->
// skip + complete (analog bulk-email-Synthese).
//
// Dependency-Injection: executeModuleOutputJob(job, deps) fuer Tests, thin
// handleModuleOutputJob(job) Wrapper fuer Production.

import { createAdminClient } from "../../lib/supabase/admin";
import { captureException, captureInfo, captureWarning } from "../../lib/logger";
import type { ClaimedJob } from "../condensation/claim-loop";
import {
  extractModuleContext,
  assembleQaPairs,
  moduleFrageIds,
  type ModuleContext,
  type QaPair,
  type CheckpointSnapshot,
} from "../../lib/stb-vertikale/module-context";
import {
  synthesizeModuleOutput,
  type ModuleCallResult,
} from "../../lib/stb-vertikale/synthesize-module-output";
import { critiqueModuleOutput, inferReifegrad } from "../../lib/stb-vertikale/critic";
import type { ModuleDraft } from "../../lib/stb-vertikale/synthesis-prompt";
import { isValidModulKey } from "../../lib/stb-vertikale/modul-capture";
import {
  createModuleCostCapStore,
  checkRunCapEur,
  checkTenantMonthCap,
  resolveModuleRunCapEur,
  resolveModuleTenantMonthCapEur,
  usdToEur,
  type ModuleCostCapStore,
} from "../../lib/stb-vertikale/cost-cap";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOG_SOURCE = "module_output_synthesis";
const LEDGER_ROLE_SYNTHESIS = "module_output_synthesis";
const LEDGER_ROLE_CRITIC = "module_output_critic";

type AdminClient = ReturnType<typeof createAdminClient>;

interface ModuleOutputPayload {
  capture_session_id: string;
  modul_key: string;
}

interface SessionRow {
  id: string;
  tenant_id: string;
  template_id: string;
}

interface TemplateRow {
  name: string;
  description: string | null;
  blocks: unknown;
  metadata: unknown;
}

interface CheckpointRow {
  id: string;
  block_key: string;
  content: unknown;
  created_at: string;
}

/** Pluggable Draft-Call (Default: synthesizeModuleOutput, eu-central-1). */
export type ModuleSynthesizer = (
  ctx: ModuleContext,
  qaPairs: QaPair[],
) => Promise<ModuleCallResult<ModuleDraft>>;

/** Pluggable Critic-Call (Default: critiqueModuleOutput, eu-central-1). */
export type ModuleCritic = (
  ctx: ModuleContext,
  qaPairs: QaPair[],
  draft: ModuleDraft,
) => Promise<ModuleCallResult<ModuleDraft>>;

export interface HandleModuleOutputDeps {
  adminClient: AdminClient;
  synthesizer?: ModuleSynthesizer;
  critic?: ModuleCritic;
  costStore?: ModuleCostCapStore;
  runCapEur?: number;
  tenantMonthCapEur?: number;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/** Filtert die LLM-Belege auf die echten Modul-frage_id (Provenance, dedupe). */
function reconcileEvidence(ids: string[] | undefined, valid: Set<string>): string[] {
  if (!ids) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (valid.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

const defaultSynthesizer: ModuleSynthesizer = (ctx, qaPairs) =>
  synthesizeModuleOutput(ctx, qaPairs);

const defaultCritic: ModuleCritic = (ctx, qaPairs, draft) =>
  critiqueModuleOutput(ctx, qaPairs, draft);

export async function executeModuleOutputJob(
  job: ClaimedJob,
  deps: HandleModuleOutputDeps,
): Promise<void> {
  const { adminClient } = deps;
  const synthesizer = deps.synthesizer ?? defaultSynthesizer;
  const critic = deps.critic ?? defaultCritic;
  const costStore = deps.costStore ?? createModuleCostCapStore(adminClient);
  const runCapEur = resolveModuleRunCapEur(deps.runCapEur);
  const tenantMonthCapEur = resolveModuleTenantMonthCapEur(deps.tenantMonthCapEur);
  const startMs = Date.now();

  // 1. Payload-Validierung.
  const payload = job.payload as unknown as ModuleOutputPayload;
  if (!payload || !isUuid(payload.capture_session_id)) {
    throw new Error(
      "module_output_synthesis: payload.capture_session_id missing or not a UUID",
    );
  }
  if (!payload.modul_key || !isValidModulKey(payload.modul_key)) {
    throw new Error(
      `module_output_synthesis: payload.modul_key invalid ('${payload.modul_key}')`,
    );
  }
  const sessionId = payload.capture_session_id;
  const modulKey = payload.modul_key;

  // 2. Session laden.
  const { data: sessionRow, error: sessionError } = await adminClient
    .from("capture_session")
    .select("id, tenant_id, template_id")
    .eq("id", sessionId)
    .single();
  if (sessionError || !sessionRow) {
    throw new Error(
      `module_output_synthesis: capture_session ${sessionId} not found: ${
        sessionError?.message ?? "no row"
      }`,
    );
  }
  const session = sessionRow as SessionRow;
  const tenantId = session.tenant_id;

  // 3. Idempotenz: existieren bereits modul_output-Rows -> skip + complete.
  const { count: existingCount, error: existingError } = await adminClient
    .from("modul_output")
    .select("id", { count: "exact", head: true })
    .eq("capture_session_id", sessionId)
    .eq("modul_key", modulKey);
  if (existingError) {
    throw new Error(
      `module_output_synthesis: existing modul_output count failed: ${existingError.message}`,
    );
  }
  if ((existingCount ?? 0) > 0) {
    captureInfo(
      `module_output_synthesis: session ${sessionId}/${modulKey} already has ${existingCount} outputs — idempotent skip`,
      { source: LOG_SOURCE, metadata: { jobId: job.id, sessionId, modulKey } },
    );
    await completeJob(adminClient, job.id);
    return;
  }

  try {
    // 4. Template + Modul-Kontext laden.
    const { data: templateRow, error: templateError } = await adminClient
      .from("template")
      .select("name, description, blocks, metadata")
      .eq("id", session.template_id)
      .single();
    if (templateError || !templateRow) {
      throw new Error(
        `module_output_synthesis: template ${session.template_id} not found: ${
          templateError?.message ?? "no row"
        }`,
      );
    }
    const ctx = extractModuleContext(templateRow as TemplateRow);

    // 4a. Defense: Payload-modul_key muss zum Template-Modul passen.
    if (ctx.modulKey !== modulKey) {
      throw new Error(
        `module_output_synthesis: payload modul_key '${modulKey}' != template metadata.modul_key '${ctx.modulKey}'`,
      );
    }

    // 5. Block-Checkpoints laden (latest-last fuer Answer-Merge).
    const { data: checkpointRows, error: cpError } = await adminClient
      .from("block_checkpoint")
      .select("id, block_key, content, created_at")
      .eq("capture_session_id", sessionId)
      .eq("checkpoint_type", "questionnaire_submit")
      .order("created_at", { ascending: true });
    if (cpError) {
      throw new Error(
        `module_output_synthesis: block_checkpoint SELECT failed: ${cpError.message}`,
      );
    }
    const checkpoints = (checkpointRows ?? []) as CheckpointRow[];
    const snapshots: CheckpointSnapshot[] = checkpoints.map((c) => ({
      block_key: c.block_key,
      content: c.content,
    }));

    // 6. Frage/Antwort-Paare. Keine Antworten -> sauberer Fail (kein Persist).
    const qaPairs = assembleQaPairs(ctx.blocks, snapshots);
    if (qaPairs.length === 0) {
      throw new Error(
        `module_output_synthesis: no capture answers for session ${sessionId}/${modulKey} — nothing to synthesize`,
      );
    }

    // 6a. Primaerer Herkunfts-Checkpoint = latest des Pflicht-Blocks (sonst latest).
    const requiredBlockKey = ctx.blocks.find((b) => b.required === true)?.key;
    const primaryCheckpointId = resolvePrimaryCheckpointId(checkpoints, requiredBlockKey);

    // 7. Tenant-Monatscap (Pre-Run-Hard-Stop, AC-174-4).
    const monthCap = await checkTenantMonthCap(tenantId, tenantMonthCapEur, costStore);
    if (!monthCap.allowed) {
      throw new Error(
        `module_output_synthesis: tenant_month_cap_exceeded (tenant ${tenantId}: ${monthCap.currentMonthEur.toFixed(
          4,
        )} EUR >= cap ${tenantMonthCapEur} EUR)`,
      );
    }

    // 8. Draft (lean Fan-out).
    let accumulatedEur = 0;
    let totalUsd = 0;
    const draftResult = await synthesizer(ctx, qaPairs);
    totalUsd += draftResult.costUsd;
    accumulatedEur += usdToEur(draftResult.costUsd);
    await logLedger(adminClient, job.id, tenantId, draftResult, LEDGER_ROLE_SYNTHESIS);
    if (!checkRunCapEur(accumulatedEur, runCapEur)) {
      throw new Error(
        `module_output_synthesis: run_cap_exceeded after draft (${accumulatedEur.toFixed(
          4,
        )} EUR > cap ${runCapEur} EUR)`,
      );
    }

    // 9. Bounded-Critic (genau 1 Call).
    const criticResult = await critic(ctx, qaPairs, draftResult.data);
    totalUsd += criticResult.costUsd;
    accumulatedEur += usdToEur(criticResult.costUsd);
    await logLedger(adminClient, job.id, tenantId, criticResult, LEDGER_ROLE_CRITIC);
    if (!checkRunCapEur(accumulatedEur, runCapEur)) {
      throw new Error(
        `module_output_synthesis: run_cap_exceeded after critic (${accumulatedEur.toFixed(
          4,
        )} EUR > cap ${runCapEur} EUR)`,
      );
    }

    const finalDraft = criticResult.data;

    // 10. Reconcile + Persist (service_role).
    const validFrageIds = moduleFrageIds(ctx.blocks);
    const rows: Array<Record<string, unknown>> = [];

    for (const t of finalDraft.triple) {
      rows.push({
        tenant_id: tenantId,
        capture_session_id: sessionId,
        block_checkpoint_id: primaryCheckpointId,
        modul_key: modulKey,
        output_kind: t.output_kind,
        title: t.title,
        body: t.body,
        evidence_refs: reconcileEvidence(t.evidence_frage_ids, validFrageIds),
        source: "ai_draft",
        status: "proposed",
        ai_job_id: job.id,
      });
    }

    let reifegradFallbacks = 0;
    for (const h of finalDraft.ki_hebel) {
      const resolution = inferReifegrad(h, ctx.metadata.ki_hebel);
      if (resolution.source === "fallback") reifegradFallbacks += 1;
      rows.push({
        tenant_id: tenantId,
        capture_session_id: sessionId,
        block_checkpoint_id: primaryCheckpointId,
        modul_key: modulKey,
        output_kind: "ki_hebel",
        title: h.name,
        body: h.body,
        reifegrad: resolution.reifegrad,
        evidence_refs: reconcileEvidence(h.evidence_frage_ids, validFrageIds),
        source: "ai_draft",
        status: "proposed",
        ai_job_id: job.id,
      });
    }

    if (rows.length > 0) {
      const { error: insertError } = await adminClient.from("modul_output").insert(rows);
      if (insertError) {
        throw new Error(
          `module_output_synthesis: modul_output INSERT failed: ${insertError.message}`,
        );
      }
    } else {
      captureWarning(
        `module_output_synthesis: session ${sessionId}/${modulKey} produced 0 outputs after critic`,
        { source: LOG_SOURCE, metadata: { jobId: job.id, sessionId, modulKey } },
      );
    }

    // 11. Complete.
    await completeJob(adminClient, job.id);

    captureInfo(
      `module_output_synthesis: session=${sessionId}/${modulKey} done in ${
        Date.now() - startMs
      }ms (qa=${qaPairs.length}, triple=${finalDraft.triple.length}, ki_hebel=${finalDraft.ki_hebel.length}, reifegrad_fallbacks=${reifegradFallbacks}, cost_usd=${totalUsd.toFixed(
        4,
      )}, cost_eur=${accumulatedEur.toFixed(4)})`,
      {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          sessionId,
          modulKey,
          qaCount: qaPairs.length,
          tripleCount: finalDraft.triple.length,
          hebelCount: finalDraft.ki_hebel.length,
          reifegradFallbacks,
          totalUsd,
          accumulatedEur,
        },
      },
    );
  } catch (err) {
    // Cleanup partiell geschriebener Rows (kein halb-fertiger Stand, AC-174-5).
    try {
      await adminClient.from("modul_output").delete().eq("ai_job_id", job.id);
    } catch (cleanupErr) {
      captureException(cleanupErr, {
        source: LOG_SOURCE,
        metadata: { jobId: job.id, phase: "cleanup-partial-rows" },
      });
    }
    captureException(err, {
      source: LOG_SOURCE,
      metadata: { jobId: job.id, sessionId, modulKey },
    });
    throw err; // Claim-Loop-Dispatch-Catch markiert den Job 'failed'.
  }
}

/** Production wrapper — used by the claim-loop dispatcher. */
export async function handleModuleOutputJob(job: ClaimedJob): Promise<void> {
  await executeModuleOutputJob(job, { adminClient: createAdminClient() });
}

// ──────────────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────────────

function resolvePrimaryCheckpointId(
  checkpoints: CheckpointRow[],
  requiredBlockKey: string | undefined,
): string | null {
  if (checkpoints.length === 0) return null;
  // checkpoints sind created_at asc -> latest = letztes Element je Block.
  if (requiredBlockKey) {
    const ofRequired = checkpoints.filter((c) => c.block_key === requiredBlockKey);
    if (ofRequired.length > 0) return ofRequired[ofRequired.length - 1].id;
  }
  return checkpoints[checkpoints.length - 1].id;
}

async function logLedger(
  admin: AdminClient,
  jobId: string,
  tenantId: string,
  result: ModuleCallResult<ModuleDraft>,
  role: string,
): Promise<void> {
  // Non-fatal (analog bulk-email): ein Ledger-Fehler darf den teuren Run nicht failen.
  const { error } = await admin.from("ai_cost_ledger").insert({
    tenant_id: tenantId,
    job_id: jobId,
    model_id: result.modelId,
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
    usd_cost: result.costUsd,
    duration_ms: result.latencyMs,
    iteration: 1,
    role,
  });
  if (error) {
    captureException(
      new Error(
        `module_output_synthesis: ai_cost_ledger INSERT failed (non-fatal, role=${role}): ${error.message}`,
      ),
      { source: LOG_SOURCE, metadata: { jobId, role } },
    );
  }
}

async function completeJob(admin: AdminClient, jobId: string): Promise<void> {
  const { error } = await admin.rpc("rpc_complete_ai_job", { p_job_id: jobId });
  if (error) {
    throw new Error(
      `module_output_synthesis: rpc_complete_ai_job failed: ${error.message}`,
    );
  }
}
