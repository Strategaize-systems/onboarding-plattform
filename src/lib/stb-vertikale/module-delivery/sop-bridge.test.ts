// SLC-181 MT-1 — SOP-Bruecke Pure-Mapping Tests (Auswahl-Kontrakt + Scoring-Annotation).

import { describe, it, expect } from "vitest";
import {
  mapModulOutputsToSopRows,
  SOP_BRIDGE_GENERATED_BY,
  type BridgeInput,
  type BridgeModulOutput,
} from "./sop-bridge";

function output(overrides: Partial<BridgeModulOutput> = {}): BridgeModulOutput {
  return {
    id: "out-1",
    tenant_id: "t-1",
    capture_session_id: "sess-1",
    block_checkpoint_id: "cp-1",
    modul_key: "m04",
    output_kind: "standard",
    title: "Titel",
    body: "Körper",
    evidence_refs: [{ frage_id: "F-M04-001" }],
    status: "accepted",
    ...overrides,
  };
}

const input = (o: BridgeModulOutput, blockKey = "stufe1_kern"): BridgeInput => ({
  output: o,
  blockKey,
});

const GREEN = { reife: "green" as const, triggerHitCount: 0 };
const YELLOW = { reife: "yellow" as const, triggerHitCount: 2 };

describe("mapModulOutputsToSopRows — Auswahl-Kontrakt (DEC-256)", () => {
  it("mappt standard + implementierungsschritt (accepted) zu sop-Rows", () => {
    const rows = mapModulOutputsToSopRows(
      [
        input(output({ id: "a", output_kind: "standard" })),
        input(output({ id: "b", output_kind: "implementierungsschritt" })),
      ],
      GREEN,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.source_modul_output_id)).toEqual(["a", "b"]);
    expect(rows[0].generated_by_model).toBe(SOP_BRIDGE_GENERATED_BY);
    expect(rows[0].block_key).toBe("stufe1_kern");
    expect(rows[0].block_checkpoint_id).toBe("cp-1");
  });

  it("laesst entscheidung + ki_hebel aus (keine Prozess-Kinds)", () => {
    const rows = mapModulOutputsToSopRows(
      [
        input(output({ id: "c", output_kind: "entscheidung" })),
        input(output({ id: "d", output_kind: "ki_hebel" })),
      ],
      GREEN,
    );
    expect(rows).toHaveLength(0);
  });

  it("laesst nicht-accepted Outputs aus", () => {
    const rows = mapModulOutputsToSopRows(
      [
        input(output({ id: "e", status: "proposed" })),
        input(output({ id: "f", status: "rejected" })),
        input(output({ id: "g", status: "edited" })),
      ],
      GREEN,
    );
    expect(rows).toHaveLength(0);
  });

  it("laesst Outputs ohne block_checkpoint_id aus (sop.block_checkpoint_id NOT NULL)", () => {
    const rows = mapModulOutputsToSopRows(
      [input(output({ id: "h", block_checkpoint_id: null }))],
      GREEN,
    );
    expect(rows).toHaveLength(0);
  });

  it("laesst Inputs mit leerem block_key aus", () => {
    const rows = mapModulOutputsToSopRows(
      [input(output({ id: "i" }), "")],
      GREEN,
    );
    expect(rows).toHaveLength(0);
  });
});

describe("mapModulOutputsToSopRows — Scoring-Annotation (kein Filter)", () => {
  it("green -> priority normal", () => {
    const rows = mapModulOutputsToSopRows([input(output())], GREEN);
    expect(rows[0].content.scoring).toEqual({
      reife: "green",
      modul_trigger_hit_count: 0,
      priority: "normal",
    });
  });

  it("yellow/red -> priority high, aber Auswahl unveraendert (filtert nicht)", () => {
    const rows = mapModulOutputsToSopRows([input(output())], YELLOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].content.scoring.priority).toBe("high");
    expect(rows[0].content.scoring.modul_trigger_hit_count).toBe(2);
  });

  it("uebernimmt title/body/evidence_refs/modul_key in content", () => {
    const rows = mapModulOutputsToSopRows(
      [input(output({ title: "T", body: "B", modul_key: "m06" }))],
      GREEN,
    );
    expect(rows[0].content.title).toBe("T");
    expect(rows[0].content.body).toBe("B");
    expect(rows[0].content.modul_key).toBe("m06");
    expect(rows[0].content.origin).toBe(SOP_BRIDGE_GENERATED_BY);
  });

  it("evidence_refs default [] wenn null/undefined", () => {
    const rows = mapModulOutputsToSopRows(
      [input(output({ evidence_refs: null }))],
      GREEN,
    );
    expect(rows[0].content.evidence_refs).toEqual([]);
  });
});
