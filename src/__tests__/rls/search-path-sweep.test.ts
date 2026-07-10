// V20 SLC-193 MT-4 — Coolify-DB-Sidecar-Test: SECURITY-DEFINER search_path-Sweep
// (MIG-134, DEC-283 / SEC-001). Nach dem Sweep hat keine public-DEFINER-Funktion mehr
// ein fehlendes search_path (Rest-Count-0-Gate). Extension-owned Funktionen ausgenommen.
//
// withTestDb haelt eine Tx (Auto-ROLLBACK); MIG-134 wird pro Tx angewendet — laeuft gegen
// die Live-DB (die 12 ungehaerteten rpc_-Funktionen existieren dort), fixt sie in der Tx,
// rollt zurueck. So auch vor dem Live-Apply (/deploy) gruen.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";

const MIG134_PATH = resolve(
  __dirname,
  "../../../sql/migrations/134_v20_search_path_sweep.sql",
);

async function applyMig134(client: Client): Promise<void> {
  const sql = readFileSync(MIG134_PATH, "utf-8")
    .replace(/^\s*BEGIN\s*;\s*$/m, "")
    .replace(/^\s*COMMIT\s*;\s*$/m, "");
  await client.query(sql);
}

const REST_COUNT_SQL = `
  SELECT count(*)::int AS n
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
    )`;

describe("MIG-134 search_path-Sweep (DEC-283 / SEC-001)", () => {
  it("nach Apply: 0 public-DEFINER-Funktionen ohne search_path (Rest-Count-0)", async () => {
    await withTestDb(async (client) => {
      await applyMig134(client);
      const r = await client.query<{ n: number }>(REST_COUNT_SQL);
      expect(r.rows[0]!.n).toBe(0);
    });
  });

  it("idempotent: 2x Apply, weiterhin Rest-Count 0, kein Fehler", async () => {
    await withTestDb(async (client) => {
      await applyMig134(client);
      await applyMig134(client);
      const r = await client.query<{ n: number }>(REST_COUNT_SQL);
      expect(r.rows[0]!.n).toBe(0);
    });
  });

  it("eine zuvor ungehaertete Funktion (rpc_answer_gap_question) hat danach search_path", async () => {
    await withTestDb(async (client) => {
      await applyMig134(client);
      const r = await client.query<{ cfg: string[] | null }>(
        `SELECT p.proconfig AS cfg
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='public' AND p.proname='rpc_answer_gap_question'`,
      );
      const cfg = (r.rows[0]?.cfg ?? []).join(",");
      expect(cfg).toContain("search_path=");
    });
  });
});
