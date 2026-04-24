// SLC-035 MT-3 — Pure Bridge-Run Prozess-Logik (DB-agnostisch, testbar mit Mock-Bedrock)
//
// Orchestriert:
//   1. Fuer jedes subtopic_bridge: skip_if pruefen, Bedrock-Call, Parse, Proposal-Record bauen.
//   2. Free-Form: wenn max_proposals > 0: Bedrock-Call, Parse, Proposals bauen.
//   3. Zusammenfassung (total costs, counts) + Cost-Ledger-Entries.
//
// Konsumiert eine injected BedrockCaller. Tests liefern Mock-Implementation.

import type {
  BridgeDiagnosis,
  BridgeEmployee,
  BridgeEmployeeCaptureSchema,
  BridgeKnowledgeUnit,
  BridgeQuestion,
  BridgeSubtopicBridge,
} from "./types";
import { parseFreeFormOutput, parseTemplateRefineOutput } from "./parse-output";
import { buildFreeFormPrompt, buildTemplatePromptForSubtopic } from "./prompts";

// Claude Sonnet eu-central-1 (Bedrock) Pricing (aktueller Stand 2026-04-24)
const COST_PER_INPUT_TOKEN = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000;

export interface BedrockCallResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  modelId: string;
}

export type BedrockCaller = (
  system: string,
  user: string,
  opts?: { temperature?: number; maxTokens?: number }
) => Promise<BedrockCallResult>;

export interface ProposalRecord {
  proposal_mode: "template" | "free_form";
  source_subtopic_key: string | null;
  proposed_block_title: string;
  proposed_block_description: string | null;
  proposed_questions: BridgeQuestion[];
  proposed_employee_user_id: string | null;
  proposed_employee_role_hint: string | null;
}

export interface CostLedgerEntry {
  model_id: string;
  tokens_in: number;
  tokens_out: number;
  usd_cost: number;
  duration_ms: number;
  role: "bridge_engine";
  feature: "bridge_template_refine" | "bridge_free_form";
}

export interface ProcessBridgeRunInput {
  schema: BridgeEmployeeCaptureSchema;
  employees: BridgeEmployee[];
  kus: BridgeKnowledgeUnit[];
  diagnoses: BridgeDiagnosis[];
}

export interface ProcessBridgeRunResult {
  proposals: ProposalRecord[];
  costEntries: CostLedgerEntry[];
  totalCostUsd: number;
  generatedByModel: string | null;
  warnings: string[];
}

function evaluateSkipIf(_skipIf: string | null | undefined): boolean {
  // V4: skip_if-Expressions sind Strings — kein DSL in V4 (Risiko/Scope).
  // Wenn skip_if=null -> nicht skippen. Alles andere wird konservativ ignoriert (nicht skippen).
  // Future: einfaches Expression-Parsing (z.B. "diagnosis.ampel === 'green'").
  return false;
}

// Subtopic-Keys folgen dem Muster "<block-lowercase><num>_<text>" (z.B. "c1_kernablaeufe").
// Da knowledge_unit und block_diagnosis KEINE subtopic_key-Spalte tragen, wird die
// Relevanz fuer ein Subtopic ueber den zugehoerigen block_key entschieden (erster
// Buchstabe des subtopic_key, in Grossbuchstaben).
export function subtopicKeyToBlockKey(subtopicKey: string): string | null {
  const match = subtopicKey.match(/^([a-z])\d+_/i);
  return match ? match[1].toUpperCase() : null;
}

function kusForSubtopic(
  kus: BridgeKnowledgeUnit[],
  subtopicKey: string
): BridgeKnowledgeUnit[] {
  // Bevorzuge exakten subtopic_key-Match falls am KU mitgegeben, fallback auf block_key.
  const exact = kus.filter((k) => k.subtopic_key === subtopicKey);
  if (exact.length > 0) return exact;

  const blockKey = subtopicKeyToBlockKey(subtopicKey);
  if (!blockKey) return [];
  return kus.filter((k) => k.block_key === blockKey);
}

function diagnosesForSubtopic(
  diagnoses: BridgeDiagnosis[],
  subtopicKey: string
): BridgeDiagnosis[] {
  const exact = diagnoses.filter((d) => d.subtopic_key === subtopicKey);
  if (exact.length > 0) return exact;

  const blockKey = subtopicKeyToBlockKey(subtopicKey);
  if (!blockKey) return [];
  return diagnoses.filter((d) => d.block_key === blockKey);
}

function validateEmployeeId(
  id: string | null | undefined,
  employees: BridgeEmployee[]
): string | null {
  if (!id) return null;
  return employees.some((e) => e.user_id === id) ? id : null;
}

function buildTemplateProposal(
  bridge: BridgeSubtopicBridge,
  refine: Awaited<ReturnType<typeof parseTemplateRefineOutput>>,
  employees: BridgeEmployee[]
): ProposalRecord {
  const validUserId = validateEmployeeId(refine.proposed_employee_user_id, employees);

  return {
    proposal_mode: "template",
    source_subtopic_key: bridge.subtopic_key,
    proposed_block_title: refine.adjusted_title ?? bridge.block_template.title,
    proposed_block_description:
      refine.adjusted_description ?? bridge.block_template.description ?? null,
    proposed_questions: refine.adjusted_questions ?? bridge.block_template.questions,
    proposed_employee_user_id: validUserId,
    proposed_employee_role_hint:
      refine.proposed_employee_role_hint ??
      (bridge.typical_employee_role_hints?.[0] ?? null),
  };
}

