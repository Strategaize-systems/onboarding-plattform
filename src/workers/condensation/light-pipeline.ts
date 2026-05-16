// V6.3 Light-Pipeline Worker-Branch fuer Diagnose-Werkzeug (SLC-105 / FEAT-045).
//
// Diese Datei wird vom knowledge_unit_condensation-Handler aufgerufen, wenn
// das Template-Flag template.metadata.usage_kind === "self_service_partner_diagnostic"
// gesetzt ist (DEC-105 / DEC-126). Auto-Finalize DGN-A schreibt KU direkt als
// status='accepted' ohne Berater-Review-Loop.
//
// Funktionen:
// - computeBlockScores (MT-3) — Pure-Function, deterministischer Score 0-100 pro Block.
// - buildLightPipelinePrompt (MT-4) — Bedrock-Prompt mit Stil-Anker-Auswahl.
// - runLightPipeline (MT-4) — vollstaendige Pipeline:
//     1. Score-Compute (deterministisch)
//     2. Parallel-Bedrock-Verdichtung pro Block (6 Calls via Promise.all)
//     3. Cost-Ledger-INSERT pro Call (ai_cost_ledger)
//     4. RPC rpc_finalize_partner_diagnostic (atomare Tx fuer alle Blocks + capture_session.status)
//     5. error_log mit category=partner_diagnostic_finalized
//
// Bei Fehlern: error_log (level='error', source='partner_diagnostic_failed') und exception
// re-thrown — der Worker setzt den Job dann auf 'failed' via standard Job-Lifecycle.
//
// Ref: docs/ARCHITECTURE.md V6.3-Section, DEC-100/DEC-105/DEC-123..DEC-128, MIG-037, MIG-038.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatWithLLM } from "../../lib/llm";
import { captureException } from "../../lib/logger";

/** Diskreter Frage-Typ. Erweiterbar ohne DB-CHECK (DEC-123). */
export type QuestionType = "multiple_choice" | "likert_5" | "numeric_bucket";

/** Bekannte Frage-Typen. computeBlockScores wirft auf unbekanntem Typ. */
export const KNOWN_QUESTION_TYPES: ReadonlySet<QuestionType> = new Set([
  "multiple_choice",
  "likert_5",
  "numeric_bucket",
]);

/** Eine Antwort-Option + zugehoeriger Score (0-100, deterministisch aus Workshop). */
export interface ScoreMappingEntry {
  label: string;
  score: number;
}

/** Eine Frage aus template.blocks[].questions. */
export interface TemplateQuestion {
  key: string;
  text: string;
  question_type: QuestionType;
  scale_direction: "positive" | "negative";
  score_mapping: ScoreMappingEntry[];
}

/** Ein Baustein aus template.blocks. 4 Fragen pro Block in V6.3-Workshop. */
export interface TemplateBlock {
  key: string;
  title: string;
  intro: string;
  order: number;
  questions: TemplateQuestion[];
  comment_anchors: { low: string; mid: string; high: string };
}

/**
 * Deterministische Score-Berechnung pro Block (DEC-125).
 *
 * Pure Function — keine I/O, keine Side-Effects, kein Bedrock-Call, kein Zufall.
 * Jede Frage liefert einen diskreten Score per `score_mapping`-Lookup auf
 * den exakten Antwort-String. Block-Score = arithmetisches Mittel der Fragen-Scores,
 * gerundet auf eine Ganzzahl (0-100).
 *
 * Wirft bei:
 * - Block ohne questions (Konfig-Fehler)
 * - Unbekanntem question_type (Forward-Compat-Check fuer kuenftige Frage-Typen)
 * - Frage ohne score_mapping (Konfig-Fehler)
 * - Fehlender Antwort (capture_session.answers unvollstaendig)
 * - Antwort, die keinem score_mapping[].label entspricht (R-V63-2 String-Drift)
 *
 * @param blocks  Template-Bloecke aus template.blocks (JSONB)
 * @param answers Antworten aus capture_session.answers (JSONB),
 *                Key=question.key, Value=gewaehlter Label-String
 * @returns Objekt mit Block-Key → Score (0-100)
 */
