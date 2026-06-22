// V10 SLC-174 MT-2 — Tests fuer inferReifegrad (deterministisch) + critiqueModuleOutput (DI).

import { afterEach, describe, it, expect } from "vitest";
import { inferReifegrad, critiqueModuleOutput, FALLBACK_REIFEGRAD } from "../critic";
import {
  __setModuleCallerForTests,
  __resetModuleCallerForTests,
} from "../synthesize-module-output";
import type { KiHebelCatalogEntry, ModuleContext } from "../module-context";
import type { ModuleHebelItem } from "../synthesis-prompt";

const catalog: KiHebelCatalogEntry[] = [
  { hebel_id: "H-M04-001", name: "Monatsreport-Autokommentar", beschreibung: "", reifegrad: 2, referenz: "" },
  { hebel_id: "H-M04-009", name: "Rolling-Forecast-Agent", beschreibung: "", reifegrad: 3, referenz: "" },
];

function hebel(p: Partial<ModuleHebelItem>): ModuleHebelItem {
  return { name: "X", body: "Y", evidence_frage_ids: [], ...p };
}

describe("inferReifegrad (DEC-245 — catalog is authoritative)", () => {
  it("uses catalog reifegrad on hebel_id match", () => {
    const r = inferReifegrad(hebel({ hebel_id: "H-M04-009", reifegrad: 1 }), catalog);
    expect(r).toEqual({ reifegrad: 3, source: "catalog" }); // catalog wins over model's 1
  });

  it("falls back to case-insensitive name match", () => {
    const r = inferReifegrad(hebel({ name: "  monatsreport-autokommentar " }), catalog);
    expect(r).toEqual({ reifegrad: 2, source: "catalog" });
  });

  it("clamps a model-proposed reifegrad for non-catalog hebel", () => {
    expect(inferReifegrad(hebel({ name: "Neu", reifegrad: 7 }), catalog)).toEqual({
      reifegrad: 4,
      source: "model_clamped",
    });
    expect(inferReifegrad(hebel({ name: "Neu", reifegrad: 0 }), catalog)).toEqual({
      reifegrad: 1,
      source: "model_clamped",
    });
    expect(inferReifegrad(hebel({ name: "Neu", reifegrad: 3 }), catalog)).toEqual({
      reifegrad: 3,
      source: "model_clamped",
    });
  });

  it("falls back to default when no catalog match and no valid model value", () => {
    expect(inferReifegrad(hebel({ name: "Neu" }), catalog)).toEqual({
      reifegrad: FALLBACK_REIFEGRAD,
      source: "fallback",
    });
    expect(inferReifegrad(hebel({ name: "Neu", reifegrad: null }), catalog)).toEqual({
      reifegrad: FALLBACK_REIFEGRAD,
      source: "fallback",
    });
  });
});

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
    ki_hebel: catalog,
  },
};

afterEach(() => __resetModuleCallerForTests());

describe("critiqueModuleOutput", () => {
  it("returns the refined draft from a single LLM call", async () => {
    let calls = 0;
    __setModuleCallerForTests(async () => {
      calls += 1;
      return {
        text: JSON.stringify({
          triple: [{ output_kind: "standard", title: "Verbessert", body: "Konkreter", evidence_frage_ids: ["F-M04-002"] }],
          ki_hebel: [],
        }),
        tokensIn: 300,
        tokensOut: 150,
        latencyMs: 80,
      };
    });
    const result = await critiqueModuleOutput(ctx, [], {
      triple: [{ output_kind: "standard", title: "Roh", body: "vage", evidence_frage_ids: [] }],
      ki_hebel: [],
    });
    expect(calls).toBe(1); // bounded: genau 1 Call
    expect(result.data.triple[0].title).toBe("Verbessert");
    expect(result.costUsd).toBeGreaterThan(0);
  });
});
