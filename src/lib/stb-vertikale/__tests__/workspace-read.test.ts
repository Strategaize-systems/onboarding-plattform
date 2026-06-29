// V10 SLC-175 MT-1 — Vitest fuer den Modul-Workspace-Reader (workspace-read.ts).
//
// Strategie: pure Gruppierungs-/Sortier-Logik hermetisch + async-Reader mit
// chainable Supabase-Client-Stub (keine DB). Die echte RLS-Tenant-Isolation
// (AC-175-3) wird per node:20-DB-Sidecar in /qa verifiziert (coolify-test-setup.md).
//
// Coverage:
//   1. groupModuleOutputs: Triple in kanonischer Reihenfolge (alle 3 Kinds, ggf. leer)
//   2. groupModuleOutputs: KI-Hebel gestaffelt nach Reifegrad 1->4 (nulls zuletzt)
//   3. groupModuleOutputs: fremder modul_key wird ignoriert
//   4. summarizeModulOutputs: Gruppierung/Counts/latestCreatedAt + Sort
//   5. modulKeyToLabel
//   6. ModulOutputRowSchema: evidence_refs-Toleranz
//   7. readWorkspaceOutputs / readModulOutputsForModul: parse + Error-Pfad

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  groupModuleOutputs,
  summarizeModulOutputs,
  modulKeyToLabel,
  ModulOutputRowSchema,
  readWorkspaceOutputs,
  readModulOutputsForModul,
  OUTPUT_TRIPLE_KINDS,
  type ModulOutputRow,
} from "../workspace-read";

// ─── Fixtures ────────────────────────────────────────────────────────────────
function row(overrides: Partial<ModulOutputRow> = {}): ModulOutputRow {
  return {
    id: overrides.id ?? "11111111-1111-1111-1111-111111111111",
    modul_key: overrides.modul_key ?? "m04",
    output_kind: overrides.output_kind ?? "entscheidung",
    title: overrides.title ?? "Titel",
    body: overrides.body ?? "Body",
    reifegrad: overrides.reifegrad ?? null,
    evidence_refs: overrides.evidence_refs ?? [],
    source: overrides.source ?? "ai_draft",
    status: overrides.status ?? "proposed",
    capture_session_id:
      overrides.capture_session_id ?? "22222222-2222-2222-2222-222222222222",
    ai_job_id: overrides.ai_job_id ?? "33333333-3333-3333-3333-333333333333",
    created_at: overrides.created_at ?? "2026-06-22T10:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-06-22T10:00:00.000Z",
  };
}

/** Chainable Supabase-Stub: from/select/eq/order liefern den Builder, await -> result. */
function mockClient(result: { data?: unknown; error?: unknown }): SupabaseClient {
  const builder: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "order"]) {
    builder[m] = () => builder;
  }
  (builder as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
  ): unknown => resolve(result);
  return builder as unknown as SupabaseClient;
}

// ─── 1+2+3. groupModuleOutputs ───────────────────────────────────────────────
describe("groupModuleOutputs", () => {
  it("liefert alle drei Triple-Sections in kanonischer Reihenfolge", () => {
    const rows = [
      row({ id: "a", output_kind: "standard", title: "S" }),
      row({ id: "b", output_kind: "entscheidung", title: "E" }),
    ];
    const grouped = groupModuleOutputs("m04", rows);
    expect(grouped.triple.map((t) => t.kind)).toEqual([...OUTPUT_TRIPLE_KINDS]);
    expect(grouped.triple[0].rows.map((r) => r.id)).toEqual(["b"]); // entscheidung
    expect(grouped.triple[1].rows.map((r) => r.id)).toEqual(["a"]); // standard
    expect(grouped.triple[2].rows).toEqual([]); // implementierungsschritt leer
    expect(grouped.total).toBe(2);
  });

  it("staffelt KI-Hebel nach Reifegrad 1->4, nulls zuletzt, dann Titel", () => {
    const rows = [
      row({ id: "h3", output_kind: "ki_hebel", reifegrad: 3, title: "Gamma" }),
      row({ id: "h1", output_kind: "ki_hebel", reifegrad: 1, title: "Alpha" }),
      row({ id: "hx", output_kind: "ki_hebel", reifegrad: null, title: "Ohne" }),
      row({ id: "h1b", output_kind: "ki_hebel", reifegrad: 1, title: "Beta" }),
    ];
    const grouped = groupModuleOutputs("m04", rows);
    expect(grouped.kiHebel.map((r) => r.id)).toEqual(["h1", "h1b", "h3", "hx"]);
  });

  it("ignoriert Rows fremder modul_key", () => {
    const rows = [
      row({ id: "own", modul_key: "m04", output_kind: "entscheidung" }),
      row({ id: "alien", modul_key: "m05", output_kind: "entscheidung" }),
    ];
    const grouped = groupModuleOutputs("m04", rows);
    expect(grouped.total).toBe(1);
    expect(grouped.triple[0].rows.map((r) => r.id)).toEqual(["own"]);
  });
});

