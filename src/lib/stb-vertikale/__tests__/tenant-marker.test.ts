import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import {
  STB_VERTICAL_STAGE_KEY,
  STB_VERTICAL_STAGE_1,
  readStbVerticalStage,
  isStbVerticalSession,
  mergeStbVerticalStage,
  setStbVerticalStage,
} from "../tenant-marker";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

// ── Pure Helpers (hermetisch, keine DB) ──────────────────────────────────

describe("readStbVerticalStage", () => {
  it("liefert null bei null/undefined metadata", () => {
    expect(readStbVerticalStage(null)).toBeNull();
    expect(readStbVerticalStage(undefined)).toBeNull();
  });

  it("liefert null bei fehlendem Key", () => {
    expect(readStbVerticalStage({})).toBeNull();
    expect(readStbVerticalStage({ foo: "bar" })).toBeNull();
  });

  it("liefert den String-Wert wenn gesetzt", () => {
    expect(readStbVerticalStage({ [STB_VERTICAL_STAGE_KEY]: "1" })).toBe("1");
    expect(readStbVerticalStage({ [STB_VERTICAL_STAGE_KEY]: "2" })).toBe("2");
  });

  it("liefert null bei leerem String oder Nicht-String (defensiv)", () => {
    expect(readStbVerticalStage({ [STB_VERTICAL_STAGE_KEY]: "" })).toBeNull();
    expect(readStbVerticalStage({ [STB_VERTICAL_STAGE_KEY]: 1 })).toBeNull();
    expect(readStbVerticalStage({ [STB_VERTICAL_STAGE_KEY]: true })).toBeNull();
  });
});

describe("isStbVerticalSession", () => {
  it("true wenn Marker gesetzt, sonst false", () => {
    expect(isStbVerticalSession({ [STB_VERTICAL_STAGE_KEY]: "1" })).toBe(true);
    expect(isStbVerticalSession({})).toBe(false);
    expect(isStbVerticalSession(null)).toBe(false);
  });
});

describe("mergeStbVerticalStage", () => {
  it("setzt Default-Stufe '1' bei leerem metadata", () => {
    expect(mergeStbVerticalStage(null)).toEqual({
      [STB_VERTICAL_STAGE_KEY]: STB_VERTICAL_STAGE_1,
    });
  });

  it("erhaelt bestehende Keys (additiv)", () => {
    const merged = mergeStbVerticalStage({
      v8_report_snapshot: { schemaVersion: 1 },
      imported_dataset_ref: "x",
    });
    expect(merged).toEqual({
      v8_report_snapshot: { schemaVersion: 1 },
      imported_dataset_ref: "x",
      [STB_VERTICAL_STAGE_KEY]: "1",
    });
  });

  it("ist idempotent (zweimal mergen = gleiches Ergebnis)", () => {
    const once = mergeStbVerticalStage({ foo: "bar" });
    const twice = mergeStbVerticalStage(once);
    expect(twice).toEqual(once);
  });

  it("akzeptiert eine explizite Stufe", () => {
    expect(mergeStbVerticalStage({}, "2")).toEqual({
      [STB_VERTICAL_STAGE_KEY]: "2",
    });
  });
});

// ── DB-Writer (gemockter Admin-Client, hermetisch) ───────────────────────

type ChainResult = { data?: unknown; error?: unknown };

function mockAdmin(opts: {
  read: ChainResult;
  write?: ChainResult;
}): { update: Mock } {
  const update = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve(opts.write ?? { error: null })),
  }));
  const select = vi.fn(() => ({
    eq: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve(opts.read)),
    })),
  }));
  const from = vi.fn(() => ({ select, update }));
  (createAdminClient as unknown as Mock).mockReturnValue({ from });
  return { update };
}

describe("setStbVerticalStage (fetch-merge-write, idempotent)", () => {
  beforeEach(() => {
    (createAdminClient as unknown as Mock).mockReset();
  });

  it("schreibt den Marker bei einer Session ohne Marker", async () => {
    const { update } = mockAdmin({ read: { data: { metadata: {} }, error: null } });

    const res = await setStbVerticalStage("sess-1");

    expect(res).toEqual({ ok: true, alreadySet: false });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toEqual({
      metadata: { [STB_VERTICAL_STAGE_KEY]: "1" },
    });
  });

  it("erhaelt bestehende metadata-Keys beim Schreiben", async () => {
    const { update } = mockAdmin({
      read: { data: { metadata: { v8_report_snapshot: { schemaVersion: 1 } } }, error: null },
    });

    await setStbVerticalStage("sess-1");

    expect(update.mock.calls[0][0]).toEqual({
      metadata: {
        v8_report_snapshot: { schemaVersion: 1 },
        [STB_VERTICAL_STAGE_KEY]: "1",
      },
    });
  });

  it("ist idempotent: kein Write wenn Marker bereits gesetzt", async () => {
    const { update } = mockAdmin({
      read: { data: { metadata: { [STB_VERTICAL_STAGE_KEY]: "1" } }, error: null },
    });

    const res = await setStbVerticalStage("sess-1");

    expect(res).toEqual({ ok: true, alreadySet: true });
    expect(update).not.toHaveBeenCalled();
  });

  it("liefert not_found bei 0 rows (PGRST116)", async () => {
    mockAdmin({ read: { data: null, error: { code: "PGRST116" } } });

    const res = await setStbVerticalStage("missing");

    expect(res).toEqual({ ok: false, error: "not_found" });
  });

  it("liefert read_failed bei anderem Read-Fehler", async () => {
    mockAdmin({ read: { data: null, error: { code: "57014" } } });

    const res = await setStbVerticalStage("sess-1");

    expect(res).toEqual({ ok: false, error: "read_failed" });
  });

  it("liefert write_failed wenn der Update-Fehler liefert", async () => {
    mockAdmin({
      read: { data: { metadata: {} }, error: null },
      write: { error: { code: "23514" } },
    });

    const res = await setStbVerticalStage("sess-1");

    expect(res).toEqual({ ok: false, error: "write_failed" });
  });
});
