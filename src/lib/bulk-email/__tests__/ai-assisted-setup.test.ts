// V9.1 SLC-V9.1-D MT-3 — summarizeSetupIntent tests (hermetisch, Mock-Bedrock).
// Echte Bedrock-Calls (eu-central-1) sind im Live-Smoke (deferred) abgedeckt.

import { describe, it, expect, afterEach } from "vitest";
import {
  summarizeSetupIntent,
  __setSetupCallerForTests,
  __resetSetupCallerForTests,
  SetupSuggestionError,
} from "../ai-assisted-setup";

afterEach(() => __resetSetupCallerForTests());

describe("summarizeSetupIntent", () => {
  it("parses a valid JSON suggestion", async () => {
    __setSetupCallerForTests(async () => ({
      text: JSON.stringify({
        suggestedLocalPart: "bulk-steuerberater",
        suggestedAllowlistPatterns: ["kanzlei-mueller.de"],
        reasoning: "Du willst Mails vom Steuerberater weiterleiten.",
      }),
    }));

    const r = await summarizeSetupIntent("Alle Mails von kanzlei-mueller.de");
    expect(r.suggestedLocalPart).toBe("bulk-steuerberater");
    expect(r.suggestedAllowlistPatterns).toEqual(["kanzlei-mueller.de"]);
    expect(r.reasoning).toMatch(/Steuerberater/);
  });

  it("strips a markdown code block before parsing", async () => {
    __setSetupCallerForTests(async () => ({
      text:
        '```json\n{"suggestedLocalPart":"bulk-vertrieb",' +
        '"suggestedAllowlistPatterns":[],"reasoning":"Vertriebs-Postfach."}\n```',
    }));
    const r = await summarizeSetupIntent("Vertriebsmails");
    expect(r.suggestedLocalPart).toBe("bulk-vertrieb");
    expect(r.suggestedAllowlistPatterns).toEqual([]);
  });

  it("throws SetupSuggestionError on non-JSON output", async () => {
    __setSetupCallerForTests(async () => ({ text: "Klar, hier dein Setup!" }));
    await expect(summarizeSetupIntent("x")).rejects.toBeInstanceOf(
      SetupSuggestionError,
    );
  });

  it("throws SetupSuggestionError on schema drift (bad local-part)", async () => {
    __setSetupCallerForTests(async () => ({
      text: JSON.stringify({
        suggestedLocalPart: "steuerberater", // missing bulk- prefix
        suggestedAllowlistPatterns: [],
        reasoning: "x",
      }),
    }));
    await expect(summarizeSetupIntent("x")).rejects.toBeInstanceOf(
      SetupSuggestionError,
    );
  });

  it("rejects empty input before calling the model", async () => {
    let called = false;
    __setSetupCallerForTests(async () => {
      called = true;
      return { text: "{}" };
    });
    await expect(summarizeSetupIntent("   ")).rejects.toThrow(/leere Eingabe/);
    expect(called).toBe(false);
  });
});
