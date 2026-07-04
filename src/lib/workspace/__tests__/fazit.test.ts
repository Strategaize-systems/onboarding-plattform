// V10.2 SLC-183 MT-2 — Vitest fuer summarizeReport (KI-Kurzfazit, fail-open)
//
// Slice: SLC-183 — Berater-KI-Workspace "Mein Tag": KI-Kurzfazit
// DECs: DEC-259 (fail-open, error_log-Audit only, KEIN ai_cost_ledger), ISSUE-111 (explizite modelId)
//
// Hermetisch: kein echter AWS-Call (Haiku-Raw-Caller injiziert via
// __setHaikuCallerForTests), kein DB-Zugriff (@/lib/logger gemockt).
//
// Verifiziert:
//   1. Happy-Path → { fazit: "..." }
//   2. LLM-Fehler → fail-open { fazit: null } + captureException 1x
//   3. Schema-Drift (Nicht-JSON) → fail-open { fazit: null }

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  __setHaikuCallerForTests,
  __resetHaikuCallerForTests,
  type HaikuRawCaller,
} from "@/lib/ai/bedrock-haiku";
import { captureException } from "@/lib/logger";

import { summarizeReport } from "../fazit";

// @/lib/logger schreibt sonst via supabaseAdmin ins error_log — hier stubben,
// damit der Fail-open-Pfad ohne DB laeuft und die Audit-Rufe pruefbar sind.
vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
}));

function makeCaller(text: string): HaikuRawCaller {
  return async () => ({ text, tokensIn: 100, tokensOut: 30, latencyMs: 120 });
}

function makeThrowingCaller(): HaikuRawCaller {
  return async () => {
    throw new Error("Bedrock unavailable");
  };
}

const baseInput = {
  reportKey: "mandanten_uebersicht",
  reportTitle: "Mandanten-Übersicht",
  data: { total: 12, aktiv: 9 },
};

describe("summarizeReport (SLC-183 MT-2)", () => {
  beforeEach(() => {
    __resetHaikuCallerForTests();
    vi.mocked(captureException).mockClear();
  });

  afterEach(() => {
    __resetHaikuCallerForTests();
  });

  it("happy path: returns the fazit string from Haiku", async () => {
    __setHaikuCallerForTests(makeCaller(JSON.stringify({ fazit: "Kurzer Satz." })));

    const result = await summarizeReport(baseInput);

    expect(result).toEqual({ fazit: "Kurzer Satz." });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("LLM failure: fail-open with { fazit: null } and audits once", async () => {
    __setHaikuCallerForTests(makeThrowingCaller());

    const result = await summarizeReport(baseInput);

    expect(result).toEqual({ fazit: null });
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("schema drift (non-JSON output): fail-open with { fazit: null }", async () => {
    __setHaikuCallerForTests(makeCaller("not json"));

    const result = await summarizeReport(baseInput);

    expect(result).toEqual({ fazit: null });
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
