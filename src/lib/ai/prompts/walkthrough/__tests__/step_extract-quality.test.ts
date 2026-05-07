// Step-Extraction-Live-Quality-Test (SLC-077 MT-4b, Variante B).
//
// Ruft real Bedrock (eu-central-1, Sonnet) mit dem produktiven step_extract-System-Prompt
// gegen 5 strukturierte deutsche Walkthrough-Fixtures auf. Misst pro Fixture:
//   - Schritt-Anzahl >= expectedMinSteps
//   - Action-Pattern-Coverage (jedes erwartete Pattern wird von mindestens einer action gematcht)
//   - 0 PII-Halluzinationen in action-Strings (kein Platzhalter-Token wie [KUNDE], [EMAIL] etc.)
//
// Gating:
//   - Standard-`npm run test` skipt diesen Test (Bedrock-Kosten).
//   - Aktivierung: `ENABLE_STEP_QUALITY_TEST=1 npm run test -- step_extract-quality`.
//   - Erwartete Kosten: 5 Bedrock-Calls × ~1-2k Output-Tokens = ~$0.05 pro Run.
//
// AWS-ENV (Pflicht):
//   AWS_REGION=eu-central-1 (oder via factory default)
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (oder IAM-Role)

import { describe, it, expect } from "vitest";

import {
  buildStepExtractSystemPrompt,
  buildStepExtractUserMessage,
} from "../step_extract";
import { StepExtractArraySchema } from "../step_extract.schema";
import { chatWithLLM } from "@/lib/llm";
import { ALL_STRUCTURED_FIXTURES } from "@/workers/walkthrough/__tests__/fixtures/walkthrough-extracts";

const RUN_TEST = process.env.ENABLE_STEP_QUALITY_TEST === "1";

const PII_TOKEN_REGEX = /\[(KUNDE|EMAIL|TEL|IBAN|PREIS_BETRAG|INTERNE_ID|INTERN_KOMM)\]/i;

async function callBedrock(redactedText: string): Promise<string> {
  const systemPrompt = buildStepExtractSystemPrompt();
  const userMessage = buildStepExtractUserMessage(redactedText);

  return chatWithLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    { temperature: 0, maxTokens: 8000 },
  );
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
  }
  return trimmed;
}

describe.skipIf(!RUN_TEST)(
  "Step extraction live quality test (Bedrock, eu-central-1)",
  () => {
    for (const fixture of ALL_STRUCTURED_FIXTURES) {
      it(
        `extracts >= ${fixture.expectedMinSteps} clean steps from '${fixture.id}'`,
        async () => {
          const raw = await callBedrock(fixture.body);
          const json = stripCodeFence(raw);

          // 1. JSON parsen + Zod-Schema validieren — strukturelle Pflicht.
          const parsed = JSON.parse(json);
          const validation = StepExtractArraySchema.safeParse(parsed);
          expect(validation.success, `Zod fehler: ${JSON.stringify(validation, null, 2)}`).toBe(
            true,
          );
          if (!validation.success) return;
          const items = validation.data;

          // 2. Schritt-Anzahl >= expectedMinSteps.
          expect(
            items.length,
            `Fixture '${fixture.id}' lieferte nur ${items.length} Schritte, erwartet >= ${fixture.expectedMinSteps}`,
          ).toBeGreaterThanOrEqual(fixture.expectedMinSteps);

          // 3. Halluzinations-Check — keine PII-Platzhalter in action.
          const piiHallucinations = items
            .filter((item) => PII_TOKEN_REGEX.test(item.action))
            .map((item) => `step ${item.step_number}: "${item.action}"`);
          expect(
            piiHallucinations,
            `PII-Halluzinationen in actions: ${piiHallucinations.join(" | ")}`,
          ).toEqual([]);

          // 4. Action-Pattern-Coverage — jedes erwartete Pattern matcht mindestens eine action.
          for (const pattern of fixture.expectedActionPatterns) {
            const matched = items.some((item) => pattern.test(item.action));
            expect(
              matched,
              `Pattern ${pattern} matched keine action in '${fixture.id}'. Actions: ${items
                .map((i) => i.action)
                .join(" | ")}`,
            ).toBe(true);
          }

          // 5. Step-Numbers monotonic + ohne Luecken (Worker erzwingt das ohnehin, aber Bedrock-Output sollte nahe dran sein).
          const numbers = items.map((i) => i.step_number);
          const sortedUnique = [...new Set(numbers)].sort((a, b) => a - b);
          expect(
            sortedUnique,
            `step_numbers nicht eindeutig: ${numbers.join(",")}`,
          ).toEqual(numbers);
        },
        90_000,
      );
    }
  },
);

// Sanity-Test ohne Gate — zeigt nur Setup/Skip-Status.
describe("Step quality test runner", () => {
  it("is gated behind ENABLE_STEP_QUALITY_TEST=1", () => {
    if (RUN_TEST) {
      expect(process.env.ENABLE_STEP_QUALITY_TEST).toBe("1");
    } else {
      expect(RUN_TEST).toBe(false);
    }
  });
});