export async function processBridgeRun(
  input: ProcessBridgeRunInput,
  bedrockCall: BedrockCaller
): Promise<ProcessBridgeRunResult> {
  const { schema, employees, kus, diagnoses } = input;
  const proposals: ProposalRecord[] = [];
  const costEntries: CostLedgerEntry[] = [];
  const warnings: string[] = [];
  let generatedByModel: string | null = null;

  // ---- Template-Refine pro subtopic_bridge ----
  for (const bridge of schema.subtopic_bridges) {
    if (evaluateSkipIf(bridge.skip_if)) continue;

    const subtopicKus = kusForSubtopic(kus, bridge.subtopic_key);
    const subtopicDiag = diagnosesForSubtopic(diagnoses, bridge.subtopic_key);

    // Wenn Subtopic WEDER in KUs NOCH in Diagnosen vorkommt: skip (kein Mehrwert)
    if (subtopicKus.length === 0 && subtopicDiag.length === 0) {
      warnings.push(
        `Subtopic ${bridge.subtopic_key} uebersprungen — nicht in KUs/Diagnose sichtbar`
      );
      continue;
    }

    const prompt = buildTemplatePromptForSubtopic({
      subtopicBridge: bridge,
      subtopicKus,
      subtopicDiagnoses: subtopicDiag,
      employees,
    });

    try {
      const res = await bedrockCall(prompt.system, prompt.user, {
        temperature: 0.3,
        maxTokens: 1024,
      });
      generatedByModel = res.modelId;

      const usdCost =
        res.tokensIn * COST_PER_INPUT_TOKEN + res.tokensOut * COST_PER_OUTPUT_TOKEN;

      costEntries.push({
        model_id: res.modelId,
        tokens_in: res.tokensIn,
        tokens_out: res.tokensOut,
        usd_cost: usdCost,
        duration_ms: res.durationMs,
        role: "bridge_engine",
        feature: "bridge_template_refine",
      });

      const refined = parseTemplateRefineOutput(res.text);
      proposals.push(buildTemplateProposal(bridge, refined, employees));
    } catch (err) {
      warnings.push(
        `Template-Refine fuer ${bridge.subtopic_key} fehlgeschlagen: ${
          err instanceof Error ? err.message : String(err)
        } — Fallback auf unveraenderte Schablone mit erstem role_hint.`
      );
      proposals.push({
        proposal_mode: "template",
        source_subtopic_key: bridge.subtopic_key,
        proposed_block_title: bridge.block_template.title,
        proposed_block_description: bridge.block_template.description ?? null,
        proposed_questions: bridge.block_template.questions,
        proposed_employee_user_id: null,
        proposed_employee_role_hint:
          bridge.typical_employee_role_hints?.[0] ?? null,
      });
    }
  }

  // ---- Free-Form-Slot ----
  const maxFreeForm = schema.free_form_slot?.max_proposals ?? 0;
  if (maxFreeForm > 0) {
    const prompt = buildFreeFormPrompt({
      maxProposals: maxFreeForm,
      systemPromptAddendum: schema.free_form_slot.system_prompt_addendum,
      existingSubtopicKeys: schema.subtopic_bridges.map((b) => b.subtopic_key),
      allKus: kus,
      allDiagnoses: diagnoses,
      employees,
    });

    try {
      const res = await bedrockCall(prompt.system, prompt.user, {
        temperature: 0.5,
        maxTokens: 2048,
      });
      generatedByModel = res.modelId;

      const usdCost =
        res.tokensIn * COST_PER_INPUT_TOKEN + res.tokensOut * COST_PER_OUTPUT_TOKEN;

      costEntries.push({
        model_id: res.modelId,
        tokens_in: res.tokensIn,
        tokens_out: res.tokensOut,
        usd_cost: usdCost,
        duration_ms: res.durationMs,
        role: "bridge_engine",
        feature: "bridge_free_form",
      });

      const freeForm = parseFreeFormOutput(res.text);
      const capped = freeForm.proposals.slice(0, maxFreeForm);

      for (const p of capped) {
        const validUserId = validateEmployeeId(p.proposed_employee_user_id, employees);
        proposals.push({
          proposal_mode: "free_form",
          source_subtopic_key: null,
          proposed_block_title: p.block_title,
          proposed_block_description: p.description ?? null,
          proposed_questions: p.questions,
          proposed_employee_user_id: validUserId,
          proposed_employee_role_hint: p.proposed_employee_role_hint ?? null,
        });
      }
    } catch (err) {
      warnings.push(
        `Free-Form fehlgeschlagen: ${err instanceof Error ? err.message : String(err)} — 0 Free-Form-Proposals.`
      );
    }
  }

  const totalCostUsd = costEntries.reduce((sum, e) => sum + e.usd_cost, 0);

  return {
    proposals,
    costEntries,
    totalCostUsd,
    generatedByModel,
    warnings,
  };
}