export function computeBlockScores(
  blocks: TemplateBlock[],
  answers: Record<string, string>,
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const block of blocks) {
    if (!Array.isArray(block.questions) || block.questions.length === 0) {
      throw new Error(`Block "${block.key}" has no questions`);
    }

    const scores: number[] = [];
    for (const q of block.questions) {
      if (!KNOWN_QUESTION_TYPES.has(q.question_type)) {
        throw new Error(
          `Unknown question_type "${q.question_type}" for question ${q.key}`,
        );
      }

      if (!Array.isArray(q.score_mapping) || q.score_mapping.length === 0) {
        throw new Error(`Question "${q.key}" has empty score_mapping`);
      }

      const answer = answers[q.key];
      if (answer === undefined || answer === null || answer === "") {
        throw new Error(`Missing answer for question ${q.key}`);
      }

      const mapping = q.score_mapping.find((m) => m.label === answer);
      if (!mapping) {
        const preview = answer.length > 40 ? `${answer.slice(0, 40)}...` : answer;
        throw new Error(
          `No score mapping for question ${q.key}, answer="${preview}"`,
        );
      }

      scores.push(mapping.score);
    }

    const sum = scores.reduce((a, b) => a + b, 0);
    result[block.key] = Math.round(sum / scores.length);
  }

  return result;
}

// =============================================================================
// MT-4 — runLightPipeline (Bedrock-Verdichtung + atomare DB-Tx)
// =============================================================================

const MODEL_ID =
  process.env.LLM_MODEL || "eu.anthropic.claude-sonnet-4-20250514-v1:0";
const COST_PER_INPUT_TOKEN = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000;

const SCORE_RULE_VERSION = "partner_diagnostic_v1";

/** Light-Session-Input fuer runLightPipeline. */
export interface LightPipelineSession {
  id: string;
  tenant_id: string;
  template_id: string;
  owner_user_id: string;
  answers: Record<string, string>;
}

/** Light-Template-Input fuer runLightPipeline. */
export interface LightPipelineTemplate {
  id: string;
  version: string;
  blocks: TemplateBlock[];
  metadata: { usage_kind?: string; required_closing_statement?: string } & Record<
    string,
    unknown
  >;
}

/** Bedrock-Wrapper-Resultat — text + Cost/Token-Schaetzung. */
export interface BedrockCallResult {
  text: string;
  tokens_in: number;
  tokens_out: number;
  usd_cost: number;
  duration_ms: number;
  model_id: string;
}

/** Injizierbarer Bedrock-Caller fuer Tests. Default = chatWithLLM aus lib/llm. */
export type BedrockCaller = (params: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}) => Promise<BedrockCallResult>;

const defaultBedrockCaller: BedrockCaller = async ({
  system,
  user,
  maxTokens,
  temperature,
}) => {
  const start = Date.now();
  const text = await chatWithLLM(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: temperature ?? 0.3, maxTokens: maxTokens ?? 200 },
  );
  const duration = Date.now() - start;
  // chatWithLLM gibt nur den Text zurueck — Token-Schaetzung wie iteration-loop.ts (~4 chars/token).
  const tokens_in = Math.ceil((system.length + user.length) / 4);
  const tokens_out = Math.ceil(text.length / 4);
  return {
    text,
    tokens_in,
    tokens_out,
    usd_cost:
      tokens_in * COST_PER_INPUT_TOKEN + tokens_out * COST_PER_OUTPUT_TOKEN,
    duration_ms: duration,
    model_id: MODEL_ID,
  };
};

/** Resultat von runLightPipeline (fuer Logging/Tests). */
export interface LightPipelineResult {
  block_count: number;
  knowledge_unit_ids: string[];
  capture_session_id: string;
  total_score_avg: number;
  cost_usd: number;
  duration_ms: number;
}

/** Stil-Anker fuer den Bedrock-Prompt waehlen — basierend auf Score-Bereich. */
function pickStyleAnchor(
  anchors: { low: string; mid: string; high: string },
  score: number,
): { range: "low" | "mid" | "high"; text: string } {
  if (score <= 30) return { range: "low", text: anchors.low };
  if (score <= 55) return { range: "mid", text: anchors.mid };
  return { range: "high", text: anchors.high };
}

/**
 * Bedrock-Prompt-Struktur fuer einen Block (V6.3 Architecture Z.5883-5905).
 * System: nuechterner Berater-Stil, 2-3 Saetze deutsch.
 * User: Block-Titel + Intro + Score + Stil-Anker + Frage-Antwort-Paare.
 */
