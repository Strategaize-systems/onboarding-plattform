// V9.1 SLC-V9.1-C MT-1 — Vitest fuer getRetentionPolicy (pure, hermetisch).

import { describe, it, expect } from "vitest";

import {
  getRetentionPolicy,
  DEFAULT_SOFT_DELETE_DAYS,
  DEFAULT_HARD_DELETE_DAYS,
} from "../retention-policy";

describe("getRetentionPolicy", () => {
  it("liest ENV-Werte 60/90", () => {
    expect(
      getRetentionPolicy({
        V91_RETENTION_SOFT_DELETE_DAYS: "60",
        V91_RETENTION_HARD_DELETE_DAYS: "90",
      }),
    ).toEqual({ softDeleteDays: 60, hardDeleteDays: 90 });
  });

  it("nutzt Defaults ohne ENVs", () => {
    expect(getRetentionPolicy({})).toEqual({
      softDeleteDays: DEFAULT_SOFT_DELETE_DAYS,
      hardDeleteDays: DEFAULT_HARD_DELETE_DAYS,
    });
  });

  it("erlaubt Override beider Werte", () => {
    expect(
      getRetentionPolicy({
        V91_RETENTION_SOFT_DELETE_DAYS: "30",
        V91_RETENTION_HARD_DELETE_DAYS: "45",
      }),
    ).toEqual({ softDeleteDays: 30, hardDeleteDays: 45 });
  });

  it("faellt bei nicht-numerischem ENV auf Default zurueck", () => {
    expect(
      getRetentionPolicy({
        V91_RETENTION_SOFT_DELETE_DAYS: "abc",
        V91_RETENTION_HARD_DELETE_DAYS: "",
      }),
    ).toEqual({
      softDeleteDays: DEFAULT_SOFT_DELETE_DAYS,
      hardDeleteDays: DEFAULT_HARD_DELETE_DAYS,
    });
  });

  it("faellt bei nicht-positivem ENV auf Default zurueck", () => {
    expect(
      getRetentionPolicy({
        V91_RETENTION_SOFT_DELETE_DAYS: "0",
        V91_RETENTION_HARD_DELETE_DAYS: "-5",
      }),
    ).toEqual({
      softDeleteDays: DEFAULT_SOFT_DELETE_DAYS,
      hardDeleteDays: DEFAULT_HARD_DELETE_DAYS,
    });
  });

  it("wirft bei invalider Policy soft >= hard (90/60)", () => {
    expect(() =>
      getRetentionPolicy({
        V91_RETENTION_SOFT_DELETE_DAYS: "90",
        V91_RETENTION_HARD_DELETE_DAYS: "60",
      }),
    ).toThrow(/must be < /);
  });

  it("wirft bei soft === hard", () => {
    expect(() =>
      getRetentionPolicy({
        V91_RETENTION_SOFT_DELETE_DAYS: "60",
        V91_RETENTION_HARD_DELETE_DAYS: "60",
      }),
    ).toThrow(/must be < /);
  });
});
