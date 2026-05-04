// SLC-054 MT-1 — Tests fuer pure history-helpers (addQueryToHistory, parseHistory).
//
// Die Hook-Verdrahtung (useEffect, localStorage-Roundtrip, SSR-Safe) wird im
// Browser-Smoke (Pflicht-Gate 1280×800/375×667) verifiziert — vitest-environment
// ist `node`, jsdom + @testing-library/react bewusst nicht installiert
// (siehe use-scroll-spy.test.ts fuer die gleiche Konvention).

import { describe, it, expect } from "vitest";
import {
  addQueryToHistory,
  parseHistory,
  MAX_HISTORY_ENTRIES,
} from "../use-search-history";

describe("addQueryToHistory", () => {
  it("liefert die unveraenderte History bei leerer Query", () => {
    const before = ["alpha", "beta"];
    expect(addQueryToHistory(before, "")).toBe(before);
    expect(addQueryToHistory(before, "   ")).toBe(before);
  });

  it("haengt die Query an Position 0 an", () => {
    expect(addQueryToHistory([], "vollmacht")).toEqual(["vollmacht"]);
    expect(addQueryToHistory(["alt"], "neu")).toEqual(["neu", "alt"]);
  });

  it("dedupliziert: existierende Query wandert an Position 0", () => {
    expect(
      addQueryToHistory(["a", "b", "c", "vollmacht", "d"], "vollmacht"),
    ).toEqual(["vollmacht", "a", "b", "c", "d"]);
  });

  it("trimmt auf MAX_HISTORY_ENTRIES (FIFO am Ende)", () => {
    const ten = Array.from({ length: MAX_HISTORY_ENTRIES }, (_, i) => `q${i}`);
    const after = addQueryToHistory(ten, "neu");
    expect(after).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(after[0]).toBe("neu");
    // Letzter Eintrag (ehemals q9) wurde abgeschnitten
    expect(after).not.toContain("q9");
    expect(after).toContain("q0");
  });

  it("trimmt Whitespace bei der Eingabe-Query", () => {
    expect(addQueryToHistory([], "  vollmacht  ")).toEqual(["vollmacht"]);
    // Dedup matched mit getrimmtem Wert
    expect(
      addQueryToHistory(["vollmacht"], "  vollmacht  "),
    ).toEqual(["vollmacht"]);
  });
});

describe("parseHistory", () => {
  it("liefert leeres Array bei null", () => {
    expect(parseHistory(null)).toEqual([]);
  });

  it("liefert leeres Array bei kaputtem JSON", () => {
    expect(parseHistory("not-json")).toEqual([]);
    expect(parseHistory("{not:array}")).toEqual([]);
  });

  it("liefert leeres Array wenn Top-Level kein Array ist", () => {
    expect(parseHistory('{"k":"v"}')).toEqual([]);
    expect(parseHistory('"single-string"')).toEqual([]);
  });

  it("filtert Nicht-String-Eintraege und Empty-Strings", () => {
    expect(
      parseHistory(JSON.stringify(["alpha", 42, "", null, "beta", false])),
    ).toEqual(["alpha", "beta"]);
  });

  it("clamped auf MAX_HISTORY_ENTRIES bei zu langen Persistenz-Daten", () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => `q${i}`);
    expect(parseHistory(JSON.stringify(fifteen))).toHaveLength(
      MAX_HISTORY_ENTRIES,
    );
  });
});
