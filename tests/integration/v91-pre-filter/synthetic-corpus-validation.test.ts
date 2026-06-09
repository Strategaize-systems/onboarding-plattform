// V9.1 SLC-V9.1-A MT-1 — Synthetic-Corpus Skeleton-Validation
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer + Skeleton-Validation
// Spec: slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-1)
// DEC-195: Skeleton-Validation, NICHT Gate. Telemetry-Output Precision/Recall/F1.
//
// Run:
//   RUN_V91_SKELETON_VALIDATION=true npx vitest run tests/integration/v91-pre-filter/synthetic-corpus-validation.test.ts
//
// Pre-Cond:
//   - AWS-Bedrock-ENVs available (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION=eu-central-1)
//   - test-fixtures/v91-mbox-corpus/synthetic.yaml exists (45 entries)
//
// Cost-Estimate:
//   45 sequential Haiku-Calls a ~$0.0002 = ~$0.01 USD = ~0.01 EUR
//   Slice-Spec upper-bound: <= 0.05 EUR
//
// Telemetry-Output (console.log):
//   - Per-Email: corpus_id, ground_truth, predicted, label, confidence, cost
//   - Aggregate: TP/FP/FN/TN, Precision/Recall/F1, total + per-email cost
//   - Soft-Warn if F1 < 0.7 (kein test fail — IMP-Carry-Over zu V9.1.x falls noetig)

import { describe, expect, it } from "vitest";

import { invokeHaiku } from "../../../src/lib/ai/bedrock-haiku";
import {
  PRE_FILTER_BATCH_RESULT_SCHEMA,
  type PreFilterLabel,
} from "../../../src/lib/bulk-email/pre-filter/labels";
import {
  V9_PRE_FILTER_SYSTEM_PROMPT,
  buildPreFilterUserPrompt,
} from "../../../src/lib/bulk-email/pre-filter/prompt";

import {
  corpusEntryToPromptInput,
  parseCorpusYaml,
  type CorpusEntry,
  type GroundTruthClassification,
} from "./corpus-to-eml";

const RUN_FLAG = process.env.RUN_V91_SKELETON_VALIDATION === "true";

// V9 Worker maps 6-label-Haiku-Output to binary "valuable" / "skip" via:
//   - "content" -> valuable (only label that produces pattern-extraction material)
//   - everything else -> skip (short_reply, notification, newsletter, private, unclear)
function haikuLabelToBinary(label: PreFilterLabel): GroundTruthClassification {
  return label === "content" ? "valuable" : "skip";
}

interface PerEmailResult {
  corpus_id: string;
  ground_truth: GroundTruthClassification;
  predicted: GroundTruthClassification;
  haiku_label: PreFilterLabel;
  confidence: number;
  cost_usd: number;
  cost_eur: number;
}

describe.runIf(RUN_FLAG)(
  "V9.1 Synthetic-Corpus Skeleton-Validation",
  () => {
    it(
      "classifies 45 synthetic emails and reports Precision/Recall/F1",
      { timeout: 600_000 },
      async () => {
        const corpus = parseCorpusYaml();
        const results: PerEmailResult[] = [];

        // V9.0-Pragmatismus: feste Approximation USD -> EUR (DEC-181 + DEC-182)
        const USD_TO_EUR_APPROX = 0.92;

        for (const entry of corpus) {
          const promptInput = corpusEntryToPromptInput(entry);
          const userPrompt = buildPreFilterUserPrompt([promptInput]);

          const callResult = await invokeHaiku(
            {
              system: V9_PRE_FILTER_SYSTEM_PROMPT,
              user: userPrompt,
            },
            PRE_FILTER_BATCH_RESULT_SCHEMA,
          );

          // batch-of-1 -> exactly 1 result expected; fall back to "unclear" if model returned 0
          const haikuResult = callResult.data[0];
          const haikuLabel: PreFilterLabel =
            haikuResult?.label ?? "unclear";
          const confidence = haikuResult?.confidence ?? 0;
          const predicted = haikuLabelToBinary(haikuLabel);

          results.push({
            corpus_id: entry.id,
            ground_truth: entry.expected_classification,
            predicted,
            haiku_label: haikuLabel,
            confidence,
            cost_usd: callResult.costUsd,
            cost_eur: callResult.costUsd * USD_TO_EUR_APPROX,
          });

          // eslint-disable-next-line no-console
          console.log(
            `[corpus_${entry.id}] truth=${entry.expected_classification} predicted=${predicted} (haiku=${haikuLabel} conf=${confidence.toFixed(2)}) cost=$${callResult.costUsd.toFixed(5)}`,
          );
        }

        // Aggregate metrics for positive-class = "valuable"
        let tp = 0;
        let fp = 0;
        let fn = 0;
        let tn = 0;
        for (const r of results) {
          const truth = r.ground_truth;
          const pred = r.predicted;
          if (truth === "valuable" && pred === "valuable") tp += 1;
          else if (truth === "skip" && pred === "valuable") fp += 1;
          else if (truth === "valuable" && pred === "skip") fn += 1;
          else if (truth === "skip" && pred === "skip") tn += 1;
        }

        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 =
          precision + recall > 0
            ? (2 * precision * recall) / (precision + recall)
            : 0;

        const totalUsd = results.reduce((s, r) => s + r.cost_usd, 0);
        const totalEur = results.reduce((s, r) => s + r.cost_eur, 0);
        const perEmailUsd = totalUsd / results.length;
        const perEmailEur = totalEur / results.length;

        // Telemetry-Output (per slice-spec, written to console for observability)
        // eslint-disable-next-line no-console
        console.log(
          `\n========== V9.1 Skeleton-Validation Telemetry ==========\n` +
            `  Emails:          ${results.length}\n` +
            `  Ground-truth:    ${results.filter((r) => r.ground_truth === "valuable").length} valuable, ${results.filter((r) => r.ground_truth === "skip").length} skip\n` +
            `  TP / FP / FN / TN: ${tp} / ${fp} / ${fn} / ${tn}\n` +
            `  Precision:       ${precision.toFixed(3)}\n` +
            `  Recall:          ${recall.toFixed(3)}\n` +
            `  F1:              ${f1.toFixed(3)}\n` +
            `  Total cost:      $${totalUsd.toFixed(4)} USD / ${totalEur.toFixed(4)} EUR\n` +
            `  Per-email cost:  $${perEmailUsd.toFixed(5)} USD / ${perEmailEur.toFixed(5)} EUR\n` +
            `========================================================\n`,
        );

        // Soft-warn if F1 below 0.7 — surfaces in console but does not fail the test
        if (f1 < 0.7) {
          // eslint-disable-next-line no-console
          console.warn(
            `[V9.1 Skeleton-Validation] F1=${f1.toFixed(3)} < 0.7 threshold. Consider IMP-Carry-Over to V9.1.x for prompt-tuning.`,
          );
        }

        // Always-pass assertion per slice-spec L99 (Skeleton-Validation, not Gate)
        expect(results.length).toBe(45);
      },
    );
  },
);

describe.skipIf(RUN_FLAG)(
  "V9.1 Synthetic-Corpus Skeleton-Validation (skipped — set RUN_V91_SKELETON_VALIDATION=true to run)",
  () => {
    it("placeholder", () => {
      expect(true).toBe(true);
    });
  },
);
