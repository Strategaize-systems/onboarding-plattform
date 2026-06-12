// V9.1 SLC-V9.1-B MT-1 — Vitest fuer Continuous-Cost-Cap-Service.
//
// Slice: SLC-V9.1-B (FEAT-077) / Spec MT-1 Verification.
// Hermetisch: ContinuousCapStore-Interface wird gemockt, kein DB-Roundtrip
// (Repo-Konvention analog cost-cap.test.ts MockStore). Real-DB-Verifikation
// laeuft in der founder-gated Live-Smoke (MT-5).

import { describe, it, expect, afterEach } from "vitest";

import {
  DEFAULT_DAILY_CAP_EUR,
  DEFAULT_MONTHLY_CAP_EUR,
  checkContinuousCostCap,
  resolveDailyCapEur,
  resolveMonthlyCapEur,
  type ContinuousCapStore,
} from "../continuous-cost-cap";

// ────────────────────────────────────────────────────────────────────────────
// Mock-Store
// ────────────────────────────────────────────────────────────────────────────

interface MockStoreOptions {
  dayCostEur?: number;
  monthCostEur?: number;
  /** Wenn gesetzt: zaehlt Aufrufe von getTenantMonthCostEur (Short-Circuit-Test). */
  monthCalls?: { n: number };
}

function makeMockStore(opts: MockStoreOptions = {}): ContinuousCapStore {
  return {
    async getTenantDayCostEur() {
      return opts.dayCostEur ?? 0;
    },
    async getTenantMonthCostEur() {
      if (opts.monthCalls) opts.monthCalls.n += 1;
      return opts.monthCostEur ?? 0;
    },
  };
}

const TENANT_A = "11111111-1111-1111-1111-111111111111";

// ────────────────────────────────────────────────────────────────────────────
// Defaults + ENV-Resolver
// ────────────────────────────────────────────────────────────────────────────

describe("continuous-cost-cap Defaults", () => {
  it("DEFAULT_DAILY_CAP_EUR = 5 (DEC-197 Option B)", () => {
    expect(DEFAULT_DAILY_CAP_EUR).toBe(5);
  });
  it("DEFAULT_MONTHLY_CAP_EUR = 100 (DEC-182 Reuse)", () => {
    expect(DEFAULT_MONTHLY_CAP_EUR).toBe(100);
  });
});

describe("resolveDailyCapEur / resolveMonthlyCapEur", () => {
  it("Fallback auf Default ohne ENV", () => {
    expect(resolveDailyCapEur({})).toBe(5);
    expect(resolveMonthlyCapEur({})).toBe(100);
  });
  it("ENV-Override mit gueltigem Wert", () => {
    expect(resolveDailyCapEur({ V91_BULK_EMAIL_DAILY_CAP_EUR: "8" })).toBe(8);
    expect(
      resolveMonthlyCapEur({ V91_BULK_EMAIL_MONTHLY_CAP_EUR: "250" }),
    ).toBe(250);
  });
  it("Ungueltiger/nicht-positiver ENV-Wert faellt auf Default (R1-Drift-Mitigation)", () => {
    expect(resolveDailyCapEur({ V91_BULK_EMAIL_DAILY_CAP_EUR: "abc" })).toBe(5);
    expect(resolveDailyCapEur({ V91_BULK_EMAIL_DAILY_CAP_EUR: "0" })).toBe(5);
    expect(resolveDailyCapEur({ V91_BULK_EMAIL_DAILY_CAP_EUR: "-3" })).toBe(5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// checkContinuousCostCap — Slice-Spec MT-1 Verification (L72-79)
// ────────────────────────────────────────────────────────────────────────────

describe("checkContinuousCostCap", () => {
  it("Daily-Cost 4.5 EUR < 5 + Monthly niedrig -> allowed", async () => {
    const store = makeMockStore({ dayCostEur: 4.5, monthCostEur: 10 });
    const res = await checkContinuousCostCap(TENANT_A, store);
    expect(res.allowed).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it("Daily-Cost 5.0 EUR genau auf Cap -> daily_cap_hit (>= ist Hit)", async () => {
    const store = makeMockStore({ dayCostEur: 5.0, monthCostEur: 10 });
    const res = await checkContinuousCostCap(TENANT_A, store);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("daily_cap_hit");
    expect(res.cap).toBe(5);
    expect(res.actual).toBe(5.0);
  });

  it("Daily-Cost 4.99 EUR knapp unter Cap -> allowed", async () => {
    const store = makeMockStore({ dayCostEur: 4.99, monthCostEur: 0 });
    expect((await checkContinuousCostCap(TENANT_A, store)).allowed).toBe(true);
  });

  it("Monthly-Cost 99 EUR < 100 (Daily 0) -> allowed", async () => {
    const store = makeMockStore({ dayCostEur: 0, monthCostEur: 99 });
    expect((await checkContinuousCostCap(TENANT_A, store)).allowed).toBe(true);
  });

  it("Monthly-Cost 100 EUR genau auf Cap (Daily 0) -> monthly_cap_hit", async () => {
    const store = makeMockStore({ dayCostEur: 0, monthCostEur: 100 });
    const res = await checkContinuousCostCap(TENANT_A, store);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("monthly_cap_hit");
    expect(res.cap).toBe(100);
    expect(res.actual).toBe(100);
  });

  it("Monthly-Cost 101 EUR > Cap (Daily 0) -> monthly_cap_hit", async () => {
    const store = makeMockStore({ dayCostEur: 0, monthCostEur: 101 });
    const res = await checkContinuousCostCap(TENANT_A, store);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("monthly_cap_hit");
  });

  it("NULL-Cost (kein Run heute/Monat, 0/0) -> allowed", async () => {
    const store = makeMockStore({});
    expect((await checkContinuousCostCap(TENANT_A, store)).allowed).toBe(true);
  });

  it("Daily-Hit short-circuited den Monthly-Lookup (kein zweiter DB-Roundtrip)", async () => {
    const monthCalls = { n: 0 };
    const store = makeMockStore({
      dayCostEur: 6,
      monthCostEur: 200,
      monthCalls,
    });
    const res = await checkContinuousCostCap(TENANT_A, store);
    expect(res.reason).toBe("daily_cap_hit");
    expect(monthCalls.n).toBe(0); // Monthly nie aufgerufen
  });

  it("opts.dailyCapEur / opts.monthlyCapEur ueberschreiben die ENV-Resolver", async () => {
    const store = makeMockStore({ dayCostEur: 7, monthCostEur: 0 });
    // mit Default-Cap 5 waere 7 ein Hit; mit Override 10 nicht.
    const res = await checkContinuousCostCap(TENANT_A, store, {
      dailyCapEur: 10,
      monthlyCapEur: 500,
    });
    expect(res.allowed).toBe(true);
  });
});

// Kein ENV-Leak zwischen Tests.
afterEach(() => {
  delete process.env.V91_BULK_EMAIL_DAILY_CAP_EUR;
  delete process.env.V91_BULK_EMAIL_MONTHLY_CAP_EUR;
});