export function buildLightPipelinePrompt(params: {
  block: TemplateBlock;
  answers: Record<string, string>;
  score: number;
}): { system: string; user: string } {
  const { block, answers, score } = params;
  const anchor = pickStyleAnchor(block.comment_anchors, score);

  const system =
    "Du bist ein nuechterner Berater, der Diagnose-Antworten zu Strukturreife " +
    "und KI-Tauglichkeit kommentiert. Antworte in 2-3 Saetzen pro Block, " +
    "deutsch, prosaisch (keine Bullet-Listen, keine Empfehlungen, keine Aufzaehlungen). " +
    "Stil: ehrlich, direkt, nicht beratungs-floskelhaft.";

  const answerLines = block.questions
    .map((q) => `- ${q.text}: ${answers[q.key] ?? "(keine Antwort)"}`)
    .join("\n");

  const user =
    `Bewerteter Baustein: ${block.title}\n` +
    `Block-Beschreibung: ${block.intro}\n` +
    `Berechneter Score: ${score} (Skala 0-100, 100 = beste Strukturreife)\n` +
    `Stil-Anker fuer Score-Bereich ${anchor.range}: "${anchor.text}"\n\n` +
    `Antworten des Mandanten:\n${answerLines}\n\n` +
    "Schreibe einen kommentierenden Absatz im Stil des Stil-Ankers, der die konkreten " +
    "Antworten des Mandanten aufgreift. Erwaehne KEINE Score-Zahlen, KEINE konkreten Fragen-Texte.";

  return { system, user };
}

