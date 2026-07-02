import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { TemplateBlockSchema } from "@/lib/db/template-queries";
import { extractModuleContext } from "@/lib/stb-vertikale/module-context";

// V10 SLC-170b Welle 3-5 (AC-170b-1/2/3/4) — DB-Sidecar-Test fuer MIG-128
// (16 Fachmodul-Seeds M-01/02/03/06/07/08/15/16/26/27/28/35/36/38/39/42).
// node:20-Sidecar gegen die Coolify-DB (TEST_DATABASE_URL, coolify-test-setup.md).
// Self-apply in der gerollbackten Test-Transaktion — die Migration-Datei traegt
// BEGIN;/COMMIT; (Prod-Apply), die hier gestrippt werden, damit withTestDb die
// aeussere Transaktion sauber zurueckrollen kann (kein Prod-Write).
// Pattern-Reuse: migration-125/126-*.test.ts.

const VERSION = "1.0";
// [slug-suffix, Fragen-total, KI-Hebel]
const EXPECT: Array<[string, number, number]> = [
  ["m01", 17, 8], ["m02", 17, 8], ["m03", 17, 8], ["m06", 24, 11],
  ["m07", 22, 11], ["m08", 17, 8], ["m15", 17, 8], ["m16", 17, 8],
  ["m26", 24, 11], ["m27", 24, 11], ["m28", 24, 11], ["m35", 24, 11],
  ["m36", 17, 8], ["m38", 17, 8], ["m39", 17, 8], ["m42", 16, 8],
];

async function applyMig128(client: Client): Promise<void> {
  const raw = readFileSync(
    path.join(process.cwd(), "sql/migrations/128_v10_stb_fachmodule_seed.sql"),
    "utf8",
  );
  // BEGIN;/COMMIT; entfernen — withTestDb haelt bereits eine Transaktion (ROLLBACK).
  const sql = raw
    .split("\n")
    .filter((l) => !/^\s*(BEGIN|COMMIT);\s*$/.test(l))
    .join("\n");
  await client.query(sql);
}

interface Row {
  slug: string;
  name: string;
  description: string | null;
  blocks: unknown;
  metadata: Record<string, unknown>;
}

async function loadAll(client: Client): Promise<Row[]> {
  const r = await client.query<Row>(
    `SELECT slug, name, description, blocks, metadata
       FROM public.template
      WHERE slug LIKE 'stb_modul_%' AND slug <> 'stb_modul_m04' AND version = $1
      ORDER BY slug`,
    [VERSION],
  );
  return r.rows;
}

describe("MIG-128: StB-Fachmodul-Seed (V10 SLC-170b Welle 3-5, AC-170b-1/2/3/4)", () => {
  it("seedet 16 Fachmodule idempotent (2. Apply = keine Duplikate) (AC-170b-2)", async () => {
    await withTestDb(async (client) => {
      await applyMig128(client);
      await applyMig128(client); // ON CONFLICT (slug,version) DO UPDATE -> kein Wurf
      const rows = await loadAll(client);
      expect(rows).toHaveLength(EXPECT.length);
      expect(rows.map((r) => r.slug.replace("stb_modul_", "")).sort()).toEqual(
        EXPECT.map(([mk]) => mk).sort(),
      );
    });
  });

  it("jede Row laedt durch das echte extractModuleContext + erwartete Counts (AC-170b-1)", async () => {
    await withTestDb(async (client) => {
      await applyMig128(client);
      const rows = await loadAll(client);
      const byMk = new Map(rows.map((r) => [r.slug.replace("stb_modul_", ""), r]));

      for (const [mk, eQ, eH] of EXPECT) {
        const row = byMk.get(mk);
        expect(row, `Row ${mk} fehlt`).toBeDefined();

        // Der echte App-Gate: wirft bei kaputter metadata/blocks-Shape.
        const ctx = extractModuleContext({
          name: row!.name,
          description: row!.description,
          blocks: row!.blocks,
          metadata: row!.metadata,
        });

        expect(ctx.modulKey).toBe(mk);
        expect(ctx.metadata.output_contract.kinds).toEqual([
          "entscheidung",
          "standard",
          "implementierungsschritt",
        ]);
        expect(ctx.metadata.themenmodell.length).toBe(6);
        expect(ctx.metadata.themenmodell.every((t) => t.unterpunkte.length > 0)).toBe(true);
        expect(ctx.metadata.ki_hebel.length).toBe(eH);
        expect(ctx.metadata.ki_hebel.every((h) => h.reifegrad >= 1 && h.reifegrad <= 4)).toBe(true);

        const blocks = z.array(TemplateBlockSchema).parse(row!.blocks);
        expect(blocks).toHaveLength(2);
        const kern = blocks.find((b) => b.key === "stufe1_kern")!;
        const vert = blocks.find((b) => b.key === "stufe2_vertiefung")!;
        expect(kern.required).toBe(true);
        expect(vert.required).toBe(false);
        expect(kern.questions.every((q) => q.ebene === "Kern")).toBe(true);
        expect(vert.questions.every((q) => q.ebene === "Vertiefung")).toBe(true);
        const nQ = kern.questions.length + vert.questions.length;
        expect(nQ).toBe(eQ);
        // Scoring-Flags = false (Delivery-Schicht spaeter)
        expect(kern.questions.every((q) => q.owner_dependency === false && q.ko_hart === false)).toBe(true);
      }
    });
  });

  it("Content verbatim aus der Quelle (Spot-Check M-42 F-M42-001) (AC-170b-3)", async () => {
    await withTestDb(async (client) => {
      await applyMig128(client);
      const rows = await loadAll(client);
      const m42 = rows.find((r) => r.slug === "stb_modul_m42")!;
      const blocks = z.array(TemplateBlockSchema).parse(m42.blocks);
      const q1 = blocks[0].questions[0];
      expect(q1.frage_id).toBe("F-M42-001");
      expect(q1.text).toContain("typische Arbeitswoche");
      expect(q1.unterbereich).toBe("u1a_rolle_heute");
    });
  });
});
