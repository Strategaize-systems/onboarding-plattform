// V9.5 SLC-V9.5-B MT-4 — Worker Handler `email_bulk_synthesis` (FEAT-080, MIG-111)
// V9.5 SLC-V9.5-C MT-2 — Bounded-Critic-Phase (FEAT-081, MIG-112): 1 Critic-Call
//       zwischen Draft-Assembly und Persist; Filter KEEP && evidence>=2 (AC-C-2).
//
// Spec: slices/SLC-V9.5-B-synthesis-stage-backend.md (MT-4 Expected behavior)
//       + slices/SLC-V9.5-C-bounded-critic-gate.md (MT-2)
// DECs: DEC-214 (neue Tabelle email_synthesized_unit), DEC-215 (Partition nach
//       suggested_section, 1 Synthese-Call/Section), DEC-216 (bounded:
//       1 Synthese-Call/Section + 1 Critic-Call/Run, Filter KEEP && evidence>=2),
//       DEC-217 (synthesis_cost_eur + total_cost_eur Live-Cap, R-B-2 BLOCKING).
//
// Echter Claim-Loop-Job (regulaere ai_jobs-Row via Enqueue-Tail des Extraktors,
// MT-5). Das synthetic-ai_jobs-INSERT-Pattern (backend.md) ENTFAELLT — es gilt
// nur fuer synchrone Nicht-Worker-Calls. ai_cost_ledger.job_id = diese Job-ID.
//
// Status-Maschine (MIG-111):
//   pattern_extracted -> synthesizing -> synthesized   (success)
//   pattern_extracted -> synthesizing -> failed         (cost-cap / error)
//   != pattern_extracted -> no-op                       (skip + rpc_complete_ai_job)
//
// Idempotenz (AC-B-7): wenn email_synthesized_unit fuer bulk_run_id existiert,
// skip + complete (analog Extraktor-thread_id-Skip).
//
// Provenance-Rekonziliation (Defense gegen Modell-ID-Drift): die vom LLM
// gemeldeten source_pattern_ids werden gegen die TATSAECHLICHEN Input-Pattern-IDs
// der Section gefiltert. Der rekonziliierte Count (validSourcePatternIds.length)
// ist die autoritative evidence_count — sowohl fuer den evidence>=2-Filter als
// auch fuer die persistierte Spalte + die _source-Rows (AC-B-2-Konsistenz).
//
// Persist-Atomaritaet (bewusste Simplifikation): pro Unit 1 INSERT
// email_synthesized_unit (returning id) + 1 batched INSERT der n _source-Rows
// (zwei Statements, nicht cross-statement-atomar). Bei Fehler greift der
// Run-Level try/catch → status='failed' (sichtbar, nicht silent). Volle
// cross-statement-Atomaritaet via Postgres-Function (backend.md) ist hier nicht
// noetig, da ein partieller Fehler den Run sichtbar auf 'failed' setzt und kein
// automatischer Re-Run erfolgt (Status != pattern_extracted → skip).
//
// Dependency-Injection: executeEmailBulkSynthesis(job, deps) fuer Tests,
// thin handleEmailBulkSynthesisJob(job) Wrapper fuer Production.

import { createAdminClient } from "../../lib/supabase/admin";
import { captureException, captureInfo, captureWarning } from "../../lib/logger";
import {
  synthesizeSection,
  critiqueUnits,
  SonnetSchemaError,
  type SynthesisInputPattern,
  type SynthesisResult,
  type SynthesizedUnit,
  type CriticInputUnit,
  type CriticVerdicts,
} from "../../lib/ai/bedrock-sonnet";
import {
  DEFAULT_RUN_CAP_EUR,
  checkLiveTotalCapInWorker,
  createCostCapStoreFromSupabase,
  type CostCapStore,
} from "../../lib/bulk-email/cost-cap";
import { USD_TO_EUR_APPROX } from "../../lib/bulk-email/cost-estimate";
import type { ClaimedJob } from "../condensation/claim-loop";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOG_SOURCE = "email_bulk_synthesis";
const AI_COST_LEDGER_ROLE = "email_bulk_synthesis";
/** SLC-V9.5-C: Critic-Phase schreibt mit eigener role (MIG-112), job_id = Synthese-Job-ID. */
const AI_COST_LEDGER_CRITIC_ROLE = "email_bulk_critic";
/** Section-Bucket fuer NULL/leere suggested_section (DEC-215). */
const FALLBACK_SECTION = "andere";