/** Deterministische content_hash-Berechnung (sha256) ueber kanonisiertes Block-Answers-JSON. */
function computeContentHash(blockAnswers: Record<string, string>): string {
  const sortedKeys = Object.keys(blockAnswers).sort();
  const canonical = JSON.stringify(
    Object.fromEntries(sortedKeys.map((k) => [k, blockAnswers[k]])),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Light-Pipeline fuer V6.3 DGN-A Diagnose-Finalisierung.
 *
 * Steps:
 *  1. computeBlockScores (deterministisch, wirft auf Konfig-Drift)
 *  2. 6 parallele Bedrock-Calls fuer Block-Kommentare (~15s total)
 *  3. ai_cost_ledger-INSERT pro Block-Call
 *  4. rpc_finalize_partner_diagnostic (eine atomare Tx fuer alle Blocks + capture_session.status)
 *  5. error_log mit level='info' + source='partner_diagnostic_finalized'
 *
 * Bei Fehler in Score-Compute, Bedrock oder RPC:
 *  - error_log mit level='error' + source='partner_diagnostic_failed'
 *  - Exception re-thrown (Caller-Job geht auf 'failed', capture_session bleibt 'submitted')
 *
 * @returns LightPipelineResult mit block_count, KU-IDs, total_score_avg, cost_usd, duration_ms.
 * @throws bei Score-Konfig-Drift, Bedrock-Fehler, oder RPC-Tx-Fehler.
 */
export async function runLightPipeline(params: {
  session: LightPipelineSession;
  template: LightPipelineTemplate;
  adminClient: SupabaseClient;
  jobId: string;
  bedrockCaller?: BedrockCaller;
}): Promise<LightPipelineResult> {
  const { session, template, adminClient, jobId } = params;
  const bedrock = params.bedrockCaller ?? defaultBedrockCaller;
  const startTime = Date.now();

  // Step 1 — Score-Compute (deterministisch)
  let scores: Record<string, number>;
  try {
    scores = computeBlockScores(template.blocks, session.answers);
  } catch (err) {
    await logFailure(adminClient, session, "score_compute_failed", err);
    throw err;
  }

  // Step 2+3 — Parallel Bedrock-Verdichtung + Cost-Ledger
  let blockResults: Array<{
    block: TemplateBlock;
    score: number;
    comment: string;
    cost: BedrockCallResult;
  }>;
  try {
    blockResults = await Promise.all(
      template.blocks.map(async (block) => {
        const score = scores[block.key];
        const prompt = buildLightPipelinePrompt({
          block,
          answers: session.answers,
          score,
        });
        const result = await bedrock({
          system: prompt.system,
          user: prompt.user,
          maxTokens: 200,
          temperature: 0.3,
        });

        const { error: costError } = await adminClient
          .from("ai_cost_ledger")
          .insert({
            tenant_id: session.tenant_id,
            job_id: jobId,
            model_id: result.model_id,
            tokens_in: result.tokens_in,
            tokens_out: result.tokens_out,
            usd_cost: result.usd_cost,
            duration_ms: result.duration_ms,
            iteration: 1,
            role: "light_pipeline_block",
          });
        if (costError) {
          // Cost-Logging-Fehler ist nicht-fatal — captureException + weiter
          captureException(
            new Error(`Failed cost-ledger INSERT: ${costError.message}`),
            { source: "light-pipeline", metadata: { jobId, block: block.key } },
          );
        }

        return { block, score, comment: result.text, cost: result };
      }),
    );
  } catch (err) {
    await logFailure(adminClient, session, "bedrock_failed", err);
    throw err;
  }

  // Step 4 — Atomare Tx via rpc_finalize_partner_diagnostic
  const rpcBlocks = blockResults.map(({ block, score, comment }) => {
    const blockAnswers: Record<string, string> = {};
    for (const q of block.questions) {
      blockAnswers[q.key] = session.answers[q.key] ?? "";
    }
    const contentHash = computeContentHash(blockAnswers);
    return {
      block_key: block.key,
      title: block.title,
      body: comment,
      content: blockAnswers,
      content_hash: contentHash,
      metadata: {
        score,
        comment,
        score_rule_version: SCORE_RULE_VERSION,
        block_intro: block.intro,
      },
    };
  });

  const { data: rpcResult, error: rpcError } = await adminClient.rpc(
    "rpc_finalize_partner_diagnostic",
    {
      p_payload: {
        capture_session_id: session.id,
        tenant_id: session.tenant_id,
        owner_user_id: session.owner_user_id,
        blocks: rpcBlocks,
      },
    },
  );
  if (rpcError) {
    const err = new Error(
      `rpc_finalize_partner_diagnostic failed: ${rpcError.message}`,
    );
    await logFailure(adminClient, session, "finalize_rpc_failed", err);
    throw err;
  }

  const result = rpcResult as {
    block_count: number;
    knowledge_unit_ids: string[];
    capture_session_id: string;
  };

  // Step 5 — Success-Log
  const totalDuration = Date.now() - startTime;
  const scoreValues = Object.values(scores);
  const totalScoreAvg = Math.round(
    scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length,
  );
  const totalCost = blockResults.reduce((a, b) => a + b.cost.usd_cost, 0);

  const { error: logError } = await adminClient.from("error_log").insert({
    level: "info",
    source: "partner_diagnostic_finalized",
    message:
      `Partner-Diagnostic finalized for session ${session.id}: ` +
      `${result.block_count} blocks, avg score=${totalScoreAvg}, ` +
      `$${totalCost.toFixed(4)}, ${totalDuration}ms`,
    metadata: {
      session_id: session.id,
      tenant_id: session.tenant_id,
      template_id: template.id,
      template_version: template.version,
      block_count: result.block_count,
      total_score_avg: totalScoreAvg,
      duration_ms: totalDuration,
      cost_usd: totalCost,
      scores,
    },
  });
  if (logError) {
    captureException(
      new Error(`Failed success error_log INSERT: ${logError.message}`),
      { source: "light-pipeline", metadata: { jobId } },
    );
  }

  return {
    block_count: result.block_count,
    knowledge_unit_ids: result.knowledge_unit_ids,
    capture_session_id: result.capture_session_id,
    total_score_avg: totalScoreAvg,
    cost_usd: totalCost,
    duration_ms: totalDuration,
  };
}

/** Failure-Log fuer error_log (level='error', source='partner_diagnostic_failed'). */
async function logFailure(
  adminClient: SupabaseClient,
  session: LightPipelineSession,
  reason: string,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const { error: logError } = await adminClient.from("error_log").insert({
    level: "error",
    source: "partner_diagnostic_failed",
    message: `Partner-Diagnostic failed for session ${session.id}: ${reason} — ${message}`,
    stack,
    metadata: {
      session_id: session.id,
      tenant_id: session.tenant_id,
      reason,
    },
  });
  if (logError) {
    captureException(
      new Error(`Failed failure error_log INSERT: ${logError.message}`),
      { source: "light-pipeline", metadata: { sessionId: session.id } },
    );
  }
}
