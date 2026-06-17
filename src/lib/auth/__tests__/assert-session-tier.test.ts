// V9.75 SLC-V9.75-A MT-3 — Unit-Tests fuer den TS-Dispatch-Gate.
//
// Reine Wrapper-Logik gegen einen gestubten Supabase-Client (kein DB-Zugriff):
//   - mappt das fn_session_tier_allows-RPC-Boolean auf `allowed`
//   - liefert den capture_session.tier zum Stempeln
//   - fail-closed (allowed=false) bei RPC-Fehler
//   - ruft das RPC mit den korrekten Parametern auf
//
// Die Matrix-Korrektheit selbst (allow == fn_min_tier_for_job fuer alle 20
// job_types, AC-A-7) wird NICHT hier dupliziert, sondern an der SQL-Single-Source
// in src/__tests__/migrations/121-v975-tier-gating.test.ts verifiziert — der Guard
// delegiert per RPC an genau diese Funktion, daher ist kein TS/SQL-Paritaets-Drift
// moeglich (ARCHITECTURE §10.3).

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { assertSessionTierAllows } from "../assert-session-tier";

interface FakeOpts {
  allowed?: boolean;
  rpcError?: boolean;
  /** undefined => Session nicht gefunden (maybeSingle data=null). */
  tier?: string | null;
  rpcSpy?: ReturnType<typeof vi.fn>;
}

function fakeClient(opts: FakeOpts): SupabaseClient {
  const rpc =
    opts.rpcSpy ??
    vi.fn(async () =>
      opts.rpcError
        ? { data: null, error: { message: "rpc boom" } }
        : { data: opts.allowed ?? false, error: null },
    );

  const maybeSingle = async () => ({
    data: opts.tier === undefined ? null : { tier: opts.tier },
    error: null,
  });

  return {
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("assertSessionTierAllows", () => {
  it("allowed=true wenn das RPC true liefert; tier wird mitgegeben", async () => {
    const res = await assertSessionTierAllows(
      fakeClient({ allowed: true, tier: "blueprint" }),
      "sess-1",
      "diagnosis_generation",
    );
    expect(res).toEqual({ allowed: true, tier: "blueprint" });
  });

  it("allowed=false wenn das RPC false liefert", async () => {
    const res = await assertSessionTierAllows(
      fakeClient({ allowed: false, tier: "free" }),
      "sess-1",
      "sop_generation",
    );
    expect(res).toEqual({ allowed: false, tier: "free" });
  });

  it("fail-closed: RPC-Fehler => allowed=false (tier dennoch gestempelt)", async () => {
    const res = await assertSessionTierAllows(
      fakeClient({ rpcError: true, tier: "handbook" }),
      "sess-1",
      "handbook_snapshot_generation",
    );
    expect(res.allowed).toBe(false);
    expect(res.tier).toBe("handbook");
  });

  it("Session nicht gefunden => tier null", async () => {
    const res = await assertSessionTierAllows(
      fakeClient({ allowed: false }), // tier undefined -> maybeSingle null
      "missing",
      "knowledge_unit_condensation",
    );
    expect(res.tier).toBeNull();
  });

  it("ruft fn_session_tier_allows mit p_session_id + p_job_type", async () => {
    const rpcSpy = vi.fn(async () => ({ data: true, error: null }));
    await assertSessionTierAllows(
      fakeClient({ rpcSpy, tier: "handbook" }),
      "sess-42",
      "walkthrough_transcribe",
    );
    expect(rpcSpy).toHaveBeenCalledWith("fn_session_tier_allows", {
      p_session_id: "sess-42",
      p_job_type: "walkthrough_transcribe",
    });
  });
});
