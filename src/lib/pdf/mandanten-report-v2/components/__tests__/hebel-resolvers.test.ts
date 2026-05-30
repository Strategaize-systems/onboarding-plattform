// V8 SLC-151 MT-4 — Vitest fuer hebel-resolvers.

import { describe, it, expect } from "vitest";

import type { HebelItem } from "@/lib/diagnose/types";
import {
  formatAllHebelBlocks,
  formatHebelBlock,
} from "../hebel-resolvers";

const MOCK_HEBEL: HebelItem = {
  modul_id: "m4",
  modul_name: "Finanzen & Controlling",
  score: 2,
  stufe: 2,
  empfehlung: "Cashflow-Forecasts wieder einfuehren, Margen-Verantwortung dezentralisieren.",
};

describe("formatHebelBlock — happy path", () => {
  it("returns Prio-1 for index 0", () => {
    const block = formatHebelBlock(MOCK_HEBEL, 0);
    expect(block.priority).toBe(1);
    expect(block.priorityLabel).toBe("Kritisch");
  });

  it("returns Prio-2 for index 1", () => {
    const block = formatHebelBlock(MOCK_HEBEL, 1);
    expect(block.priority).toBe(2);
    expect(block.priorityLabel).toBe("Wichtig");
  });

  it("returns Prio-3 for index 2", () => {
    const block = formatHebelBlock(MOCK_HEBEL, 2);
    expect(block.priority).toBe(3);
    expect(block.priorityLabel).toBe("Schneller Hebel");
  });

  it("formats modulRef as 'Modul N · Score X/10'", () => {
    const block = formatHebelBlock(MOCK_HEBEL, 0);
    expect(block.modulRef).toBe("Modul 4 · Score 2/10");
  });

  it("derives modulNumber from modul_id (m1 -> 1, m9 -> 9)", () => {
    const m1Block = formatHebelBlock({ ...MOCK_HEBEL, modul_id: "m1" }, 0);
    const m9Block = formatHebelBlock({ ...MOCK_HEBEL, modul_id: "m9" }, 0);
    expect(m1Block.modulRef).toContain("Modul 1");
    expect(m9Block.modulRef).toContain("Modul 9");
  });

  it("passes through modul_name and empfehlung 1:1", () => {
    const block = formatHebelBlock(MOCK_HEBEL, 0);
    expect(block.modulName).toBe("Finanzen & Controlling");
    expect(block.empfehlung).toBe(
      "Cashflow-Forecasts wieder einfuehren, Margen-Verantwortung dezentralisieren.",
    );
  });

  it("handles score 0 (extreme low)", () => {
    const block = formatHebelBlock({ ...MOCK_HEBEL, score: 0 }, 0);
    expect(block.modulRef).toBe("Modul 4 · Score 0/10");
  });

  it("handles score 10 (extreme high, edge-case)", () => {
    const block = formatHebelBlock({ ...MOCK_HEBEL, score: 10 }, 0);
    expect(block.modulRef).toBe("Modul 4 · Score 10/10");
  });
});

describe("formatHebelBlock — defensive", () => {
  it("throws on index = -1", () => {
    expect(() => formatHebelBlock(MOCK_HEBEL, -1)).toThrow(
      /index -1 out of range/,
    );
  });

  it("throws on index = 3 (HebelPage rendert nur 0..2)", () => {
    expect(() => formatHebelBlock(MOCK_HEBEL, 3)).toThrow(
      /index 3 out of range/,
    );
  });

  it("throws on invalid modul_id", () => {
    expect(() =>
      formatHebelBlock({ ...MOCK_HEBEL, modul_id: "m99" as never }, 0),
    ).toThrow(/invalid modul_id "m99"/);
  });

  it("throws on empty modul_name", () => {
    expect(() =>
      formatHebelBlock({ ...MOCK_HEBEL, modul_name: "" }, 0),
    ).toThrow(/empty modul_name for m4/);
  });

  it("throws on whitespace-only modul_name", () => {
    expect(() =>
      formatHebelBlock({ ...MOCK_HEBEL, modul_name: "   " }, 0),
    ).toThrow(/empty modul_name for m4/);
  });

  it("throws on empty empfehlung", () => {
    expect(() =>
      formatHebelBlock({ ...MOCK_HEBEL, empfehlung: "" }, 0),
    ).toThrow(/empty empfehlung for m4/);
  });
});

describe("formatAllHebelBlocks", () => {
  it("formats 3 items with prio 1..3", () => {
    const hebel: HebelItem[] = [
      { ...MOCK_HEBEL, modul_id: "m4" },
      { ...MOCK_HEBEL, modul_id: "m7" },
      { ...MOCK_HEBEL, modul_id: "m5" },
    ];
    const blocks = formatAllHebelBlocks(hebel);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].priority).toBe(1);
    expect(blocks[1].priority).toBe(2);
    expect(blocks[2].priority).toBe(3);
    expect(blocks[0].modulRef).toContain("Modul 4");
    expect(blocks[1].modulRef).toContain("Modul 7");
    expect(blocks[2].modulRef).toContain("Modul 5");
  });

  it("throws when fewer than 3 hebel items provided", () => {
    const hebel: HebelItem[] = [MOCK_HEBEL, MOCK_HEBEL];
    expect(() => formatAllHebelBlocks(hebel)).toThrow(
      /expected exactly 3 hebel items, got 2/,
    );
  });

  it("throws when more than 3 hebel items provided", () => {
    const hebel: HebelItem[] = Array(4).fill(MOCK_HEBEL);
    expect(() => formatAllHebelBlocks(hebel)).toThrow(
      /expected exactly 3 hebel items, got 4/,
    );
  });

  it("throws when empty hebel list", () => {
    expect(() => formatAllHebelBlocks([])).toThrow(
      /expected exactly 3 hebel items, got 0/,
    );
  });
});
