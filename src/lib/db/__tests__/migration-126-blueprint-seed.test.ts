import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";
import { TemplateBlockSchema } from "@/lib/db/template-queries";

// V10 SLC-170b Welle 1 (AC-170b-1/2/4) — DB-Sidecar-Test fuer Mig 126
// (stb_blueprint_kanzlei Blueprint-Seed). Die Migration ist erst /deploy LIVE —
// deshalb wird sie hier IN der gerollbackten Test-Transaktion self-applied.
// node:20-Sidecar gegen die Coolify-DB (TEST_DATABASE_URL, coolify-test-setup.md).
//
// Voraussetzung im Test-DB-Schema (live: 021/051/093/096): template-Tabelle +
// template.metadata/diagnosis_schema/diagnosis_prompt jsonb + UNIQUE(slug, version).
// Mig 126 seeded nur eine Row (kein Schema-DDL).
//
// Pattern-Reuse: migration-125-template-seed.test.ts (M-04 Seed).

const BP_SLUG = "stb_blueprint_kanzlei";
const BP_VERSION = "1.0";

async function applyMig126(client: Client): Promise<void> {
  const sql = readFileSync(
    path.join(process.cwd(), "sql/migrations/126_v10_stb_blueprint_seed.sql"),
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
  diagnosis_schema: Record<string, unknown> | null;
  diagnosis_prompt: Record<string, unknown> | null;
  block_count: number;
  question_count: number;
}

async function loadBp(client: Client): Promise<SeededRow | null> {
  const r = await client.query<SeededRow>(
    `SELECT slug, version, name, description, blocks, metadata,
            diagnosis_schema, diagnosis_prompt,
            jsonb_array_length(blocks) AS block_count,
            (SELECT COUNT(*)::int
               FROM jsonb_array_elements(blocks) b,
                    jsonb_array_elements(b->'questions') q) AS question_count
       FROM public.template
      WHERE slug = $1 AND version = $2`,
    [BP_SLUG, BP_VERSION],
  );
  return r.rows[0] ?? null;
}

describe("MIG-126: Kanzlei-Blueprint seed (V10 SLC-170b AC-170b-1/2)", () => {
  it("seeds stb_blueprint_kanzlei v1.0 with 2 blocks, 20 questions, no ki_hebel — idempotent", async () => {
    await withTestDb(async (client) => {
      await applyMig126(client);
      // 2. Apply = ON CONFLICT DO UPDATE -> kein Wurf, keine zweite Row (AC-170b-2).
      await applyMig126(client);

      const dupes = await client.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM public.template WHERE slug = $1`,
        [BP_SLUG],
      );
      expect(dupes.rows[0].n).toBe(1);

      const row = await loadBp(client);
      expect(row).not.toBeNull();
      expect(row!.version).toBe(BP_VERSION);
      expect(row!.block_count).toBe(2);
      expect(row!.question_count).toBe(20);
      // Blueprint liefert Diagnose+Routing, NICHT Triple/KI-Hebel.
      expect(row!.metadata.ki_hebel).toBeUndefined();
      expect(row!.metadata.output_contract).toBeUndefined();
      expect(row!.metadata.modul_key).toBe("bp");
      expect(row!.metadata.modul_id).toBe("M-BP");
      expect(row!.metadata.modul_marker).toBe("diagnostic");
    });
  });

  it("blocks parse against TemplateBlockSchema and carry the Kern/Vertiefung split (AC-170b-1)", async () => {
    await withTestDb(async (client) => {
      await applyMig126(client);
      const row = await loadBp(client);
      const blocks = z.array(TemplateBlockSchema).parse(row!.blocks);
      expect(blocks).toHaveLength(2);

      const kern = blocks.find((b) => b.key === "stufe1_kern")!;
      const vertiefung = blocks.find((b) => b.key === "stufe2_vertiefung")!;
      expect(kern).toBeDefined();
      expect(vertiefung).toBeDefined();

      // Stufe-1-Kern: required=true (der Gratis-Test), 15 Fragen, alle ebene "Kern".
      expect(kern.required).toBe(true);
      expect(kern.questions).toHaveLength(15);
      expect(kern.questions.every((q) => q.ebene === "Kern")).toBe(true);

      // Stufe-2-Vertiefung: required=false (nicht im automatischen Pfad), 5 Fragen.
      expect(vertiefung.required).toBe(false);
      expect(vertiefung.questions).toHaveLength(5);
      expect(vertiefung.questions.every((q) => q.ebene === "Vertiefung")).toBe(true);

      // frage_id eindeutig + Positionen 1..20 lueckenlos.
      const allQ = [...kern.questions, ...vertiefung.questions];
      const frageIds = new Set(allQ.map((q) => q.frage_id));
      expect(frageIds.size).toBe(20);
      const positions = allQ.map((q) => q.position).sort((a, b) => a - b);
      expect(positions).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });
  });

  it("diagnosis_schema has 7 blocks A-G / 13 subtopics, 13 fields, and every question_key maps to a real frage_id (AC-170b-1)", async () => {
    await withTestDb(async (client) => {
      await applyMig126(client);
      const row = await loadBp(client);

      const schema = row!.diagnosis_schema as {
        blocks: Record<string, { subtopics: Array<{ key: string; name: string; question_keys: string[] }> }>;
        fields: Array<{ key: string }>;
      };
      expect(schema).not.toBeNull();
      expect(Object.keys(schema.blocks).sort()).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
      expect(schema.fields).toHaveLength(13);
      const fieldKeys = schema.fields.map((f) => f.key);
      expect(fieldKeys).toContain("ampel");
      expect(fieldKeys).toContain("reifegrad");
      expect(fieldKeys).toContain("empfehlung");

      const subtopics = Object.values(schema.blocks).flatMap((b) => b.subtopics);
      expect(subtopics).toHaveLength(13);

      // Jeder question_key der Diagnose existiert als reale frage_id im Capture (kein Waise).
      const blocks = z.array(TemplateBlockSchema).parse(row!.blocks);
      const realFrageIds = new Set(blocks.flatMap((b) => b.questions.map((q) => q.frage_id)));
      const allQuestionKeys = subtopics.flatMap((st) => st.question_keys);
      expect(allQuestionKeys.every((qk) => realFrageIds.has(qk))).toBe(true);
      // alle 20 Fragen sind in der Diagnose verankert.
      expect(new Set(allQuestionKeys).size).toBe(20);

      // diagnosis_prompt vorhanden (system_prompt override + field_instructions).
      const prompt = row!.diagnosis_prompt as {
        system_prompt?: string;
        field_instructions?: Record<string, string>;
      };
      expect(typeof prompt.system_prompt).toBe("string");
      expect(prompt.system_prompt!.length).toBeGreaterThan(100);
      expect(Object.keys(prompt.field_instructions ?? {})).toHaveLength(13);
    });
  });

  it("metadata.routing covers all 13 subtopics, activates on ampel yellow/red, and reaches the 17 core modules (AC-170b-1)", async () => {
    await withTestDb(async (client) => {
      await applyMig126(client);
      const row = await loadBp(client);
      const routing = row!.metadata.routing as Array<{
        block: string;
        subtopic: string;
        activate_when: { ampel: string[] };
        primary_modul_key: string;
        secondary_modul_key: string;
      }>;
      expect(routing).toHaveLength(13);
      expect(routing.every((r) => r.activate_when.ampel.includes("yellow") && r.activate_when.ampel.includes("red"))).toBe(true);

      const reached = new Set(
        routing.flatMap((r) => [r.primary_modul_key, r.secondary_modul_key]),
      );
      // Abdeckung: alle 17 Kern-Module erreichbar (M-BP §6), m05 nicht enthalten.
      expect(reached.size).toBe(17);
      expect(reached.has("m05")).toBe(false);
      expect([...reached].every((k) => /^m\d{2}$/.test(k))).toBe(true);
    });
  });
});

describe("MIG-126: Blueprint template RLS read (V10 SLC-170b AC-170b-4)", () => {
  it("an authenticated tenant user can SELECT the seeded blueprint template (template_read_all)", async () => {
    await withTestDb(async (client) => {
      await applyMig126(client);
      const { userA } = await seedTestTenants(client);
      await withJwtContext(client, userA, async () => {
        const r = await client.query<{ slug: string }>(
          `SELECT slug FROM public.template WHERE slug = $1`,
          [BP_SLUG],
        );
        expect(r.rows).toHaveLength(1);
        expect(r.rows[0].slug).toBe(BP_SLUG);
      });
    });
  });
});
