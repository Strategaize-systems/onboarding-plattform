// V10 SLC-174 MT-1 — Pure-Tests fuer synthesis-prompt (Schema + Prompt-Bau).

import { describe, it, expect } from "vitest";
import {
  ModuleDraftSchema,
  buildModuleSynthesisUserPrompt,
  buildModuleCriticUserPrompt,
} from "../synthesis-prompt";
import type { ModuleContext, QaPair } from "../module-context";

const ctx: ModuleContext = {
  modulKey: "m04",
  name: "M-04 – Finanzsteuerung",
  description: "Test",
  blocks: [],
  metadata: {
    modul_id: "M-04",
    modul_key: "m04",
    modul_kategorie: "Finanzen",
    output_contract: {
      kinds: ["entscheidung", "standard", "implementierungsschritt"],
      ki_hebel_kind: "ki_hebel",
      reifegrad_range: [1, 4],
      beschreibung: "",
    },
    themenmodell: [{ key: "2.1", name: "Orientierung", unterpunkte: ["Marge", "Cash"] }],
    dod: "Monatszahlen liegen vor.",
    output_artefakte: ["KPI-Set inkl. Schwellenwerten"],
    symptome: [],
    abgrenzung: "",
    ki_hebel: [
      { hebel_id: "H-M04-001", name: "Autokommentar", beschreibung: "x", reifegrad: 2, referenz: "" },
    ],
  },
};

const qa: QaPair[] = [
  {
    blockKey: "stufe1_kern",
    blockTitle: "Stufe 1 – Kern",
    frageId: "F-M04-001",
    unterbereich: "Block D / D1",
    questionText: "Woran erkennen Sie Erfolg?",
    answer: "An der Marge.",
  },
];

describe("ModuleDraftSchema", () => {
  it("parses a valid draft, defaults evidence to []", () => {
    const parsed = ModuleDraftSchema.parse({
      triple: [{ output_kind: "entscheidung", title: "T", body: "B" }],
      ki_hebel: [{ hebel_id: "H-M04-001", name: "X", body: "Y" }],
    });
    expect(parsed.triple[0].evidence_frage_ids).toEqual([]);
    expect(parsed.ki_hebel[0].hebel_id).toBe("H-M04-001");
  });

  it("rejects an invalid output_kind", () => {
    const r = ModuleDraftSchema.safeParse({
      triple: [{ output_kind: "sonstiges", title: "T", body: "B" }],
      ki_hebel: [],
    });
    expect(r.success).toBe(false);
  });

  it("defaults missing arrays to empty", () => {
    const parsed = ModuleDraftSchema.parse({});
    expect(parsed.triple).toEqual([]);
    expect(parsed.ki_hebel).toEqual([]);
  });
});

describe("buildModuleSynthesisUserPrompt", () => {
  it("includes module context, DoD, catalog, and the Q&A", () => {
    const prompt = buildModuleSynthesisUserPrompt(ctx, qa);
    expect(prompt).toContain("M-04");
    expect(prompt).toContain("Definition of Done");
    expect(prompt).toContain("H-M04-001");
    expect(prompt).toContain("F-M04-001");
    expect(prompt).toContain("An der Marge.");
  });

  it("handles zero answers gracefully", () => {
    const prompt = buildModuleSynthesisUserPrompt(ctx, []);
    expect(prompt).toContain("keine beantworteten Fragen");
  });
});

describe("buildModuleCriticUserPrompt", () => {
  it("embeds the draft JSON for review", () => {
    const prompt = buildModuleCriticUserPrompt(ctx, qa, {
      triple: [{ output_kind: "standard", title: "S", body: "Std", evidence_frage_ids: [] }],
      ki_hebel: [],
    });
    expect(prompt).toContain("Zu pruefender Entwurf");
    expect(prompt).toContain('"output_kind": "standard"');
  });
});
