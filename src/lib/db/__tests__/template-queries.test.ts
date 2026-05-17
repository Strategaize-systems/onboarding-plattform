import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";

describe("Template Queries — Exit-Readiness Seed", () => {
  it("getTemplateBySlug returns exit_readiness with correct structure", async () => {
    await withTestDb(async (client) => {
      const result = await client.query<{
        slug: string;
        name: string;
        version: string;
        description: string;
        blocks: unknown[];
      }>(
        `SELECT slug, name, version, description, blocks
         FROM public.template
         WHERE slug = 'exit_readiness'`
      );

      expect(result.rowCount).toBe(1);
      const row = result.rows[0];
      expect(row.slug).toBe("exit_readiness");
      expect(row.name).toBe("Exit-Readiness");
      expect(row.version).toBe("1.0.0");
      expect(row.description).toContain("73 Fragen");

      const blocks = row.blocks as Array<{ key: string; questions: unknown[] }>;
      expect(blocks).toHaveLength(9);
    });
  });

  it("exit_readiness has exactly 73 questions across 9 blocks", async () => {
    await withTestDb(async (client) => {
      const result = await client.query<{ blocks: unknown[] }>(
        `SELECT blocks FROM public.template WHERE slug = 'exit_readiness'`
      );

      const blocks = result.rows[0].blocks as Array<{
        key: string;
        title: Record<string, string>;
        order: number;
        required: boolean;
        questions: Array<{ frage_id: string; text: string; ebene: string }>;
      }>;

      const expectedCounts: Record<string, number> = {
        A: 10, B: 11, C: 13, D: 10, E: 7, F: 5, G: 5, H: 6, I: 6,
      };

      let totalQuestions = 0;
      for (const block of blocks) {
        expect(block.key).toBeDefined();
        expect(block.title.de).toBeDefined();
        expect(block.title.en).toBeDefined();
        expect(block.title.nl).toBeDefined();
        expect(block.order).toBeGreaterThan(0);
        expect(block.required).toBe(true);

        const expected = expectedCounts[block.key];
        expect(block.questions).toHaveLength(expected);
        totalQuestions += block.questions.length;

        for (const q of block.questions) {
          expect(q.frage_id).toMatch(/^F-BP-\d{3}$/);
          expect(q.text.length).toBeGreaterThan(10);
          expect(["Kern", "Workspace"]).toContain(q.ebene);
        }
      }

      expect(totalQuestions).toBe(73);
    });
  });

  it("blocks are ordered A through I", async () => {
    await withTestDb(async (client) => {
      const result = await client.query<{ blocks: unknown[] }>(
        `SELECT blocks FROM public.template WHERE slug = 'exit_readiness'`
      );

      const blocks = result.rows[0].blocks as Array<{ key: string; order: number }>;
      const keys = blocks.sort((a, b) => a.order - b.order).map((b) => b.key);
      expect(keys).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
    });
  });

  it("listTemplates includes exit_readiness", async () => {
    await withTestDb(async (client) => {
      const result = await client.query<{ slug: string }>(
        `SELECT slug FROM public.template ORDER BY created_at`
      );

      const slugs = result.rows.map((r) => r.slug);
      expect(slugs).toContain("exit_readiness");
    });
  });

  it("ON CONFLICT: re-running seed does not duplicate", async () => {
    await withTestDb(async (client) => {
      // V6.4 SLC-130: ON CONFLICT (slug) wurde durch ON CONFLICT (slug, version)
      // ersetzt, weil Migration 096 den template_slug_key Constraint gedroppt
      // hat und template_slug_version_unique als neuer Index gilt.
      await client.query(
        `INSERT INTO public.template (slug, name, version, description, blocks)
         VALUES ('exit_readiness', 'Exit-Readiness', '1.0.0', 'test', '[]'::jsonb)
         ON CONFLICT (slug, version) DO NOTHING`
      );

      const result = await client.query<{ count: string }>(
        `SELECT count(*) FROM public.template WHERE slug = 'exit_readiness' AND version = '1.0.0'`
      );
      expect(parseInt(result.rows[0].count)).toBe(1);
    });
  });
});
