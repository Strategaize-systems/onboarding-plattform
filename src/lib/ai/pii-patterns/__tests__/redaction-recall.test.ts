// PII-Recall-Test-Suite — V5 Option 2 Stufe 1 (SLC-076 MT-3, SC-V5-6).
//
// Ruft real Bedrock (eu-central-1, Sonnet) mit dem produktiven pii_redact-System-Prompt auf,
// pro Kategorie einen Aufruf gegen einen zusammenhaengenden Walkthrough-Block aus 50 Saetzen.
// Misst Recall = (1 - missed/total) und assertiert pro-Kategorie + global ≥0.9.
//
// Gating:
//   - Standard-`npm run test` skipt diesen Test (Bedrock-Kosten).
//   - Aktivierung: `ENABLE_PII_RECALL_TEST=1 npm run test -- redaction-recall`.
//   - Erwartete Kosten: ~7 Bedrock-Calls × ~5k Output-Tokens = ~$0.02-0.05 pro Run.
//
// AWS-ENV (Pflicht):
//   AWS_REGION=eu-central-1 (oder via factory default)
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (oder IAM-Role)

import { describe, it, expect } from "vitest";

import { PII_CATEGORIES, type PiiCategory } from "..";
import {
  buildPiiRedactSystemPrompt,
  buildPiiRedactUserMessage,
} from "@/lib/ai/prompts/walkthrough/pii_redact";
import { chatWithLLM } from "@/lib/llm";
import { ALL_FIXTURES, fixturesByCategory } from "./fixtures/de-walkthroughs";

const RECALL_THRESHOLD = 0.9;
const RUN_TEST = process.env.ENABLE_PII_RECALL_TEST === "1";

interface CategoryRecall {
  category: PiiCategory;
  totalItems: number;
  missedItems: string[];
  recall: number;
}

async function measureCategoryRecall(category: PiiCategory): Promise<CategoryRecall> {
  const fixtures = fixturesByCategory(category);
  const block = fixtures.map((f) => f.sentence).join("\n");
  const expectedItems = fixtures.flatMap((f) => f.expectedItems);

  const systemPrompt = buildPiiRedactSystemPrompt();
  const userMessage = buildPiiRedactUserMessage(block);

  const redacted = await chatWithLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    { temperature: 0, maxTokens: 8000 },
  );

  const missedItems = expectedItems.filter((item) => redacted.includes(item));
  const recall = 1 - missedItems.length / expectedItems.length;

  return {
    category,
    totalItems: expectedItems.length,
    missedItems,
    recall,
  };
}

describe.skipIf(!RUN_TEST)("PII Redaction Recall (Bedrock live, SC-V5-6)", () => {
  const results: CategoryRecall[] = [];

  it("global fixture summary", () => {
    expect(ALL_FIXTURES.length).toBeGreaterThanOrEqual(350);
    const totalExpected = ALL_FIXTURES.reduce((sum, f) => sum + f.expectedItems.length, 0);
    expect(totalExpected).toBeGreaterThanOrEqual(350);
  });

  for (const category of PII_CATEGORIES) {
    it(
      `category=${category}: recall >= ${RECALL_THRESHOLD}`,
      { timeout: 90_000 },
      async () => {
        const result = await measureCategoryRecall(category);
        results.push(result);

        // Pro-Kategorie-Diagnose im Test-Output
         
        console.log(
          `[recall] ${result.category}: ${(result.recall * 100).toFixed(1)}% (${
            result.totalItems - result.missedItems.length
          }/${result.totalItems} redacted, ${result.missedItems.length} missed)`,
        );
        if (result.missedItems.length > 0) {
           
          console.log(`  missed examples: ${result.missedItems.slice(0, 5).join(" | ")}`);
        }

        expect(result.recall).toBeGreaterThanOrEqual(RECALL_THRESHOLD);
      },
    );
  }

  it("global recall >= threshold", () => {
    expect(results.length).toBe(PII_CATEGORIES.length);
    const totalExpected = results.reduce((sum, r) => sum + r.totalItems, 0);
    const totalMissed = results.reduce((sum, r) => sum + r.missedItems.length, 0);
    const globalRecall = 1 - totalMissed / totalExpected;
     
    console.log(
      `[recall] GLOBAL: ${(globalRecall * 100).toFixed(1)}% (${
        totalExpected - totalMissed
      }/${totalExpected} redacted)`,
    );
    expect(globalRecall).toBeGreaterThanOrEqual(RECALL_THRESHOLD);
  });
});

describe("PII Redaction fixtures sanity (no Bedrock)", () => {
  it("liefert mindestens 50 Fixtures pro Kategorie", () => {
    for (const category of PII_CATEGORIES) {
      const count = fixturesByCategory(category).length;
      expect(count, `category ${category} has ${count} fixtures`).toBeGreaterThanOrEqual(50);
    }
  });

  it("jede Fixture enthaelt ihre expectedItems-Strings im Satz", () => {
    for (const fixture of ALL_FIXTURES) {
      for (const item of fixture.expectedItems) {
        expect(
          fixture.sentence.includes(item),
          `fixture sentence does not include item: ${item}`,
        ).toBe(true);
      }
    }
  });
});