// ─── 4. summarizeModulOutputs ────────────────────────────────────────────────
describe("summarizeModulOutputs", () => {
  it("gruppiert je modul_key, zaehlt Triple/KI-Hebel und merkt latestCreatedAt", () => {
    const rows = [
      row({ modul_key: "m05", output_kind: "ki_hebel", reifegrad: 2, created_at: "2026-06-22T08:00:00.000Z" }),
      row({ modul_key: "m04", output_kind: "entscheidung", created_at: "2026-06-22T09:00:00.000Z" }),
      row({ modul_key: "m04", output_kind: "ki_hebel", reifegrad: 1, created_at: "2026-06-22T11:00:00.000Z" }),
    ];
    const summaries = summarizeModulOutputs(rows);
    // aufsteigend sortiert: m04 vor m05
    expect(summaries.map((s) => s.modulKey)).toEqual(["m04", "m05"]);
    const m04 = summaries[0];
    expect(m04.outputCount).toBe(2);
    expect(m04.tripleCount).toBe(1);
    expect(m04.kiHebelCount).toBe(1);
    expect(m04.latestCreatedAt).toBe("2026-06-22T11:00:00.000Z");
    expect(summaries[1].outputCount).toBe(1);
  });

  it("liefert [] fuer keine Rows", () => {
    expect(summarizeModulOutputs([])).toEqual([]);
  });
});

// ─── 5. modulKeyToLabel ──────────────────────────────────────────────────────
describe("modulKeyToLabel", () => {
  it("formatiert mNN -> M-NN, sonst uppercase-Fallback", () => {
    expect(modulKeyToLabel("m04")).toBe("M-04");
    expect(modulKeyToLabel("m12")).toBe("M-12");
    expect(modulKeyToLabel("sonder")).toBe("SONDER");
  });
});

// ─── 6. evidence_refs-Toleranz ───────────────────────────────────────────────
describe("ModulOutputRowSchema evidence_refs", () => {
  it("filtert Nicht-String-Eintraege heraus", () => {
    const parsed = ModulOutputRowSchema.parse({
      ...row(),
      evidence_refs: ["F-M04-001", 42, null, "F-M04-002"],
    });
    expect(parsed.evidence_refs).toEqual(["F-M04-001", "F-M04-002"]);
  });

  it("faellt bei kaputter Shape auf [] zurueck", () => {
    const parsed = ModulOutputRowSchema.parse({ ...row(), evidence_refs: "nope" });
    expect(parsed.evidence_refs).toEqual([]);
  });
});

// ─── 7. Async-Reader ─────────────────────────────────────────────────────────
describe("readWorkspaceOutputs / readModulOutputsForModul", () => {
  it("parst die zurueckgelieferten Rows", async () => {
    const data = [row({ id: "r1", modul_key: "m04" }), row({ id: "r2", modul_key: "m05" })];
    const client = mockClient({ data, error: null });
    const out = await readWorkspaceOutputs(client);
    expect(out.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("liefert [] bei data=null", async () => {
    const client = mockClient({ data: null, error: null });
    expect(await readModulOutputsForModul(client, "m04")).toEqual([]);
  });

  it("wirft bei Query-Error", async () => {
    const client = mockClient({ data: null, error: { message: "permission denied" } });
    await expect(readWorkspaceOutputs(client)).rejects.toMatchObject({
      message: "permission denied",
    });
  });
});
