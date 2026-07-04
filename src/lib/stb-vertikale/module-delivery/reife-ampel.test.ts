// Unit-Tests fuer computeModulReifeAmpel (SLC-178 MT-1, DEC-253/C).
// Hermetisch (kein DB/LLM) — deckt alle Regel-Zweige + Grenzfaelle ab.

import { describe, it, expect } from "vitest";

import {
  computeModulReifeAmpel,
  type ReifeAmpelFlags,
} from "./reife-ampel";

const koHart: ReifeAmpelFlags = { ko_hart: true };
const koSoft: ReifeAmpelFlags = { ko_soft: true };
const dealBlocker: ReifeAmpelFlags = { deal_blocker: true };
const ownerDep: ReifeAmpelFlags = { owner_dependency: true };
const sopOnly: ReifeAmpelFlags = { sop_trigger: true };
const unflagged: ReifeAmpelFlags = {};

describe("computeModulReifeAmpel", () => {
  it("gibt green bei leeren Trigger-Hits (sichere Baseline ohne SLC-179)", () => {
    expect(computeModulReifeAmpel({ q1: koHart }, [])).toBe("green");
  });

  it("gibt green, wenn keine Flags definiert sind", () => {
    expect(computeModulReifeAmpel({}, ["q1", "q2"])).toBe("green");
  });

  it("gibt red bei getriggertem ko_hart", () => {
    expect(computeModulReifeAmpel({ q1: koHart }, ["q1"])).toBe("red");
  });

  it("gibt yellow bei getriggertem ko_soft", () => {
    expect(computeModulReifeAmpel({ q1: koSoft }, ["q1"])).toBe("yellow");
  });

  it("gibt yellow bei getriggertem deal_blocker", () => {
    expect(computeModulReifeAmpel({ q1: dealBlocker }, ["q1"])).toBe("yellow");
  });

  it("gibt yellow bei getriggertem owner_dependency", () => {
    expect(computeModulReifeAmpel({ q1: ownerDep }, ["q1"])).toBe("yellow");
  });

  it("gibt green, wenn nur sop_trigger geflaggt ist (SOP-Bruecke, keine Ampel)", () => {
    expect(computeModulReifeAmpel({ q1: sopOnly }, ["q1"])).toBe("green");
  });

  it("gibt green, wenn die getriggerte Frage keine Flags traegt", () => {
    expect(computeModulReifeAmpel({ q1: unflagged }, ["q1"])).toBe("green");
  });

  it("gibt green, wenn ein Trigger-Hit auf eine nicht-gemappte frage_id zeigt", () => {
    expect(computeModulReifeAmpel({ q1: koHart }, ["q_unknown"])).toBe("green");
  });

  it("red dominiert yellow (ko_hart + ko_soft gemischt)", () => {
    const flags = { q1: koSoft, q2: koHart };
    expect(computeModulReifeAmpel(flags, ["q1", "q2"])).toBe("red");
    // reihenfolge-unabhaengig (Short-Circuit sicher)
    expect(computeModulReifeAmpel(flags, ["q2", "q1"])).toBe("red");
  });

  it("gibt yellow bei mehreren yellow-Treffern ohne ko_hart", () => {
    const flags = { q1: koSoft, q2: dealBlocker, q3: ownerDep };
    expect(computeModulReifeAmpel(flags, ["q1", "q2", "q3"])).toBe("yellow");
  });

  it("wertet nur getriggerte Fragen (ungetriggerter ko_hart bleibt green)", () => {
    const flags = { q1: koHart, q2: koSoft };
    expect(computeModulReifeAmpel(flags, ["q2"])).toBe("yellow");
  });

  it("ko_hart mit weiteren gesetzten Flags bleibt red", () => {
    const combined: ReifeAmpelFlags = {
      ko_hart: true,
      ko_soft: true,
      owner_dependency: true,
    };
    expect(computeModulReifeAmpel({ q1: combined }, ["q1"])).toBe("red");
  });
});
