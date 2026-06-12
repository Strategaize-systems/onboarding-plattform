// V9 SLC-167 MT-3 — Vitest fuer Cost-Cap-Service (4 Check-Methoden)
//
// Slice: SLC-167 — V9 Pattern-Extraktion + Curation-UI + Cost-Cap (FEAT-073)
// Spec MT-3 Verification (L124-128):
//   (a) 100-Thread-Run mit kleinem redacted_body → estimate 0.5 EUR, alle Checks PASS
//   (b) 1000-Thread-Run mit grossem redacted_body → estimate 25 EUR, runCap-Block
//   (c) Tenant hat im aktuellen Monat schon 95 EUR + 10 EUR estimate
//        → checkTenantMonthlyCap rejects (ueber 100)
//   (d) checkLiveCapInWorker: SELECT SUM(cost_eur) funktioniert mit Vitest-Mock
//
// Test-Strategie:
//   - 4 Check-Methoden alle ueber MockCostCapStore getestet
//   - Pure-Functions (checkRunCap, checkPreApprovalThreshold) brauchen keinen Store
//   - DB-Tests fuer den Supabase-Adapter sind in MT-4 actions.test.ts integriert
//     (End-to-End-Test schlaegt 2 Fliegen)
//
// Pure-Function-Vitest: keine DB-Calls auf Modul-Ebene. CostCapStore-Interface
// macht das moeglich.

import { describe, it, expect, beforeEach } from "vitest";

import {
  DEFAULT_PRE_APPROVAL_THRESHOLD_EUR,
  DEFAULT_RUN_CAP_EUR,
  DEFAULT_TENANT_MONTH_CAP_EUR,
  checkLiveCapInWorker,
  checkLiveTotalCapInWorker,
  checkPreApprovalThreshold,
  checkRunCap,
  checkTenantMonthlyCap,
  type CostCapStore,
} from "../cost-cap";

// ────────────────────────────────────────────────────────────────────────────
// Mock-Store fuer DB-gebundene Checks
// ────────────────────────────────────────────────────────────────────────────

interface MockStoreOptions {
  tenantMonthCostEur?: number | ((tenantId: string) => number);
  runPatternCostEur?: number | ((runId: string) => number);
  runTotalCostEur?: number | ((runId: string) => number);
}