type AdminClient = ReturnType<typeof createAdminClient>;

interface EmailBulkSynthesisPayload {
  bulk_run_id: string;
}

interface BulkRunRow {
  id: string;
  tenant_id: string;
  status: string;
  synthesis_cost_eur: string | number | null;
}

interface PatternRow {
  id: string;
  title: string;
  description: string;
  evidence_snippets: string[] | null;
  themes: string[] | null;
  confidence: number;
  suggested_section: string | null;
  thread_id: string;
}

/**
 * Test-Injection-Hook fuer den Synthese-Call. Production setzt das nicht —
 * Default delegiert an synthesizeSection (eu-central-1).
 */
export type SectionSynthesizer = (
  sectionName: string,
  patterns: SynthesisInputPattern[],
) => Promise<{
  data: SynthesisResult;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  modelId: string;
  region: string;
}>;

const defaultSectionSynthesizer: SectionSynthesizer = async (section, patterns) => {
  const result = await synthesizeSection(section, patterns);
  return {
    data: result.data,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
    modelId: result.modelId,
    region: result.region,
  };
};

/**
 * Test-Injection-Hook fuer den bounded Critic-Call (SLC-V9.5-C, DEC-216).
 * Production setzt das nicht — Default delegiert an critiqueUnits (eu-central-1).
 */
export type UnitCritic = (units: CriticInputUnit[]) => Promise<{
  data: CriticVerdicts;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  modelId: string;
  region: string;
}>;

const defaultUnitCritic: UnitCritic = async (units) => {
  const result = await critiqueUnits(units);
  return {
    data: result.data,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
    modelId: result.modelId,
    region: result.region,
  };
};

export interface HandleEmailBulkSynthesisDeps {
  adminClient: AdminClient;
  /** Pluggable for tests — defaults to synthesizeSection Sonnet-Call. */
  synthesizer?: SectionSynthesizer;
  /** Pluggable for tests — defaults to critiqueUnits Sonnet-Call (SLC-V9.5-C). */
  critic?: UnitCritic;
  /** Pluggable for tests — defaults to createCostCapStoreFromSupabase(adminClient). */
  costStore?: CostCapStore;
  /** Pluggable for tests — defaults to ENV V9_BULK_EMAIL_RUN_CAP_EUR or 20. */
  runCapEur?: number;
}

/**
 * Eine rekonziliierte Draft-Unit: die LLM-Unit + die gegen die echten
 * Input-Pattern-IDs gefilterte Provenance.
 */
