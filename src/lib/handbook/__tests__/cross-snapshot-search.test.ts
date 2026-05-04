// SLC-054 MT-2 — Tests fuer searchAcrossSnapshots + helper.

import { describe, it, expect } from "vitest";
import {
  searchAcrossSnapshots,
  countOccurrences,
  extractSnippet,
  computeRecencyWeight,
  type CrossSearchSnapshot,
} from "../cross-snapshot-search";

const NOW = new Date("2026-05-04T12:00:00.000Z");

function snap(
  id: string,
  iso: string,
  formatted: string,
  sections: Array<{ key: string; title: string; markdown: string; order: number }>,
): CrossSearchSnapshot {
  return {
    id,
    createdAtIso: iso,
    formattedCreatedAt: formatted,
    sections: sections.map((s) => ({
      sectionKey: s.key,
      title: s.title,
      markdown: s.markdown,
      order: s.order,
    })),
  };
}

describe("searchAcrossSnapshots", () => {
  it("liefert leeres Array bei leerer Query oder Query unter 2 Zeichen", () => {
    const data: CrossSearchSnapshot[] = [
      snap("s1", "2026-05-01T00:00:00Z", "01.05.", [
        { key: "k1", title: "Strategie", markdown: "Lorem ipsum", order: 1 },
      ]),
    ];
    expect(searchAcrossSnapshots("", data, { now: NOW })).toEqual([]);
    expect(searchAcrossSnapshots(" ", data, { now: NOW })).toEqual([]);
    expect(searchAcrossSnapshots("a", data, { now: NOW })).toEqual([]);
  });

  it("findet Treffer in einer Section eines Snapshots (Single-Snapshot-Match)", () => {
    const data = [
      snap("s1", "2026-05-01T00:00:00Z", "01.05.", [
        {
          key: "k1",
          title: "Strategie",
          markdown: "Die Vollmacht regelt Vertretung.",
          order: 1,
        },
        {
          key: "k2",
          title: "Team",
          markdown: "Hier steht nichts ueber das Thema.",
          order: 2,
        },
      ]),
    ];
    const results = searchAcrossSnapshots("vollmacht", data, { now: NOW });
    expect(results).toHaveLength(1);
    expect(results[0].snapshotId).toBe("s1");
    expect(results[0].sectionKey).toBe("k1");
    expect(results[0].matchCount).toBe(1);
    expect(results[0].snippet).toContain("Vollmacht");
  });

  it("findet Treffer ueber mehrere Snapshots, sortiert nach Score (Cross-Snapshot-Match)", () => {
    const old = snap("alt", "2024-01-01T00:00:00Z", "01.01.2024", [
      {
        key: "k1",
        title: "Vollmacht im Titel",
        markdown: "Body ohne match",
        order: 1,
      },
    ]);
    const recent = snap("neu", "2026-05-01T00:00:00Z", "01.05.2026", [
      {
        key: "k1",
        title: "Random",
        markdown: "Vollmacht steht hier einmal im Text.",
        order: 1,
      },
    ]);
    const results = searchAcrossSnapshots("vollmacht", [old, recent], {
      now: NOW,
    });
    expect(results).toHaveLength(2);
    // Title-Hit (5x weight) im alten Snapshot wiegt mehr als Body-Hit (1x) im neuen,
    // selbst wenn Recency-Gewicht den neuen leicht boostet (Title-Score = 5*0.5 = 2.5,
    // Body-Score = 1*1.0 = 1.0). Erwartung: alter Snapshot zuerst.
    expect(results[0].snapshotId).toBe("alt");
    expect(results[1].snapshotId).toBe("neu");
  });

  it("snippet-generation extrahiert Kontext um den Treffer", () => {
    const longBefore = "Vorlauf ".repeat(40); // ~320 chars
    const longAfter = " Folgetext".repeat(40); // ~400 chars
    const data = [
      snap("s1", "2026-05-01T00:00:00Z", "01.05.", [
        {
          key: "k1",
          title: "S",
          markdown: `${longBefore}Vollmacht${longAfter}`,
          order: 1,
        },
      ]),
    ];
    const results = searchAcrossSnapshots("vollmacht", data, { now: NOW });
    expect(results[0].snippet).toMatch(/^\.\.\..+vollmacht.+\.\.\.$/i);
    expect(results[0].snippet.length).toBeGreaterThan(20);
    expect(results[0].snippet.length).toBeLessThan(200);
  });

  it("respektiert maxResults-Cap", () => {
    const sections = Array.from({ length: 60 }, (_, i) => ({
      key: `k${i}`,
      title: `S${i}`,
      markdown: `match ${i}`,
      order: i,
    }));
    const data = [snap("s1", "2026-05-01T00:00:00Z", "01.05.", sections)];
    const results = searchAcrossSnapshots("match", data, {
      now: NOW,
      maxResults: 25,
    });
    expect(results).toHaveLength(25);
  });

  it("kein Match wenn Query nirgends vorkommt", () => {
    const data = [
      snap("s1", "2026-05-01T00:00:00Z", "01.05.", [
        { key: "k1", title: "Strategie", markdown: "Lorem ipsum", order: 1 },
      ]),
    ];
    expect(searchAcrossSnapshots("xyzzy", data, { now: NOW })).toEqual([]);
  });
});

describe("countOccurrences", () => {
  it("liefert 0 bei leerer Needle", () => {
    expect(countOccurrences("anything", "")).toBe(0);
  });

  it("zaehlt nicht-ueberlappende Vorkommen", () => {
    expect(countOccurrences("aaaa", "aa")).toBe(2);
  });
});

describe("extractSnippet", () => {
  it("liefert Snippet mit Praefix-/Suffix-... bei mittiger Position", () => {
    const md = "x".repeat(200) + "needle" + "y".repeat(200);
    const snippet = extractSnippet(md, "needle", 30);
    expect(snippet.startsWith("...")).toBe(true);
    expect(snippet.endsWith("...")).toBe(true);
    expect(snippet).toContain("needle");
  });

  it("liefert Body-Anfang wenn Match nur im Title vorkommt (im Body kein Match)", () => {
    const snippet = extractSnippet("Body-Inhalt ohne match", "vollmacht", 30);
    expect(snippet).toContain("Body-Inhalt");
  });
});

describe("computeRecencyWeight", () => {
  it("liefert 1.0 fuer Snapshots juenger als 7 Tage", () => {
    expect(computeRecencyWeight("2026-05-04T00:00:00Z", NOW)).toBe(1.0);
    expect(computeRecencyWeight("2026-04-30T00:00:00Z", NOW)).toBe(1.0);
  });

  it("liefert 0.5 fuer Snapshots aelter als 365 Tage", () => {
    expect(computeRecencyWeight("2024-01-01T00:00:00Z", NOW)).toBe(0.5);
  });

  it("liefert linearen Falloff zwischen Tag 7 und Tag 365", () => {
    // Tag 7 = 1.0, Tag 365 = 0.5, Tag ~186 = 0.75
    const created = new Date(NOW);
    created.setDate(NOW.getDate() - 186);
    const w = computeRecencyWeight(created.toISOString(), NOW);
    expect(w).toBeGreaterThan(0.7);
    expect(w).toBeLessThan(0.8);
  });

  it("liefert 0.5 bei kaputtem ISO-String", () => {
    expect(computeRecencyWeight("not-a-date", NOW)).toBe(0.5);
  });
});
