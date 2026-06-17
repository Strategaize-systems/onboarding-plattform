// V9.75 SLC-V9.75-A MT-4 — Unit-Tests fuer die Worker-Defense (ARCHITECTURE §4
// Schicht 2, DEC-221).
//
// Reine Wrapper-Logik gegen einen gestubten Supabase-Client (kein DB-Zugriff):
//   - Stempel-Check via fn_tier_allows (ungated + ausreichend gestempelt -> allow)
//   - nicht-NULL-Stempel unter Stufe -> autoritative Ablehnung (kein Payload-Resolve)
//   - NULL-Stempel auf gated Job -> Session aus Payload aufloesen + neu pruefen
//   - KRITISCH: session-loser bulk-email Forward-Bucket-Run (V9.1) -> ausgenommen
//   - fail-closed bei RPC-Fehler und bei unaufloesbarem Payload
//
// Die Matrix-Korrektheit selbst (fn_tier_allows/fn_min_tier_for_job fuer alle 20
// job_types) wird an der SQL-Single-Source in
// src/__tests__/migrations/121-v975-tier-gating.test.ts verifiziert — der Gate
// delegiert per RPC an genau diese Funktionen, daher kein TS/SQL-Paritaets-Drift.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// claim-loop importiert den Logger, der beim Modul-Load einen Admin-Client
// erzeugt (braucht SUPABASE_URL). Fuer den hermetischen Gate-Test (kein DB-Zugriff)
// wird der Logger gestubt.
vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
  captureWarning: vi.fn(),
}));

import { evaluateWorkerTierGate } from "../claim-loop";

interface StubResult {
  data: unknown;
  error: { message: string } | null;
}

interface FakeOpts {
  /** RPC-Antworten, key = Funktionsname (fn_tier_allows / fn_session_tier_allows). */
  rpc?: Record<string, StubResult>;
  /** maybeSingle-Antworten pro Tabelle (email_bulk_run / block_checkpoint). */
  tables?: Record<string, StubResult>;
}

function makeClient(opts: FakeOpts) {
  const rpc = vi.fn(
    async (name: string, _params: unknown) =>
      opts.rpc?.[name] ?? { data: null, error: null },
  );
  const from = vi.fn((table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () =>
          opts.tables?.[table] ?? { data: null, error: null },
      }),
    }),
  }));
  const client = { rpc, from } as unknown as SupabaseClient;
  return { client, rpc, from };
}

