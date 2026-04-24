// SLC-035 MT-3 — Worker-Job-Handler bridge_generation
//
// Laedt bridge_run + Session + Template + Employees + KUs + Diagnosen aus der DB.
// Deligiert die reine Logik an processBridgeRun. Persistiert Proposals +
// bridge_run-Update + ai_cost_ledger + completes/fails ai_jobs-Row.
//
// Data-Residency: Bedrock-Client laeuft via src/lib/llm.ts — konfiguriert auf
// eu-central-1 (Frankfurt) mit Claude Sonnet 4.

import { createAdminClient } from "../../lib/supabase/admin";
import { chatWithLLM } from "../../lib/llm";
import { captureException } from "../../lib/logger";
import type { ClaimedJob } from "../condensation/claim-loop";
import {
  processBridgeRun,
  type BedrockCaller,
  type CostLedgerEntry,
  type ProposalRecord,
} from "./process-bridge-run";
import type {
  BridgeDiagnosis,
  BridgeEmployee,
  BridgeEmployeeCaptureSchema,
  BridgeKnowledgeUnit,
} from "./types";

const MODEL_ID =
  process.env.LLM_MODEL || "eu.anthropic.claude-sonnet-4-20250514-v1:0";

// Grober Token-Estimator — Bedrock ConverseCommand liefert kein exaktes Usage-Objekt
// in allen Pfaden. Wir schaetzen ueber Charakterlaenge / 4 (vgl. andere Worker).
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const defaultBedrockCall: BedrockCaller = async (system, user, opts) => {
  const start = Date.now();
  const response = await chatWithLLM(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: opts?.temperature ?? 0.3, maxTokens: opts?.maxTokens ?? 1024 }
  );
  const durationMs = Date.now() - start;

  return {
    text: response,
    tokensIn: estimateTokens(system) + estimateTokens(user),
    tokensOut: estimateTokens(response),
    durationMs,
    modelId: MODEL_ID,
  };
};

