// V10 SLC-174 MT-3 — Tests fuer cost-cap (Run-Cap pure + Tenant-Monatscap DB-Store).

import { afterEach, describe, it, expect, vi } from "vitest";
import {
  checkRunCapEur,
  checkTenantMonthCap,
  createModuleCostCapStore,
  resolveModuleRunCapEur,
  resolveModuleTenantMonthCapEur,
  usdToEur,
  DEFAULT_MODULE_RUN_CAP_EUR,
  DEFAULT_MODULE_TENANT_MONTH_CAP_EUR,
  type ModuleCostCapStore,
} from "../cost-cap";

const ORIG_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe("checkRunCapEur", () => {
  it("allows at/below cap, blocks above", () => {
    expect(checkRunCapEur(4.99, 5)).toBe(true);
    expect(checkRunCapEur(5, 5)).toBe(true);
    expect(checkRunCapEur(5.01, 5)).toBe(false);
  });
});

describe("resolve*Cap", () => {
  it("uses override, then ENV, then default", () => {
    expect(resolveModuleRunCapEur(2)).toBe(2);
    delete process.env.V10_MODULE_SYNTHESIS_RUN_CAP_EUR;
    expect(resolveModuleRunCapEur()).toBe(DEFAULT_MODULE_RUN_CAP_EUR);
    process.env.V10_MODULE_SYNTHESIS_RUN_CAP_EUR = "12";
    expect(resolveModuleRunCapEur()).toBe(12);

    delete process.env.V10_MODULE_SYNTHESIS_TENANT_MONTH_CAP_EUR;
    expect(resolveModuleTenantMonthCapEur()).toBe(DEFAULT_MODULE_TENANT_MONTH_CAP_EUR);
  });
});

describe("checkTenantMonthCap", () => {
  it("allowed while current spend below cap", async () => {
    const store: ModuleCostCapStore = { getTenantMonthCostEur: async () => 10 };
    expect(await checkTenantMonthCap("t", 50, store)).toEqual({
      allowed: true,
      currentMonthEur: 10,
    });
  });
  it("blocked once current spend reaches cap", async () => {
    const store: ModuleCostCapStore = { getTenantMonthCostEur: async () => 50 };
    const r = await checkTenantMonthCap("t", 50, store);
    expect(r.allowed).toBe(false);
  });
});

describe("createModuleCostCapStore", () => {
  it("sums usd_cost for module roles in the current month and converts to EUR", async () => {
    const rows = [{ usd_cost: 0.01 }, { usd_cost: "0.02" }, { usd_cost: null }];
    const inMock = vi.fn(async () => ({ data: rows, error: null }));
    const gteMock = vi.fn(() => ({ in: inMock }));
    const eqMock = vi.fn(() => ({ gte: gteMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    const client = { from: vi.fn(() => ({ select: selectMock })) } as never;

    const store = createModuleCostCapStore(client);
    const eur = await store.getTenantMonthCostEur("tenant-x");
    expect(eqMock).toHaveBeenCalledWith("tenant_id", "tenant-x");
    expect(inMock).toHaveBeenCalledWith("role", [
      "module_output_synthesis",
      "module_output_critic",
    ]);
    expect(eur).toBeCloseTo(usdToEur(0.03), 8);
  });

  it("throws on DB error", async () => {
    const inMock = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ in: inMock }) }) }) }),
    } as never;
    const store = createModuleCostCapStore(client);
    await expect(store.getTenantMonthCostEur("t")).rejects.toThrow(/boom/);
  });
});
