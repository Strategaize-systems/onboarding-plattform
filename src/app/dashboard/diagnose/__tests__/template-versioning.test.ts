// V6.4 SLC-130 MT-3 — Vitest fuer echte Template-Versionierung.
//
// Drei Tests gegen Coolify-DB (Migration 096 LIVE):
//   1. Cross-Version-Read funktioniert — Insert 2 Templates (slug, v1) + (slug, v2),
//      Lookup "newest version pro slug" gibt v2, Direkt-Lookup auf v1-ID gibt v1.
//   2. UNIQUE(slug, version) enforced — Doppel-Insert gleicher (slug, version)
//      wirft unique_violation. SAVEPOINT-Pattern fuer Tx-Rollback nach erwartetem
//      Fehler (sonst "current transaction is aborted").
//   3. Alter UNIQUE(slug)-Constraint weg — Insert (slug='foo', v1) + (slug='foo', v2)
//      klappt nun (waere mit altem template_slug_key-Constraint nicht moeglich).
//
// Tests laufen via withTestDb (BEGIN/ROLLBACK), nutzen unique Slug-Prefixe pro Test
// damit parallele Runs nicht kollidieren.
//
// Ref: BL-105, SLC-130, .claude/rules/coolify-test-setup.md (SAVEPOINT-Pattern).

import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";

describe("V6.4 Template-Versionierung — UNIQUE(slug, version)", () => {
  it("Test 1: Cross-Version-Read — ORDER BY created_at DESC LIMIT 1 gibt neueste Version", async () => {
    await withTestDb(async (client) => {
      const slug = "slc130_t1_cross_read";

      // Hinweis: `template.created_at` Default ist `now()`, was in PostgreSQL
      // die Transaction-Start-Zeit ist und innerhalb einer Tx konstant bleibt.
      // withTestDb wickelt alle Statements in EINE Tx (BEGIN/ROLLBACK), daher
      // wuerden v1 und v2 identische created_at-Werte bekommen — ORDER BY
      // waere nicht-deterministisch. Loesung: clock_timestamp() (pro Aufruf
      // ausgewertet) explizit setzen.
      const v1Insert = await client.query<{ id: string; version: string }>(
        `INSERT INTO public.template (slug, version, name, blocks, created_at)
         VALUES ($1, 'v1', 'SLC-130 Test 1 V1', '[]'::jsonb, clock_timestamp())
         RETURNING id, version`,
        [slug],
      );

      const v2Insert = await client.query<{ id: string; version: string }>(
        `INSERT INTO public.template (slug, version, name, blocks, created_at)
         VALUES ($1, 'v2', 'SLC-130 Test 1 V2', '[]'::jsonb, clock_timestamp() + INTERVAL '10 milliseconds')
         RETURNING id, version`,
        [slug],
      );

      // Lookup "newest version pro slug" — Pattern aus actions.ts + start/page.tsx
      // nach SLC-130 MT-2.
      const newest = await client.query<{ id: string; version: string }>(
        `SELECT id, version FROM public.template
         WHERE slug = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [slug],
      );
      expect(newest.rowCount).toBe(1);
      expect(newest.rows[0].version).toBe("v2");
      expect(newest.rows[0].id).toBe(v2Insert.rows[0].id);

      // Direkt-Lookup auf v1-ID — Pattern aus bericht/page.tsx (session.template_id).
      const v1Direct = await client.query<{ id: string; version: string }>(
        `SELECT id, version FROM public.template WHERE id = $1`,
        [v1Insert.rows[0].id],
      );
      expect(v1Direct.rowCount).toBe(1);
      expect(v1Direct.rows[0].version).toBe("v1");
    });
  });

  it("Test 2: UNIQUE(slug, version) enforced — Doppel-Insert wirft unique_violation", async () => {
    await withTestDb(async (client) => {
      const slug = "slc130_t2_unique_violation";

      // Erster Insert klappt.
      await client.query(
        `INSERT INTO public.template (slug, version, name, blocks)
         VALUES ($1, 'v1', 'SLC-130 Test 2 V1', '[]'::jsonb)`,
        [slug],
      );

      // Zweiter Insert mit gleicher (slug, version) muss fehlschlagen.
      // SAVEPOINT-Pattern: erwarteter Fehler bricht sonst die ganze Tx ab,
      // anschliessendes ROLLBACK in withTestDb wuerde "current transaction is aborted"
      // werfen. Mit SAVEPOINT koennen wir selektiv rollback machen und Tx weiter nutzen.
      let pgErrorCode: string | null = null;
      await client.query("SAVEPOINT before_dup_insert");
      try {
        await client.query(
          `INSERT INTO public.template (slug, version, name, blocks)
           VALUES ($1, 'v1', 'SLC-130 Test 2 V1 DUP', '[]'::jsonb)`,
          [slug],
        );
      } catch (e) {
        // pg-Library-Error hat .code Property mit Postgres-SQLSTATE.
        pgErrorCode = (e as { code?: string }).code ?? null;
      }
      await client.query("ROLLBACK TO SAVEPOINT before_dup_insert");

      // Postgres SQLSTATE 23505 = unique_violation.
      expect(pgErrorCode).toBe("23505");

      // Tx ist nach ROLLBACK TO SAVEPOINT weiter usable — Verify-Query klappt.
      const verify = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public.template
         WHERE slug = $1`,
        [slug],
      );
      expect(verify.rows[0].count).toBe("1");
    });
  });

  it("Test 3: Alter UNIQUE(slug)-Constraint weg — 2 Versions selber Slug klappen", async () => {
    await withTestDb(async (client) => {
      const slug = "slc130_t3_two_versions_same_slug";

      // Migration 096 hat template_slug_key gedroppt. Damit darf ein zweiter Insert
      // mit gleichem Slug aber anderer Version durchgehen — vor MIG-040 nicht moeglich.
      await client.query(
        `INSERT INTO public.template (slug, version, name, blocks)
         VALUES ($1, 'v1', 'SLC-130 Test 3 V1', '[]'::jsonb)`,
        [slug],
      );
      await client.query(
        `INSERT INTO public.template (slug, version, name, blocks)
         VALUES ($1, 'v2', 'SLC-130 Test 3 V2', '[]'::jsonb)`,
        [slug],
      );

      // Beide Rows existieren.
      const all = await client.query<{ slug: string; version: string }>(
        `SELECT slug, version FROM public.template
         WHERE slug = $1 ORDER BY version`,
        [slug],
      );
      expect(all.rowCount).toBe(2);
      expect(all.rows[0].version).toBe("v1");
      expect(all.rows[1].version).toBe("v2");

      // Zusatz-Check: pg_constraint zeigt keinen template_slug_key mehr.
      const constraintCheck = await client.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'public.template'::regclass
           AND contype = 'u'
           AND conname = 'template_slug_key'`,
      );
      expect(constraintCheck.rowCount).toBe(0);

      // Zusatz-Check: neuer template_slug_version_unique Index existiert.
      const indexCheck = await client.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'template'
           AND indexname = 'template_slug_version_unique'`,
      );
      expect(indexCheck.rowCount).toBe(1);
    });
  });
});
