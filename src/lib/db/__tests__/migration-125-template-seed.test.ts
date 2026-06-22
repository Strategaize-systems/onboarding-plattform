import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";
import { TemplateBlockSchema } from "@/lib/db/template-queries";

// V10 SLC-170 MT-3 (AC-170-1..5) — DB-Sidecar-Test fuer Mig 125 (M-04 Template-Seed).
// Die Migration ist erst /deploy LIVE (R-170 analog R-169-2) — deshalb wird sie hier
// IN der gerollbackten Test-Transaktion self-applied. node:20-Sidecar gegen die
// Coolify-DB (TEST_DATABASE_URL, coolify-test-setup.md).
//
// Voraussetzung im Test-DB-Schema (live: 021/093/096): template-Tabelle +
// template.metadata jsonb + UNIQUE(slug, version) Index. Mig 125 seeded nur eine
// Row (kein Schema-DDL).
//
// Pattern-Reuse: migration-124-modul-output.test.ts (self-apply + withJwtContext).

const M04_SLUG = "stb_modul_m04";
const M04_VERSION = "1.0";

/**
 * Mig 125 self-apply innerhalb der Test-Transaktion. Die Migration kapselt ihr
 * INSERT in einem `DO $mig125$ ... END $mig125$;`-Block (kein standalone
 * `BEGIN;`/`COMMIT;`) — sie laeuft daher unveraendert in der aeusseren
 * withTestDb-Transaktion. Idempotent (ON CONFLICT (slug, version) DO UPDATE).
 */
async function applyMig125(client: Client): Promise<void> {
  const sql = readFileSync(
    path.join(process.cwd(), "sql/migrations/125_v10_stb_template_seed.sql"),
    "utf8",
  );
  await client.query(sql);
}

interface SeededRow {
  slug: string;
  version: string;
  name: string;
  description: string | null;
  blocks: unknown;
  metadata: Record<string, unknown>;
  block_count: number;
  question_count: number;
}

async function loadM04(client: Client): Promise<SeededRow | null> {
  const r = await client.query<SeededRow>(
    `SELECT slug, version, name, description, blocks, metadata,
            jsonb_array_length(blocks) AS block_count,
            (SELECT COUNT(*)::int
               FROM jsonb_array_elements(blocks) b,
                    jsonb_array_elements(b->'questions') q) AS question_count
       FROM public.template
      WHERE slug = $1 AND version = $2`,
    [M04_SLUG, M04_VERSION],
  );
  return r.rows[0] ?? null;
}

describe("MIG-125: M-04 template seed (V10 SLC-170 AC-170-1/3)", () => {
  it("seeds stb_modul_m04 v1.0 with 2 blocks, 26 questions, 13 KI-Hebel — idempotent", async () => {
    await withTestDb(async (client) => {
      await applyMig125(client);
      // 2. Apply = ON CONFLICT DO UPDATE -> kein Wurf, keine zweite Row (AC-170-2).
      await applyMig125(client);

      const dupes = await client.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM public.template WHERE slug = $1`,
        [M04_SLUG],
      );
      expect(dupes.rows[0].n).toBe(1);

      const row = await loadM04(client);
      expect(row).not.toBeNull();
      expect(row!.version).toBe(M04_VERSION);
      expect(row!.block_count).toBe(2);
      expect(row!.question_count).toBe(26);
      expect(jsonbArrayLen(row!.metadata, "ki_hebel")).toBe(13);
      expect(row!.metadata.modul_key).toBe("m04");
      expect(row!.metadata.modul_id).toBe("M-04");
    });
  });

  it("blocks parse against TemplateBlockSchema and carry the Stufe-1/Stufe-2 split (AC-170-1/5)", async () => {
    await withTestDb(async (client) => {
      await applyMig125(client);
      const row = await loadM04(client);
      // AC-170-5: blocks parst (capture-Shape: id/key/title/order/required/weight/questions
      // mit frage_id/ebene/unterbereich/position).
      const blocks = z.array(TemplateBlockSchema).parse(row!.blocks);
      expect(blocks).toHaveLength(2);

      const kern = blocks.find((b) => b.key === "stufe1_kern")!;
      const vertiefung = blocks.find((b) => b.key === "stufe2_vertiefung")!;
      expect(kern).toBeDefined();
      expect(vertiefung).toBeDefined();

      // Stufe-1-Kern: required=true, alle Fragen ebene "Kern".
      expect(kern.required).toBe(true);
      expect(kern.questions).toHaveLength(10);
      expect(kern.questions.every((q) => q.ebene === "Kern")).toBe(true);

      // Stufe-2-Vertiefung: required=false, alle Fragen ebene "Workspace".
      expect(vertiefung.required).toBe(false);
      expect(vertiefung.questions).toHaveLength(16);
      expect(vertiefung.questions.every((q) => q.ebene === "Workspace")).toBe(true);

      // frage_id eindeutig + Positionen 1..26 lueckenlos.
      const allQ = [...kern.questions, ...vertiefung.questions];
      const frageIds = new Set(allQ.map((q) => q.frage_id));
      expect(frageIds.size).toBe(26);
      const positions = allQ.map((q) => q.position).sort((a, b) => a - b);
      expect(positions).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    });
  });

  it("metadata.ki_hebel covers Reifegrad 1-4 and output_contract mirrors modul_output.output_kind (AC-170-3)", async () => {
    await withTestDb(async (client) => {
      await applyMig125(client);
      const row = await loadM04(client);
      const hebel = row!.metadata.ki_hebel as Array<{ reifegrad: number }>;
      expect(hebel).toHaveLength(13);
      const grade = new Set(hebel.map((h) => h.reifegrad));
      expect([...grade].sort()).toEqual([1, 2, 3, 4]);

      const oc = row!.metadata.output_contract as { kinds: string[] };
      expect(oc.kinds).toEqual([
        "entscheidung",
        "standard",
        "implementierungsschritt",
      ]);
    });
  });
});

describe("MIG-125: M-04 template RLS read (V10 SLC-170 AC-170-4)", () => {
  it("an authenticated tenant user can SELECT the seeded template (template_read_all)", async () => {
    await withTestDb(async (client) => {
      await applyMig125(client);
      const { userA } = await seedTestTenants(client);
      await withJwtContext(client, userA, async () => {
        const r = await client.query<{ slug: string }>(
          `SELECT slug FROM public.template WHERE slug = $1`,
          [M04_SLUG],
        );
        expect(r.rows).toHaveLength(1);
        expect(r.rows[0].slug).toBe(M04_SLUG);
      });
    });
  });
});

function jsonbArrayLen(meta: Record<string, unknown>, key: string): number {
  const v = meta[key];
  return Array.isArray(v) ? v.length : -1;
}