export async function handleBridgeJob(
  job: ClaimedJob,
  bedrockCall: BedrockCaller = defaultBedrockCall
): Promise<void> {
  const adminClient = createAdminClient();
  const bridgeRunId = job.payload.bridge_run_id as string;

  if (!bridgeRunId) {
    throw new Error(
      "Bridge job payload missing required field (bridge_run_id)"
    );
  }

  console.log(
    `[bridge-job] Processing job ${job.id} for tenant ${job.tenant_id}, bridge_run=${bridgeRunId}`
  );

  try {
    // 1. Load bridge_run
    const { data: bridgeRun, error: runErr } = await adminClient
      .from("bridge_run")
      .select("id, tenant_id, capture_session_id, template_id, status")
      .eq("id", bridgeRunId)
      .single();

    if (runErr || !bridgeRun) {
      throw new Error(
        `Failed to load bridge_run ${bridgeRunId}: ${runErr?.message ?? "not found"}`
      );
    }

    // 2. Load template.employee_capture_schema
    const { data: template, error: tplErr } = await adminClient
      .from("template")
      .select("id, employee_capture_schema")
      .eq("id", bridgeRun.template_id)
      .single();

    if (tplErr || !template) {
      throw new Error(
        `Failed to load template ${bridgeRun.template_id}: ${tplErr?.message ?? "not found"}`
      );
    }

    const schema = template.employee_capture_schema as BridgeEmployeeCaptureSchema | null;
    if (!schema || !Array.isArray(schema.subtopic_bridges)) {
      throw new Error(
        `Template ${bridgeRun.template_id} has no employee_capture_schema with subtopic_bridges`
      );
    }

    // 3. Load aktive employees (profiles.role='employee' des Tenants)
    const { data: employeeRows, error: empErr } = await adminClient
      .from("profiles")
      .select("id, email, role")
      .eq("tenant_id", bridgeRun.tenant_id)
      .eq("role", "employee");

    if (empErr) {
      throw new Error(`Failed to load employees: ${empErr.message}`);
    }

    const employees: BridgeEmployee[] = (employeeRows ?? []).map((r) => ({
      user_id: r.id as string,
      display_name: (r.email as string) ?? (r.id as string),
      role_hint: null,
      department: null,
    }));

    // 4. Load KUs (proposed | accepted | edited) der Quell-Session
    const { data: kuRows, error: kuErr } = await adminClient
      .from("knowledge_unit")
      .select("id, block_key, title, body, unit_type, confidence, status")
      .eq("capture_session_id", bridgeRun.capture_session_id)
      .in("status", ["proposed", "accepted", "edited"])
      .order("block_key");

    if (kuErr) {
      throw new Error(`Failed to load knowledge_units: ${kuErr.message}`);
    }

    const kus: BridgeKnowledgeUnit[] = (kuRows ?? []).map((r) => ({
      id: r.id as string,
      block_key: r.block_key as string,
      subtopic_key: null,
      title: r.title as string,
      body: r.body as string,
      unit_type: r.unit_type as string,
      confidence: r.confidence as string,
      status: r.status as string,
    }));

    // 5. Load Diagnosen (status='confirmed')
    const { data: diagRows, error: diagErr } = await adminClient
      .from("block_diagnosis")
      .select("id, block_key, content, status")
      .eq("capture_session_id", bridgeRun.capture_session_id)
      .eq("status", "confirmed");

    if (diagErr) {
      throw new Error(`Failed to load block_diagnosis: ${diagErr.message}`);
    }

    const diagnoses: BridgeDiagnosis[] = (diagRows ?? []).map((r) => {
      const content = r.content as Record<string, unknown> | null;
      return {
        id: r.id as string,
        block_key: r.block_key as string,
        subtopic_key: null,
        summary:
          (content?.summary as string | undefined) ??
          (content?.overall_assessment as string | undefined) ??
          null,
        severity: (content?.severity as string | undefined) ?? null,
        ampel:
          (content?.ampel as string | undefined) ??
          (content?.traffic_light as string | undefined) ??
          null,
        status: r.status as string,
      };
    });

    console.log(
      `[bridge-job] Loaded ${employees.length} employees, ${kus.length} KUs, ${diagnoses.length} diagnoses`
    );

    // 6. Process (pure logic with Bedrock)
    const result = await processBridgeRun(
      { schema, employees, kus, diagnoses },
      bedrockCall
    );

    console.log(
      `[bridge-job] Generated ${result.proposals.length} proposals, cost=$${result.totalCostUsd.toFixed(4)}, warnings=${result.warnings.length}`
    );
    for (const w of result.warnings) {
      console.log(`[bridge-job] WARN: ${w}`);
    }

    // 7. INSERT bridge_proposals
    if (result.proposals.length > 0) {
      const rows = result.proposals.map((p: ProposalRecord) => ({
        tenant_id: bridgeRun.tenant_id,
        bridge_run_id: bridgeRunId,
        proposal_mode: p.proposal_mode,
        source_subtopic_key: p.source_subtopic_key,
        proposed_block_title: p.proposed_block_title,
        proposed_block_description: p.proposed_block_description,
        proposed_questions: p.proposed_questions,
        proposed_employee_user_id: p.proposed_employee_user_id,
        proposed_employee_role_hint: p.proposed_employee_role_hint,
        status: "proposed",
      }));

      const { error: insErr } = await adminClient.from("bridge_proposal").insert(rows);
      if (insErr) {
        throw new Error(`Failed to insert bridge_proposal rows: ${insErr.message}`);
      }
    }

    // 8. Cost-Ledger-Entries (best-effort — Fehler hier loggen, nicht job-failen)
    for (const entry of result.costEntries) {
      try {
        await adminClient.from("ai_cost_ledger").insert({
          tenant_id: bridgeRun.tenant_id,
          job_id: job.id,
          model_id: entry.model_id,
          tokens_in: entry.tokens_in,
          tokens_out: entry.tokens_out,
          usd_cost: entry.usd_cost,
          duration_ms: entry.duration_ms,
          role: entry.role,
          feature: entry.feature,
        });
      } catch (costErr) {
        captureException(costErr, {
          source: "bridge-job",
          metadata: { jobId: job.id, action: "log-costs" },
        });
      }
    }

    // 9. UPDATE bridge_run -> completed
    const { error: updErr } = await adminClient
      .from("bridge_run")
      .update({
        status: "completed",
        proposal_count: result.proposals.length,
        cost_usd: result.totalCostUsd,
        generated_by_model: result.generatedByModel,
        completed_at: new Date().toISOString(),
      })
      .eq("id", bridgeRunId);

    if (updErr) {
      throw new Error(`Failed to update bridge_run: ${updErr.message}`);
    }

    // 10. complete job
    const { error: completeErr } = await adminClient.rpc("rpc_complete_ai_job", {
      p_job_id: job.id,
    });
    if (completeErr) {
      throw new Error(`Failed to complete bridge job: ${completeErr.message}`);
    }

    console.log(
      `[bridge-job] Job ${job.id} completed (${result.proposals.length} proposals)`
    );
  } catch (err) {
    // bridge_run auf failed setzen (best-effort)
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await adminClient
        .from("bridge_run")
        .update({
          status: "failed",
          error_message: msg.slice(0, 2000),
          completed_at: new Date().toISOString(),
        })
        .eq("id", bridgeRunId);
    } catch (updErr) {
      captureException(updErr, {
        source: "bridge-job",
        metadata: { bridgeRunId, action: "mark-failed" },
      });
    }

    // rethrow -> claim-loop markiert ai_jobs-Row als failed
    throw err;
  }
}

// Re-Exports fuer Tests (Mocking + Inspektion)
export type { BedrockCaller, CostLedgerEntry, ProposalRecord };
