import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { TemplateBlockSchema } from "@/lib/db/template-queries";

// V10.1 SLC-177 (AC-177-3/4) — DB-Sidecar-Test fuer MIG-129 (Scoring-Flag-Seed,
// 17 Fachmodule inkl. M-04). node:20-Sidecar gegen die Coolify-DB
// (TEST_DATABASE_URL, coolify-test-setup.md). withTestDb haelt eine Transaktion
// (ROLLBACK) — die Rows sind live (MIG-125/128), MIG-129 UPDATEt sie in-tx.
// BEGIN;/COMMIT; werden gestrippt (aeussere Tx rollt zurueck, kein Prod-Write).
// Pattern-Reuse: migration-128-fachmodule-seed.test.ts.
//
// App-Zod-Gate = TemplateBlockSchema (validiert Block/Question/Flag-Shape exakt).
// Kein extractModuleContext-Gate noetig: MIG-129 aendert ausschliesslich die flachen
// Flag-Booleans, NICHT metadata (themenmodell/ki_hebel/output_contract) — der
// Content-Fingerprint-Test (AC-177-3) beweist die Unveraendertheit direkt.

const VERSION = "1.0";
const FLAG_KEYS = [
  "owner_dependency",
  "deal_blocker",
  "sop_trigger",
  "ko_hart",
  "ko_soft",
] as const;

const MIG_PATH = "sql/migrations/129_v101_module_delivery_flags_seed.sql";
const FLAGMAP_PATH = "docs/stb-vertikale/module-delivery-flags.json";

type FlagMap = Record<string, Record<string, Partial<Record<string, boolean>>>>;

function loadFlagMap(): FlagMap {
  const raw = readFileSync(path.join(process.cwd(), FLAGMAP_PATH), "utf8");
  return (JSON.parse(raw) as { modules: FlagMap }).modules;
}

async function applyMig129(client: Client): Promise<void> {
  const raw = readFileSync(path.join(process.cwd(), MIG_PATH), "utf8");
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
      WHERE slug LIKE 'stb_modul_%' AND version = $1
      ORDER BY slug`,
    [VERSION],
  );
  return r.rows;
}

// Frage ohne die 5 Flag-Felder -> Content-Fingerprint (Reihenfolge-stabil via JSON).
function contentFingerprint(rows: Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const blocks = z.array(TemplateBlockSchema).parse(row.blocks);
    const stripped = blocks.map((b) => ({
      key: b.key,
      required: b.required,
      order: b.order,
      questions: b.questions.map((q) => ({
        id: q.id,
        frage_id: q.frage_id,
        text: q.text,
        ebene: q.ebene,
        unterbereich: q.unterbereich,
        position: q.position,
      })),
    }));
    out[row.slug] = JSON.stringify({
      name: row.name,
      description: row.description,
      metadata: row.metadata,
      blocks: stripped,
    });
  }
  return out;
}

describe("MIG-129: StB-Scoring-Flag-Seed (V10.1 SLC-177, AC-177-3/4)", () => {
  it("setzt die Flags exakt wie die Founder-approvte Flag-Map (AC-177-4)", async () => {
    await withTestDb(async (client) => {
      const flagmap = loadFlagMap();
      await applyMig129(client);
      const rows = await loadAll(client);
      expect(rows).toHaveLength(17);

      let totalTrueFields = 0;
      for (const row of rows) {
        const blocks = z.array(TemplateBlockSchema).parse(row.blocks);
        const want = flagmap[row.slug] ?? {};
        for (const b of blocks) {
          for (const q of b.questions) {
            const wantQ = want[q.frage_id] ?? {};
            for (const fk of FLAG_KEYS) {
              const expected = wantQ[fk] === true;
              expect(
                (q as Record<string, unknown>)[fk],
                `${row.slug}/${q.frage_id}/${fk}`,
              ).toBe(expected);
              if (expected) totalTrueFields++;
            }
          }
        }
      }
      // Gegen den Generator-Report (233 geflaggte Fragen / 305 true-Flag-Felder).
      expect(totalTrueFields).toBe(305);
    });
  });

  it("aendert NUR die Flags — restlicher Content byte-identisch (AC-177-3)", async () => {
    await withTestDb(async (client) => {
      const before = contentFingerprint(await loadAll(client));
      await applyMig129(client);
      const after = contentFingerprint(await loadAll(client));
      expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
      for (const slug of Object.keys(before)) {
        expect(after[slug], `Content-Drift in ${slug}`).toBe(before[slug]);
      }
    });
  });

  it("jede Row bleibt durch das App-Zod-Gate (TemplateBlockSchema) valide", async () => {
    await withTestDb(async (client) => {
      await applyMig129(client);
      const rows = await loadAll(client);
      for (const row of rows) {
        const blocks = z.array(TemplateBlockSchema).parse(row.blocks);
        expect(blocks).toHaveLength(2);
        expect(blocks[0].questions.length + blocks[1].questions.length).toBeGreaterThan(0);
      }
    });
  });

  it("idempotent — 2. Apply liefert identische Flags (AC-177-4)", async () => {
    await withTestDb(async (client) => {
      await applyMig129(client);
      const once = contentFingerprintWithFlags(await loadAll(client));
      await applyMig129(client);
      const twice = contentFingerprintWithFlags(await loadAll(client));
      expect(twice).toEqual(once);
    });
  });
});

// Fingerprint INKL. Flags — fuer den Idempotenz-Vergleich.
function contentFingerprintWithFlags(rows: Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const blocks = z.array(TemplateBlockSchema).parse(row.blocks);
    out[row.slug] = JSON.stringify(
      blocks.map((b) =>
        b.questions.map((q) => ({
          frage_id: q.frage_id,
          owner_dependency: q.owner_dependency,
          deal_blocker: q.deal_blocker,
          sop_trigger: q.sop_trigger,
          ko_hart: q.ko_hart,
          ko_soft: q.ko_soft,
        })),
      ),
    );
  }
  return out;
}
