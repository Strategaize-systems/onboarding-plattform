// V9 SLC-166 MT-7 — Vitest fuer redacted-body-scan.ts.
//
// Deckt:
//   - scanRedactedBodyForLeaks: Email + Telefon clean / leaked / mixed cases
//   - samplePctThreads: pct=0.1 deterministisch / seeded / edge-cases

import { describe, it, expect } from "vitest";

import {
  scanRedactedBodyForLeaks,
  samplePctThreads,
} from "../redacted-body-scan";

describe("scanRedactedBodyForLeaks", () => {
  it("clean redacted body mit Pseudonymen → isClean=true", () => {
    const text =
      "From: P1\nTo: P2\nSubject: Anfrage\n\nHallo P2, ich melde mich wegen der Sache. Gruss P1.";
    const result = scanRedactedBodyForLeaks(text);
    expect(result.isClean).toBe(true);
    expect(result.emailLeaks).toEqual([]);
    expect(result.phoneLeaks).toEqual([]);
  });

  it("erkennt zurueckgebliebene Klartext-Email-Adresse", () => {
    const text =
      "From: P1\nTo: P2\n\nBitte schicken Sie die Unterlagen an max.mueller@example.com.";
    const result = scanRedactedBodyForLeaks(text);
    expect(result.isClean).toBe(false);
    expect(result.emailLeaks).toContain("max.mueller@example.com");
    expect(result.phoneLeaks).toEqual([]);
  });

  it("erkennt zurueckgebliebene deutsche Telefonnummer", () => {
    const text =
      "Bitte rufen Sie mich unter 030 12345678 an, ich erklaere die Details.";
    const result = scanRedactedBodyForLeaks(text);
    expect(result.isClean).toBe(false);
    expect(result.emailLeaks).toEqual([]);
    expect(result.phoneLeaks.length).toBeGreaterThan(0);
    expect(result.phoneLeaks.some((p) => p.includes("030") && p.includes("12345678"))).toBe(true);
  });

  it("erkennt zurueckgebliebene internationale Telefonnummer (+49)", () => {
    const text = "Sie erreichen mich unter +49 30 1234567 jederzeit.";
    const result = scanRedactedBodyForLeaks(text);
    expect(result.isClean).toBe(false);
    expect(result.phoneLeaks.length).toBeGreaterThan(0);
  });

  it("erkennt mixed leakage (Email + Phone) im selben Body", () => {
    const text =
      "Kontakt: max@example.de, Telefon 0151 12345678. Mit freundlichen Gruessen.";
    const result = scanRedactedBodyForLeaks(text);
    expect(result.isClean).toBe(false);
    expect(result.emailLeaks).toContain("max@example.de");
    expect(result.phoneLeaks.length).toBeGreaterThan(0);
  });

  it("dedupliziert mehrfach-vorkommende Klartext-Email", () => {
    const text =
      "Bitte cc'en: a@example.com. Antwort an a@example.com. Backup a@example.com.";
    const result = scanRedactedBodyForLeaks(text);
    expect(result.emailLeaks).toEqual(["a@example.com"]);
  });

  it("ignoriert Pseudonym-Marker '[EMAIL]' und 'P1@redacted' (kein TLD)", () => {
    const text =
      "From: P1@redacted\nTo: P2@redacted\nSubject: [EMAIL]\n\nP1 fragt P2 nach Status.";
    const result = scanRedactedBodyForLeaks(text);
    expect(result.isClean).toBe(true);
  });

  it("null / leer / undefined → clean", () => {
    expect(scanRedactedBodyForLeaks(null).isClean).toBe(true);
    expect(scanRedactedBodyForLeaks(undefined).isClean).toBe(true);
    expect(scanRedactedBodyForLeaks("").isClean).toBe(true);
  });
});

describe("samplePctThreads", () => {
  it("default pct=0.1 liefert floor(0.1 * N) Threads (min 1)", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const sample = samplePctThreads(items);
    expect(sample.length).toBe(10);
  });

  it("kleines Array (8 Items, pct=0.1) liefert min 1 Item", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const sample = samplePctThreads(items);
    expect(sample.length).toBe(1);
  });

  it("leeres Array liefert leeres Array", () => {
    expect(samplePctThreads([])).toEqual([]);
  });

  it("deterministisch ohne seed (Index-modulo-Stride)", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const sample1 = samplePctThreads(items, 0.2);
    const sample2 = samplePctThreads(items, 0.2);
    expect(sample1).toEqual(sample2);
    expect(sample1.length).toBe(10);
  });

  it("seeded Sampling ist reproduzierbar bei gleichem Seed", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const sample1 = samplePctThreads(items, 0.1, { seed: 42 });
    const sample2 = samplePctThreads(items, 0.1, { seed: 42 });
    expect(sample1).toEqual(sample2);
  });

  it("verschiedene Seeds liefern verschiedene Stichproben", () => {
    const items = Array.from({ length: 200 }, (_, i) => i);
    const sample1 = samplePctThreads(items, 0.1, { seed: 1 });
    const sample2 = samplePctThreads(items, 0.1, { seed: 2 });
    // Sehr unwahrscheinlich, dass 20 Items identisch sind.
    expect(sample1).not.toEqual(sample2);
    expect(sample1.length).toBe(20);
    expect(sample2.length).toBe(20);
  });
});