interface ReconciledUnit {
  unit: SynthesizedUnit;
  evidenceCount: number;
  sourceRows: Array<{ pattern_id: string; thread_id: string | null }>;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function resolveRunCap(override?: number): number {
  if (typeof override === "number") return override;
  const envValue = process.env.V9_BULK_EMAIL_RUN_CAP_EUR;
  if (envValue) {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_RUN_CAP_EUR;
}

function numericOrZero(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sectionKey(suggested: string | null): string {
  const trimmed = (suggested ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === FALLBACK_SECTION) {
    return FALLBACK_SECTION;
  }
  return trimmed;
}

/**
 * Filter-Hook (DEC-216, finalisiert in SLC-V9.5-C / AC-C-2): eine Unit
 * ueberlebt gdw. `verdict=KEEP` UND `evidence_count >= 2`. Der Verdict-Filter
 * laeuft VOR dem evidence-Filter. Strikt: fehlt ein Verdict fuer einen Index
 * (Modell hat die Unit ausgelassen), ist das NICHT KEEP → Unit faellt raus
 * (im Worker als no_verdict geloggt). Ohne `criticVerdicts` (kein Critic-Lauf,
 * z.B. 0 Drafts) greift nur der evidence>=2-Schwellwert.
 */
export function selectSurvivingUnits(
  draftUnits: ReconciledUnit[],
  criticVerdicts?: Map<number, "KEEP" | "REJECT">,
): ReconciledUnit[] {
  return draftUnits.filter((r, idx) => {
    if (criticVerdicts && criticVerdicts.get(idx) !== "KEEP") return false;
    return r.evidenceCount >= 2;
  });
}

/**
 * Rekonziliert eine LLM-Unit gegen die Input-Patterns der Section. Filtert
 * source_pattern_ids auf existierende IDs, leitet thread_id pro Beleg ab,
 * setzt die autoritative evidence_count = Anzahl distinkter valider IDs.
 */
function reconcileUnit(
  unit: SynthesizedUnit,
  patternIndex: Map<string, PatternRow>,
): ReconciledUnit {
  const seen = new Set<string>();
  const sourceRows: Array<{ pattern_id: string; thread_id: string | null }> = [];
  for (const pid of unit.source_pattern_ids) {
    if (seen.has(pid)) continue;
    const p = patternIndex.get(pid);
    if (!p) continue; // Modell-ID-Drift → verwerfen
    seen.add(pid);
    sourceRows.push({ pattern_id: pid, thread_id: p.thread_id ?? null });
  }
  return { unit, evidenceCount: sourceRows.length, sourceRows };
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export async function executeEmailBulkSynthesis(
  job: ClaimedJob,
  deps: HandleEmailBulkSynthesisDeps,
): Promise<void> {
  const { adminClient } = deps;
  const synthesizer = deps.synthesizer ?? defaultSectionSynthesizer;
  const critic = deps.critic ?? defaultUnitCritic;
  const costStore = deps.costStore ?? createCostCapStoreFromSupabase(adminClient);
  const runCapEur = resolveRunCap(deps.runCapEur);
  const startMs = Date.now();

  const payload = job.payload as unknown as EmailBulkSynthesisPayload;
  if (!payload || !isUuid(payload.bulk_run_id)) {
    throw new Error(
      "email_bulk_synthesis: payload.bulk_run_id missing or not a UUID",
    );
  }
  const bulkRunId = payload.bulk_run_id;

  // 1. Load bulk_run.
  const { data: runRow, error: loadError } = await adminClient
    .from("email_bulk_run")
    .select("id, tenant_id, status, synthesis_cost_eur")
    .eq("id", bulkRunId)
    .single();
  if (loadError || !runRow) {
    throw new Error(
      `email_bulk_synthesis: email_bulk_run ${bulkRunId} not found: ${
        loadError?.message ?? "no row"
      }`,
    );
  }
  const run = runRow as BulkRunRow;

  // 2. Status-Skip fuer alles ausser 'pattern_extracted' (AC-B-8).
  if (run.status !== "pattern_extracted") {
    captureWarning(
      `email_bulk_synthesis: skipping bulk_run ${bulkRunId} with status='${run.status}' (expected 'pattern_extracted')`,
      {
        source: LOG_SOURCE,
        metadata: { jobId: job.id, bulkRunId, status: run.status },
      },
    );
    await completeJob(adminClient, job.id, "status-skip");
    return;
  }

  // 3. Idempotenz (AC-B-7): existieren bereits Units fuer den Run → skip.
  const { count: existingCount, error: existingError } = await adminClient
    .from("email_synthesized_unit")
    .select("id", { count: "exact", head: true })
    .eq("bulk_run_id", bulkRunId);
  if (existingError) {
    throw new Error(
      `email_bulk_synthesis: existing email_synthesized_unit count failed: ${existingError.message}`,
    );
  }
  if ((existingCount ?? 0) > 0) {
    captureInfo(
      `email_bulk_synthesis: bulk_run ${bulkRunId} already has ${existingCount} synthesized units — idempotent skip`,
      { source: LOG_SOURCE, metadata: { jobId: job.id, bulkRunId } },
    );
    await completeJob(adminClient, job.id, "idempotent-skip");
    return;
  }

  try {
    // 4. Status pattern_extracted -> synthesizing.
    await flipStatus(adminClient, bulkRunId, "synthesizing");

    // 5. Load all email_pattern of the run.
    const { data: patternRows, error: patternsError } = await adminClient
      .from("email_pattern")
      .select("id, title, description, evidence_snippets, themes, confidence, suggested_section, thread_id")
      .eq("bulk_run_id", bulkRunId);
    if (patternsError) {
      throw new Error(
        `email_bulk_synthesis: email_pattern SELECT failed: ${patternsError.message}`,
      );
    }
    const patterns = (patternRows ?? []) as PatternRow[];

    if (patterns.length === 0) {
      // Keine Patterns → nichts zu synthetisieren. Direkt auf 'synthesized'.
      await flipStatus(adminClient, bulkRunId, "synthesized");
      await completeJob(adminClient, job.id, "no-patterns");
      captureInfo(
        `email_bulk_synthesis: bulk_run ${bulkRunId} had 0 patterns — synthesized (empty)`,
        { source: LOG_SOURCE, metadata: { jobId: job.id, bulkRunId } },
      );
      return;
    }

    // 6. Partition nach suggested_section (DEC-215).
    const partitions = new Map<string, PatternRow[]>();
    const patternIndex = new Map<string, PatternRow>();
    for (const p of patterns) {
      patternIndex.set(p.id, p);
      const key = sectionKey(p.suggested_section);
      const bucket = partitions.get(key);
      if (bucket) bucket.push(p);
      else partitions.set(key, [p]);
    }

    // 7. Pro Section: Synthese-Call + Cost-Akkumulation + Live-Cap.
    let accumulatedSynthEur = numericOrZero(run.synthesis_cost_eur);
    let totalUsdCost = 0;
    const draftReconciled: ReconciledUnit[] = [];
    let capExceeded = false;
    let sectionsProcessed = 0;

    for (const [section, secPatterns] of partitions) {
      const inputPatterns: SynthesisInputPattern[] = secPatterns.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        evidence_snippets: p.evidence_snippets,
        themes: p.themes,
        confidence: p.confidence,
        thread_id: p.thread_id,
      }));

      let callResult: Awaited<ReturnType<SectionSynthesizer>>;
      try {
        callResult = await synthesizer(section, inputPatterns);
      } catch (synthErr) {
        // Schema-Drift auf einer Section: skip die Section (continue), kein
        // Run-Abbruch (analog Extraktor-Per-Thread-Skip). Andere Errors
        // (Bedrock-Timeout/Network) sind Run-blocking → re-throw.
        if (synthErr instanceof SonnetSchemaError) {
          captureException(synthErr, {
            source: LOG_SOURCE,
            metadata: {
              jobId: job.id,
              bulkRunId,
              section,
              kind: "sonnet_schema_drift",
            },
          });
          continue;
        }
        throw synthErr;
      }

      sectionsProcessed += 1;
      totalUsdCost += callResult.costUsd;
      accumulatedSynthEur += callResult.costUsd * USD_TO_EUR_APPROX;

      // 7a. synthesis_cost_eur akkumulieren (Live-Cap-Source via total_cost_eur).
      const { error: costUpdateError } = await adminClient
        .from("email_bulk_run")
        .update({
          synthesis_cost_eur: accumulatedSynthEur,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bulkRunId);
      if (costUpdateError) {
        throw new Error(
          `email_bulk_synthesis: synthesis_cost_eur UPDATE failed (section=${section}): ${costUpdateError.message}`,
        );
      }

      // 7b. ai_cost_ledger (role email_bulk_synthesis). Non-fatal.
      const { error: ledgerError } = await adminClient
        .from("ai_cost_ledger")
        .insert({
          tenant_id: run.tenant_id,
          job_id: job.id,
          model_id: callResult.modelId,
          tokens_in: callResult.tokensIn,
          tokens_out: callResult.tokensOut,
          usd_cost: callResult.costUsd,
          duration_ms: callResult.latencyMs,
          iteration: 1,
          role: AI_COST_LEDGER_ROLE,
        });
      if (ledgerError) {
        captureException(
          new Error(
            `email_bulk_synthesis: ai_cost_ledger INSERT failed (non-fatal): ${ledgerError.message}`,
          ),
          { source: LOG_SOURCE, metadata: { jobId: job.id, bulkRunId, section } },
        );
      }

      // 7c. Reconcile units (Provenance-Filter).
      for (const u of callResult.data.units) {
        draftReconciled.push(reconcileUnit(u, patternIndex));
      }

      // 7d. Live-Total-Cap-Check (DEC-217, R-B-2). Source: total_cost_eur.
      const cap = await checkLiveTotalCapInWorker(bulkRunId, runCapEur, costStore);
      if (cap.exceeded) {
        capExceeded = true;
        captureWarning(
          `email_bulk_synthesis: bulk_run ${bulkRunId} STOPPED via cost-cap (total=${cap.currentEur.toFixed(
            4,
          )} EUR > cap ${runCapEur} EUR)`,
          {
            source: LOG_SOURCE,
            metadata: { jobId: job.id, bulkRunId, totalEur: cap.currentEur, runCapEur },
          },
        );
        break;
      }
    }

    // 8. Cost-Cap exceeded → status='failed', kein Persist (AC-B-4).
    if (capExceeded) {
      const reason = `cost_cap_run_exceeded (synthesis): total > cap ${runCapEur} EUR`;
      await failRun(adminClient, bulkRunId, reason);
      await completeJob(adminClient, job.id, "cost-cap-exceeded");
      return;
    }

    // 9. Bounded Critic (SLC-V9.5-C, DEC-216): GENAU 1 Call ueber alle
    //    Draft-Units des Runs (AC-C-4). Wirft der Critic (SonnetSchemaError /
    //    Bedrock-Error), greift der Run-Level try/catch → status='failed',
    //    KEIN Persist un-kritisierter Units (R-C-2). Bei 0 Drafts entfaellt
    //    der Call (nichts zu kritisieren, 0 LLM-Calls).
    let criticVerdictsMap: Map<number, "KEEP" | "REJECT"> | undefined;
    if (draftReconciled.length > 0) {
      const criticInput: CriticInputUnit[] = draftReconciled.map((r) => ({
        title: r.unit.title,
        description: r.unit.description,
        themes: r.unit.themes ?? [],
        suggested_section: r.unit.suggested_section,
        // REKONZILIIERTE evidence_count (nicht der LLM-Rohwert) — der Critic
        // urteilt ueber dieselbe Zahl, gegen die der Worker-Filter prueft.
        evidence_count: r.evidenceCount,
        evidence_snippets: r.unit.evidence_snippets,
      }));

      const criticResult = await critic(criticInput);
      totalUsdCost += criticResult.costUsd;
      accumulatedSynthEur += criticResult.costUsd * USD_TO_EUR_APPROX;

      // 9a. Critic-Cost in synthesis_cost_eur akkumulieren (AC-C-3).
      const { error: criticCostError } = await adminClient
        .from("email_bulk_run")
        .update({
          synthesis_cost_eur: accumulatedSynthEur,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bulkRunId);
      if (criticCostError) {
        throw new Error(
          `email_bulk_synthesis: synthesis_cost_eur UPDATE failed (critic): ${criticCostError.message}`,
        );
      }

      // 9b. ai_cost_ledger (role email_bulk_critic, MIG-112). Non-fatal.
      const { error: criticLedgerError } = await adminClient
        .from("ai_cost_ledger")
        .insert({
          tenant_id: run.tenant_id,
          job_id: job.id,
          model_id: criticResult.modelId,
          tokens_in: criticResult.tokensIn,
          tokens_out: criticResult.tokensOut,
          usd_cost: criticResult.costUsd,
          duration_ms: criticResult.latencyMs,
          iteration: 1,
          role: AI_COST_LEDGER_CRITIC_ROLE,
        });
      if (criticLedgerError) {
        captureException(
          new Error(
            `email_bulk_synthesis: ai_cost_ledger INSERT failed (critic, non-fatal): ${criticLedgerError.message}`,
          ),
          { source: LOG_SOURCE, metadata: { jobId: job.id, bulkRunId, phase: "critic" } },
        );
      }

      // 9c. Live-Total-Cap nach dem Critic-Call (DEC-217, R-C-2): Cap-Hit
      //     zwischen Critic und Persist → status='failed', kein Persist.
      const criticCap = await checkLiveTotalCapInWorker(bulkRunId, runCapEur, costStore);
      if (criticCap.exceeded) {
        captureWarning(
          `email_bulk_synthesis: bulk_run ${bulkRunId} STOPPED via cost-cap after critic (total=${criticCap.currentEur.toFixed(
            4,
          )} EUR > cap ${runCapEur} EUR)`,
          {
            source: LOG_SOURCE,
            metadata: { jobId: job.id, bulkRunId, totalEur: criticCap.currentEur, runCapEur },
          },
        );
        await failRun(
          adminClient,
          bulkRunId,
          `cost_cap_run_exceeded (critic): total > cap ${runCapEur} EUR`,
        );
        await completeJob(adminClient, job.id, "cost-cap-exceeded-critic");
        return;
      }

      // 9d. Verdict-Index-Mapping: unit_ref → Verdict. Out-of-range Refs werden
      //     verworfen, bei Duplikaten gewinnt das erste Verdict.
      criticVerdictsMap = new Map();
      let outOfRangeRefs = 0;
      for (const v of criticResult.data.verdicts) {
        if (v.unit_ref >= draftReconciled.length) {
          outOfRangeRefs += 1;
          continue;
        }
        if (!criticVerdictsMap.has(v.unit_ref)) {
          criticVerdictsMap.set(v.unit_ref, v.verdict);
        }
      }
      if (outOfRangeRefs > 0) {
        captureWarning(
          `email_bulk_synthesis: critic returned ${outOfRangeRefs} out-of-range unit_ref(s) — ignored`,
          { source: LOG_SOURCE, metadata: { jobId: job.id, bulkRunId, outOfRangeRefs } },
        );
      }
    }

    // 10. Filter-Hook (DEC-216 / AC-C-2): KEEP && evidence>=2.
    const surviving = selectSurvivingUnits(draftReconciled, criticVerdictsMap);

    // 10a. Reject-Logging (Reduktions-Statistik, AC-C-1/AC-C-2).
    if (criticVerdictsMap) {
      let rejectedByCritic = 0;
      let noVerdict = 0;
      let droppedByEvidence = 0;
      draftReconciled.forEach((r, idx) => {
        const verdict = criticVerdictsMap!.get(idx);
        if (verdict === "REJECT") rejectedByCritic += 1;
        else if (verdict === undefined) noVerdict += 1;
        else if (r.evidenceCount < 2) droppedByEvidence += 1;
      });
      captureInfo(
        `email_bulk_synthesis: critic gate for bulk_run=${bulkRunId}: drafts=${draftReconciled.length}, surviving=${surviving.length}, rejected_by_critic=${rejectedByCritic}, no_verdict=${noVerdict}, dropped_by_evidence=${droppedByEvidence}`,
        {
          source: LOG_SOURCE,
          metadata: {
            jobId: job.id,
            bulkRunId,
            draftCount: draftReconciled.length,
            survivingCount: surviving.length,
            rejectedByCritic,
            noVerdict,
            droppedByEvidence,
          },
        },
      );
    }

    // 11. Persist surviving units + Provenance-Rows.
    let unitsInserted = 0;
    let sourcesInserted = 0;
    for (const r of surviving) {
      const { data: insUnit, error: unitError } = await adminClient
        .from("email_synthesized_unit")
        .insert({
          tenant_id: run.tenant_id,
          bulk_run_id: bulkRunId,
          title: r.unit.title,
          description: r.unit.description,
          evidence_snippets: r.unit.evidence_snippets,
          themes: r.unit.themes ?? [],
          suggested_section: r.unit.suggested_section,
          aggregated_confidence: clampConfidence(r.unit.aggregated_confidence),
          evidence_count: r.evidenceCount,
          source_pattern_ids: r.sourceRows.map((s) => s.pattern_id),
        })
        .select("id")
        .single();
      if (unitError || !insUnit) {
        throw new Error(
          `email_bulk_synthesis: email_synthesized_unit INSERT failed: ${
            unitError?.message ?? "no row"
          }`,
        );
      }
      const synthesizedUnitId = (insUnit as { id: string }).id;
      unitsInserted += 1;

      const sourceInsertRows = r.sourceRows.map((s) => ({
        synthesized_unit_id: synthesizedUnitId,
        pattern_id: s.pattern_id,
        thread_id: s.thread_id,
        tenant_id: run.tenant_id,
      }));
      if (sourceInsertRows.length > 0) {
        const { error: sourceError } = await adminClient
          .from("email_synthesized_unit_source")
          .insert(sourceInsertRows);
        if (sourceError) {
          throw new Error(
            `email_bulk_synthesis: email_synthesized_unit_source INSERT failed (unit=${synthesizedUnitId}): ${sourceError.message}`,
          );
        }
        sourcesInserted += sourceInsertRows.length;
      }
    }

    // 12. Status synthesizing -> synthesized + complete.
    await flipStatus(adminClient, bulkRunId, "synthesized");
    await completeJob(adminClient, job.id, "done");

    captureInfo(
      `email_bulk_synthesis: bulk_run=${bulkRunId} done in ${
        Date.now() - startMs
      }ms (sections=${sectionsProcessed}, drafts=${draftReconciled.length}, surviving=${surviving.length}, units_inserted=${unitsInserted}, sources_inserted=${sourcesInserted}, cost_usd=${totalUsdCost.toFixed(4)}, synth_eur=${accumulatedSynthEur.toFixed(4)})`,
      {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          bulkRunId,
          sectionsProcessed,
          draftCount: draftReconciled.length,
          survivingCount: surviving.length,
          unitsInserted,
          sourcesInserted,
          totalUsdCost,
          synthEurCost: accumulatedSynthEur,
        },
      },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const failureReason = `synthesis_error: ${reason}`;
    try {
      await adminClient
        .from("email_bulk_run")
        .update({
          status: "failed",
          failure_reason: failureReason.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", bulkRunId);
    } catch (statusFailErr) {
      captureException(statusFailErr, {
        source: LOG_SOURCE,
        metadata: { jobId: job.id, bulkRunId, phase: "set-status-failed" },
      });
    }
    captureException(err, {
      source: LOG_SOURCE,
      metadata: { jobId: job.id, bulkRunId },
    });
    throw err;
  }
}

/** Production wrapper — used by the claim-loop dispatcher. */
export async function handleEmailBulkSynthesisJob(job: ClaimedJob): Promise<void> {
  await executeEmailBulkSynthesis(job, {
    adminClient: createAdminClient(),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────────────

async function flipStatus(
  admin: AdminClient,
  bulkRunId: string,
  status: "synthesizing" | "synthesized",
): Promise<void> {
  const { error } = await admin
    .from("email_bulk_run")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", bulkRunId);
  if (error) {
    throw new Error(
      `email_bulk_synthesis: status='${status}' UPDATE failed: ${error.message}`,
    );
  }
}

async function failRun(
  admin: AdminClient,
  bulkRunId: string,
  reason: string,
): Promise<void> {
  const { error } = await admin
    .from("email_bulk_run")
    .update({
      status: "failed",
      failure_reason: reason.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", bulkRunId);
  if (error) {
    throw new Error(
      `email_bulk_synthesis: status='failed' UPDATE failed: ${error.message}`,
    );
  }
}

async function completeJob(
  admin: AdminClient,
  jobId: string,
  phase: string,
): Promise<void> {
  const { error } = await admin.rpc("rpc_complete_ai_job", { p_job_id: jobId });
  if (error) {
    throw new Error(
      `email_bulk_synthesis: rpc_complete_ai_job failed (${phase}): ${error.message}`,
    );
  }
}