function makeMockStore(opts: MockStoreOptions = {}): CostCapStore {
  return {
    async getTenantMonthCostEur(tenantId) {
      if (typeof opts.tenantMonthCostEur === "function") {
        return opts.tenantMonthCostEur(tenantId);
      }
      return opts.tenantMonthCostEur ?? 0;
    },
    async getRunPatternExtractionCostEur(runId) {
      if (typeof opts.runPatternCostEur === "function") {
        return opts.runPatternCostEur(runId);
      }
      return opts.runPatternCostEur ?? 0;
    },
    async getRunTotalCostEur(runId) {
      if (typeof opts.runTotalCostEur === "function") {
        return opts.runTotalCostEur(runId);
      }
      return opts.runTotalCostEur ?? 0;
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Default-Konstanten
// ────────────────────────────────────────────────────────────────────────────

describe("cost-cap Defaults", () => {
  it("DEFAULT_RUN_CAP_EUR = 20", () => {
    expect(DEFAULT_RUN_CAP_EUR).toBe(20);
  });
  it("DEFAULT_TENANT_MONTH_CAP_EUR = 100", () => {
    expect(DEFAULT_TENANT_MONTH_CAP_EUR).toBe(100);
  });
  it("DEFAULT_PRE_APPROVAL_THRESHOLD_EUR = 10", () => {
    expect(DEFAULT_PRE_APPROVAL_THRESHOLD_EUR).toBe(10);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Pure-Function: checkRunCap
// ────────────────────────────────────────────────────────────────────────────

describe("checkRunCap", () => {
  it("0.5 EUR estimate unter 20 EUR cap → allowed (true)", () => {
    expect(checkRunCap(0.5, 20)).toBe(true);
  });

  it("19.99 EUR estimate unter 20 EUR cap → allowed (true)", () => {
    expect(checkRunCap(19.99, 20)).toBe(true);
  });

  it("20 EUR estimate genau auf cap → allowed (true) (inclusive)", () => {
    expect(checkRunCap(20, 20)).toBe(true);
  });

  it("25 EUR estimate ueber 20 EUR cap → blocked (false)", () => {
    expect(checkRunCap(25, 20)).toBe(false);
  });

  it("ENV-Override: 50 EUR cap erlaubt 30 EUR estimate", () => {
    expect(checkRunCap(30, 50)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Pure-Function: checkPreApprovalThreshold
// ────────────────────────────────────────────────────────────────────────────

describe("checkPreApprovalThreshold", () => {
  it("5 EUR estimate unter 10 EUR threshold → kein Modal (false)", () => {
    expect(checkPreApprovalThreshold(5, 10)).toBe(false);
  });

  it("10 EUR estimate genau auf threshold → kein Modal (false) (inclusive)", () => {
    expect(checkPreApprovalThreshold(10, 10)).toBe(false);
  });

  it("10.01 EUR estimate knapp ueber threshold → Modal-Trigger (true)", () => {
    expect(checkPreApprovalThreshold(10.01, 10)).toBe(true);
  });

  it("15 EUR estimate ueber threshold → Modal-Trigger (true)", () => {
    expect(checkPreApprovalThreshold(15, 10)).toBe(true);
  });

  it("ENV-Override: 5 EUR threshold triggert bei 6 EUR", () => {
    expect(checkPreApprovalThreshold(6, 5)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DB-Check: checkTenantMonthlyCap (per Mock-Store)
// ────────────────────────────────────────────────────────────────────────────

describe("checkTenantMonthlyCap", () => {
  const TENANT_A = "11111111-1111-1111-1111-111111111111";

  it("leerer Monat (0 EUR bisher) + 5 EUR estimate → allowed", async () => {
    const store = makeMockStore({ tenantMonthCostEur: 0 });
    const result = await checkTenantMonthlyCap(TENANT_A, 5, 100, store);
    expect(result.allowed).toBe(true);
    expect(result.currentMonthEur).toBe(0);
    expect(result.remainingEur).toBe(100);
  });

  it("70 EUR bisher + 10 EUR estimate → allowed (= 80 unter 100)", async () => {
    const store = makeMockStore({ tenantMonthCostEur: 70 });
    const result = await checkTenantMonthlyCap(TENANT_A, 10, 100, store);
    expect(result.allowed).toBe(true);
    expect(result.currentMonthEur).toBe(70);
    expect(result.remainingEur).toBe(30);
  });

  it("90 EUR bisher + 10 EUR estimate → grenzwertig allowed (= 100 = cap)", async () => {
    const store = makeMockStore({ tenantMonthCostEur: 90 });
    const result = await checkTenantMonthlyCap(TENANT_A, 10, 100, store);
    expect(result.allowed).toBe(true); // 100 <= 100 (inclusive)
    expect(result.currentMonthEur).toBe(90);
    expect(result.remainingEur).toBe(10);
  });

  it("95 EUR bisher + 10 EUR estimate → rejected (= 105 ueber 100, Spec-Case)", async () => {
    // Slice-Spec L126: "Tenant hat im aktuellen Monat schon 95 EUR verbraucht
    //  + 10 EUR estimate → checkTenantMonthlyCap rejects (ueber 100)"
    const store = makeMockStore({ tenantMonthCostEur: 95 });
    const result = await checkTenantMonthlyCap(TENANT_A, 10, 100, store);
    expect(result.allowed).toBe(false);
    expect(result.currentMonthEur).toBe(95);
    expect(result.remainingEur).toBe(5);
  });

  it("schon ueber cap (110 EUR bisher) + neuer Run → rejected, remaining negativ", async () => {
    const store = makeMockStore({ tenantMonthCostEur: 110 });
    const result = await checkTenantMonthlyCap(TENANT_A, 5, 100, store);
    expect(result.allowed).toBe(false);
    expect(result.currentMonthEur).toBe(110);
    expect(result.remainingEur).toBe(-10);
  });

  it("Tenant-Isolation: Store filtert per tenantId", async () => {
    // Mock-Store reicht tenantId an function-Variant durch; pruefen dass
    // checkTenantMonthlyCap die tenantId weitergibt.
    let calledWith: string | null = null;
    const store: CostCapStore = {
      async getTenantMonthCostEur(tenantId) {
        calledWith = tenantId;
        return 0;
      },
      async getRunPatternExtractionCostEur() {
        return 0;
      },
      async getRunTotalCostEur() {
        return 0;
      },
    };
    await checkTenantMonthlyCap("tenant-x-uuid", 1, 100, store);
    expect(calledWith).toBe("tenant-x-uuid");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DB-Check: checkLiveCapInWorker (per Mock-Store)
// ────────────────────────────────────────────────────────────────────────────

describe("checkLiveCapInWorker", () => {
  const RUN_A = "22222222-2222-2222-2222-222222222222";

  it("noch keine Cost (0 EUR) + 20 EUR cap → nicht exceeded", async () => {
    const store = makeMockStore({ runPatternCostEur: 0 });
    const result = await checkLiveCapInWorker(RUN_A, 20, store);
    expect(result.exceeded).toBe(false);
    expect(result.currentEur).toBe(0);
  });

  it("15 EUR bisher + 20 EUR cap → nicht exceeded (Worker laeuft weiter)", async () => {
    const store = makeMockStore({ runPatternCostEur: 15 });
    const result = await checkLiveCapInWorker(RUN_A, 20, store);
    expect(result.exceeded).toBe(false);
    expect(result.currentEur).toBe(15);
  });

  it("20 EUR genau auf cap → nicht exceeded (inclusive)", async () => {
    const store = makeMockStore({ runPatternCostEur: 20 });
    const result = await checkLiveCapInWorker(RUN_A, 20, store);
    expect(result.exceeded).toBe(false); // 20 > 20 is false
    expect(result.currentEur).toBe(20);
  });

  it("20.01 EUR knapp ueber cap → exceeded (Worker bricht ab)", async () => {
    const store = makeMockStore({ runPatternCostEur: 20.01 });
    const result = await checkLiveCapInWorker(RUN_A, 20, store);
    expect(result.exceeded).toBe(true);
    expect(result.currentEur).toBe(20.01);
  });

  it("Worker-Run-Isolation: Store filtert per runId", async () => {
    let calledWith: string | null = null;
    const store: CostCapStore = {
      async getTenantMonthCostEur() {
        return 0;
      },
      async getRunPatternExtractionCostEur(runId) {
        calledWith = runId;
        return 0;
      },
      async getRunTotalCostEur() {
        return 0;
      },
    };
    await checkLiveCapInWorker("run-x-uuid", 20, store);
    expect(calledWith).toBe("run-x-uuid");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// V9.5 SLC-V9.5-B MT-3: checkLiveTotalCapInWorker (Synthese-Stage Live-Cap)
// ────────────────────────────────────────────────────────────────────────────

describe("checkLiveTotalCapInWorker (V9.5 Synthese-Stage)", () => {
  const RUN_B = "33333333-3333-3333-3333-333333333333";

  it("liest total_cost_eur (nicht pattern_extraction) — 0 EUR → nicht exceeded", async () => {
    const store = makeMockStore({ runTotalCostEur: 0, runPatternCostEur: 99 });
    const result = await checkLiveTotalCapInWorker(RUN_B, 20, store);
    expect(result.exceeded).toBe(false);
    expect(result.currentEur).toBe(0); // total, nicht pattern (99)
  });

  it("18 EUR total + 20 EUR cap → nicht exceeded", async () => {
    const store = makeMockStore({ runTotalCostEur: 18 });
    const result = await checkLiveTotalCapInWorker(RUN_B, 20, store);
    expect(result.exceeded).toBe(false);
    expect(result.currentEur).toBe(18);
  });

  it("20 EUR genau auf cap → nicht exceeded (inclusive)", async () => {
    const store = makeMockStore({ runTotalCostEur: 20 });
    const result = await checkLiveTotalCapInWorker(RUN_B, 20, store);
    expect(result.exceeded).toBe(false);
    expect(result.currentEur).toBe(20);
  });

  it("20.5 EUR total ueber cap → exceeded (Worker bricht Synthese ab)", async () => {
    const store = makeMockStore({ runTotalCostEur: 20.5 });
    const result = await checkLiveTotalCapInWorker(RUN_B, 20, store);
    expect(result.exceeded).toBe(true);
    expect(result.currentEur).toBe(20.5);
  });

  it("Run-Isolation: Store filtert per runId", async () => {
    let calledWith: string | null = null;
    const store: CostCapStore = {
      async getTenantMonthCostEur() {
        return 0;
      },
      async getRunPatternExtractionCostEur() {
        return 0;
      },
      async getRunTotalCostEur(runId) {
        calledWith = runId;
        return 0;
      },
    };
    await checkLiveTotalCapInWorker("run-total-uuid", 20, store);
    expect(calledWith).toBe("run-total-uuid");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Spec-Case-Smoke: Slice-Spec L124-127 End-to-End-Szenarien
// ────────────────────────────────────────────────────────────────────────────

describe("Slice-Spec MT-3 End-to-End-Szenarien", () => {
  let store: CostCapStore;

  beforeEach(() => {
    store = makeMockStore({
      tenantMonthCostEur: 0,
      runPatternCostEur: 0,
    });
  });

  it("Spec-Case-A: 0.5 EUR estimate → alle Pre-Checks PASS", async () => {
    const estimateEur = 0.5;
    expect(checkRunCap(estimateEur, 20)).toBe(true);
    expect(checkPreApprovalThreshold(estimateEur, 10)).toBe(false);
    const tenantResult = await checkTenantMonthlyCap("t1", estimateEur, 100, store);
    expect(tenantResult.allowed).toBe(true);
  });

  it("Spec-Case-B: 25 EUR estimate → runCap-Block", async () => {
    const estimateEur = 25;
    expect(checkRunCap(estimateEur, 20)).toBe(false);
    // Pre-Approval-Modal wuerde auch triggern, aber das ist nicht der
    // Block-Pfad — runCap ist der Hard-Stop.
    expect(checkPreApprovalThreshold(estimateEur, 10)).toBe(true);
  });

  it("Spec-Case-C: 95 EUR bisher + 10 EUR estimate → tenant-monthly-cap-rejects", async () => {
    const customStore = makeMockStore({ tenantMonthCostEur: 95 });
    const estimateEur = 10;
    expect(checkRunCap(estimateEur, 20)).toBe(true); // Run-Cap OK
    expect(checkPreApprovalThreshold(estimateEur, 10)).toBe(false); // genau Schwelle
    const tenantResult = await checkTenantMonthlyCap("t1", estimateEur, 100, customStore);
    expect(tenantResult.allowed).toBe(false);
  });
});
