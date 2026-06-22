// V10 SLC-174 MT-1 — Tests fuer synthesizeModuleOutput (DI raw caller, kein Bedrock).

import { afterEach, describe, it, expect, vi } from "vitest";
import {
  synthesizeModuleOutput,
  invokeModuleJson,
  ModuleSynthesisError,
  __setModuleCallerForTests,
  __resetModuleCallerForTests,
  type RawModuleCaller,
} from "../synthesize-module-output";
import { ModuleDraftSchema } from "../synthesis-prompt";
import type { ModuleContext } from "../module-context";

const ctx: ModuleContext = {
  modulKey: "m04",
  name: "M-04",
  description: "",
  blocks: [],
  metadata: {
    modul_id: "M-04",
    modul_key: "m04",
    modul_kategorie: "",
    output_contract: { kinds: [], ki_hebel_kind: "ki_hebel", reifegrad_range: [1, 4], beschreibung: "" },
    themenmodell: [],
    dod: "",
    output_artefakte: [],
    symptome: [],
    abgrenzung: "",
    ki_hebel: [],
  },
};

function caller(text: string, usage = { tokensIn: 200, tokensOut: 100 }): RawModuleCaller {
  return vi.fn(async () => ({ text, ...usage, latencyMs: 99 }));
}

afterEach(() => __resetModuleCallerForTests());

describe("synthesizeModuleOutput", () => {
  it("parses valid JSON output and computes USD cost from real tokens", async () => {
    __setModuleCallerForTests(
      caller(
        JSON.stringify({
          triple: [{ output_kind: "entscheidung", title: "T", body: "B", evidence_frage_ids: ["F-M04-001"] }],
          ki_hebel: [],
        }),
      ),
    );
    const result = await synthesizeModuleOutput(ctx, []);
    expect(result.data.triple[0].output_kind).toBe("entscheidung");
    expect(result.tokensIn).toBe(200);
    expect(result.region).toBe("eu-central-1");
    // 200*3/1e6 + 100*15/1e6 = 0.0006 + 0.0015 = 0.0021
    expect(result.costUsd).toBeCloseTo(0.0021, 6);
  });

  it("strips a ```json code fence before parsing", async () => {
    __setModuleCallerForTests(
      caller('```json\n{"triple":[],"ki_hebel":[]}\n```'),
    );
    const result = await synthesizeModuleOutput(ctx, []);
    expect(result.data.triple).toEqual([]);
  });

  it("throws ModuleSynthesisError on non-JSON output", async () => {
    __setModuleCallerForTests(caller("not json at all"));
    await expect(synthesizeModuleOutput(ctx, [])).rejects.toBeInstanceOf(ModuleSynthesisError);
  });

  it("throws ModuleSynthesisError on schema mismatch", async () => {
    __setModuleCallerForTests(
      caller(JSON.stringify({ triple: [{ output_kind: "bogus", title: "", body: "" }] })),
    );
    await expect(invokeModuleJson(ModuleDraftSchema, "sys", "user")).rejects.toBeInstanceOf(
      ModuleSynthesisError,
    );
  });

  it("throws on empty response text", async () => {
    __setModuleCallerForTests(caller(""));
    await expect(synthesizeModuleOutput(ctx, [])).rejects.toThrow(/empty response/);
  });
});