describe("evaluateWorkerTierGate (V9.75 Worker-Defense)", () => {
  it("ungated job (lead_push_retry, NULL-Stempel) -> allowed", async () => {
    const { client } = makeClient({
      rpc: { fn_tier_allows: { data: true, error: null } }, // ungated -> true
    });
    const ok = await evaluateWorkerTierGate(client, {
      job_type: "lead_push_retry",
      session_tier: null,
      payload: {},
    });
    expect(ok).toBe(true);
  });

  it("ausreichend gestempelter gated Job -> allowed (kein Payload-Resolve)", async () => {
    const { client, from } = makeClient({
      rpc: { fn_tier_allows: { data: true, error: null } },
    });
    const ok = await evaluateWorkerTierGate(client, {
      job_type: "handbook_snapshot_generation",
      session_tier: "handbook",
      payload: { handbook_snapshot_id: "snap-1" },
    });
    expect(ok).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });

  it("nicht-NULL-Stempel unter Stufe -> autoritative Ablehnung (kein Resolve)", async () => {
    const { client, from } = makeClient({
      rpc: { fn_tier_allows: { data: false, error: null } },
    });
    const ok = await evaluateWorkerTierGate(client, {
      job_type: "handbook_snapshot_generation",
      session_tier: "blueprint",
      payload: { handbook_snapshot_id: "snap-1" },
    });
    expect(ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("RPC-Fehler beim Stempel-Check -> fail-closed", async () => {
    const { client } = makeClient({
      rpc: { fn_tier_allows: { data: null, error: { message: "boom" } } },
    });
    const ok = await evaluateWorkerTierGate(client, {
      job_type: "sop_generation",
      session_tier: "handbook",
      payload: {},
    });
    expect(ok).toBe(false);
  });

  it("NULL-Stempel, capture_session_id im Payload, Session ausreichend -> allowed", async () => {
    const { client } = makeClient({
      rpc: {
        fn_tier_allows: { data: false, error: null }, // NULL-Stempel faellt durch
        fn_session_tier_allows: { data: true, error: null },
      },
    });
    const ok = await evaluateWorkerTierGate(client, {
      job_type: "sop_generation",
      session_tier: null,
      payload: { capture_session_id: "sess-1" },
    });
    expect(ok).toBe(true);
  });

  it("NULL-Stempel, capture_session_id im Payload, Session unter Stufe -> denied", async () => {
    const { client } = makeClient({
      rpc: {
        fn_tier_allows: { data: false, error: null },
        fn_session_tier_allows: { data: false, error: null },
      },
    });
    const ok = await evaluateWorkerTierGate(client, {
      job_type: "sop_generation",
      session_tier: null,
      payload: { capture_session_id: "sess-1" },
    });
    expect(ok).toBe(false);
  });

  it("NULL-Stempel, block_checkpoint_id im Payload -> Session aufgeloest + geprueft", async () => {
    const { client, from } = makeClient({
      rpc: {
        fn_tier_allows: { data: false, error: null },
        fn_session_tier_allows: { data: true, error: null },
      },
      tables: {
        block_checkpoint: { data: { capture_session_id: "sess-7" }, error: null },
      },
    });
    const ok = await evaluateWorkerTierGate(client, {
      job_type: "knowledge_unit_condensation",
      session_tier: null,
      payload: { block_checkpoint_id: "cp-1" },
    });
    expect(ok).toBe(true);
    expect(from).toHaveBeenCalledWith("block_checkpoint");
  });

  it("NULL-Stempel, gated non-bulk Job ohne aufloesbaren Payload -> fail-closed", async () => {
    const { client } = makeClient({
      rpc: { fn_tier_allows: { data: false, error: null } },
    });
    const ok = await evaluateWorkerTierGate(client, {
      job_type: "handbook_snapshot_generation",
      session_tier: null,
      payload: { handbook_snapshot_id: "snap-1" }, // weder session_id noch checkpoint_id
    });
    expect(ok).toBe(false);
  });

  // ── V9.1-Forward-Bucket-Regression-Guard (kritischer Carve-out, IMP-1279) ──
  it("NULL-Stempel, bulk-email Job, Run OHNE capture_session -> allowed (session-los, V9.1)", async () => {
    const { client } = makeClient({
      rpc: { fn_tier_allows: { data: false, error: null } },
      tables: {
        email_bulk_run: { data: { capture_session_id: null }, error: null },
      },
    });
    const ok = await evaluateWorkerTierGate(client, {
      job_type: "email_bulk_pre_filter",
      session_tier: null,
      payload: { bulk_run_id: "run-1" },
    });
    expect(ok).toBe(true);
  });

  it("NULL-Stempel, bulk-email Job, Run MIT capture_session -> echte Session geprueft", async () => {
    const { client } = makeClient({
      rpc: {
        fn_tier_allows: { data: false, error: null },
        fn_session_tier_allows: { data: false, error: null },
      },
      tables: {
        email_bulk_run: { data: { capture_session_id: "sess-9" }, error: null },
      },
    });
    const ok = await evaluateWorkerTierGate(client, {
      job_type: "email_bulk_pre_filter",
      session_tier: null,
      payload: { bulk_run_id: "run-1" },
    });
    expect(ok).toBe(false);
  });

  it("NULL-Stempel, bulk-email Job, Run nicht gefunden -> fail-closed (NICHT session-los)", async () => {
    const { client } = makeClient({
      rpc: { fn_tier_allows: { data: false, error: null } },
      tables: { email_bulk_run: { data: null, error: null } },
    });
    const ok = await evaluateWorkerTierGate(client, {
      job_type: "email_bulk_pre_filter",
      session_tier: null,
      payload: { bulk_run_id: "missing" },
    });
    expect(ok).toBe(false);
  });

  it("ruft fn_tier_allows mit dem Stempel + job_type auf", async () => {
    const { client, rpc } = makeClient({
      rpc: { fn_tier_allows: { data: true, error: null } },
    });
    await evaluateWorkerTierGate(client, {
      job_type: "diagnosis_generation",
      session_tier: "blueprint",
      payload: {},
    });
    expect(rpc).toHaveBeenCalledWith("fn_tier_allows", {
      p_session_tier: "blueprint",
      p_job_type: "diagnosis_generation",
    });
  });
});
