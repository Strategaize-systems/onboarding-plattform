// SLC-148 MT-2 — Migration 102 (V8 Mandanten-Report-Teaser Template).
//
// Verifiziert die Schema- und RLS-Effekte der Migration gegen die Coolify-DB
// im selben Docker-Netzwerk (siehe rules/coolify-test-setup.md).
//
// Test-Strategie:
//   - Jeder Test laeuft in einer eigenen withTestDb-Transaction (Auto-ROLLBACK).
//   - Die Migration wird PRO Transaction frisch angewendet, damit sie isoliert
//     getestet werden kann (auch bevor MT-3 LIVE-Apply auf der Coolify-DB lief).
//   - Outer BEGIN/COMMIT der Migration werden gestrippt, weil withTestDb bereits
//     eine Transaction haelt.
//   - RLS-Tests verwenden seedV4Fixtures + withJwtContext aus dem bestehenden
//     V4-RLS-Test-Pattern (SLC-037/041).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedV4Fixtures } from "@/__tests__/rls/v4-fixtures";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../sql/migrations/102_v8_exit_readiness_teaser_template.sql"
);

/**
 * Liest die Migration und strippt die outer BEGIN;/COMMIT;-Statements,
 * weil withTestDb bereits eine Transaction haelt.
 */
function loadMigrationSql(): string {
  const raw = readFileSync(MIGRATION_PATH, "utf-8");
  return raw
    .replace(/^\s*BEGIN\s*;/m, "")
    .replace(/^\s*COMMIT\s*;/m, "");
}

async function applyMigration102(client: Client): Promise<void> {
  const sql = loadMigrationSql();
  await client.query(sql);
}

// ================================================================
// Schema-Tests
// ================================================================

describe("Migration 102 — Schema + Template-Seed", () => {
  it("apply 1x: template row exists with slug + version=1 + metadata keys", async () => {
    await withTestDb(async (client) => {
      await applyMigration102(client);
      const res = await client.query<{
        slug: string;
        version: string;
        usage_kind: string;
        scoring_kind: string;
        report_renderer: string;
      }>(
        `SELECT slug, version,
                metadata->>'usage_kind' AS usage_kind,
                metadata->>'scoring_kind' AS scoring_kind,
                metadata->>'report_renderer' AS report_renderer
           FROM public.template
          WHERE slug = 'exit-readiness-teaser-v1'`
      );
      expect(res.rowCount).toBe(1);
      expect(res.rows[0].slug).toBe("exit-readiness-teaser-v1");
      expect(res.rows[0].version).toBe("1");
      expect(res.rows[0].usage_kind).toBe("mandanten_report_teaser_v1");
      expect(res.rows[0].scoring_kind).toBe("sui_weighted");
      expect(res.rows[0].report_renderer).toBe("mandanten_report_v2");
    });
  });

  it("apply 2x: idempotent — keine Fehler, weiterhin 1 Row", async () => {
    await withTestDb(async (client) => {
      await applyMigration102(client);
      await applyMigration102(client);
      const res = await client.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM public.template
          WHERE slug = 'exit-readiness-teaser-v1'`
      );
      expect(res.rows[0].c).toBe("1");
    });
  });

  it("blocks JSONB enthaelt exakt 11 Module mit korrekten modul_ids", async () => {
    await withTestDb(async (client) => {
      await applyMigration102(client);
      const res = await client.query<{
        module_count: number;
        modul_ids: string[];
      }>(
        `SELECT jsonb_array_length(blocks) AS module_count,
                ARRAY(SELECT m->>'modul_id' FROM jsonb_array_elements(blocks) m) AS modul_ids
           FROM public.template
          WHERE slug = 'exit-readiness-teaser-v1'`
      );
      expect(res.rows[0].module_count).toBe(11);
      expect(res.rows[0].modul_ids).toEqual([
        "M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10",
      ]);
    });
  });

  it("blocks JSONB enthaelt 53 Fragen (5 Hygiene + 43 Skala + 5 Reflexion)", async () => {
    await withTestDb(async (client) => {
      await applyMigration102(client);
      const res = await client.query<{
        total: number;
        hygiene: number;
        skala: number;
        reflexion: number;
      }>(
        `WITH q AS (
           SELECT m->>'modul_id'           AS modul_id,
                  m->>'answer_schema_kind' AS kind,
                  jsonb_array_length(m->'questions') AS qcount
             FROM public.template,
                  jsonb_array_elements(blocks) m
            WHERE slug = 'exit-readiness-teaser-v1'
         )
         SELECT sum(qcount)::int                                                AS total,
                sum(qcount) FILTER (WHERE kind = 'hygiene_yes_partial_no')::int  AS hygiene,
                sum(qcount) FILTER (WHERE kind = 'reife_skala_5')::int           AS skala,
                sum(qcount) FILTER (WHERE kind = 'reflexion_freitext')::int      AS reflexion
           FROM q`
      );
      expect(res.rows[0].total).toBe(53);
      expect(res.rows[0].hygiene).toBe(5);
      expect(res.rows[0].skala).toBe(43);
      expect(res.rows[0].reflexion).toBe(5);
    });
  });

  it("jeder Skala-Block hat score_mapping {1:0,2:2,3:5,4:8,5:10}", async () => {
    await withTestDb(async (client) => {
      await applyMigration102(client);
      const res = await client.query<{
        modul_id: string;
        score_mapping: Record<string, number>;
      }>(
        `SELECT m->>'modul_id'        AS modul_id,
                (m->'score_mapping')  AS score_mapping
           FROM public.template,
                jsonb_array_elements(blocks) m
          WHERE slug = 'exit-readiness-teaser-v1'
            AND m->>'answer_schema_kind' = 'reife_skala_5'`
      );
      expect(res.rows).toHaveLength(9);
      for (const row of res.rows) {
        expect(row.score_mapping).toEqual({ "1": 0, "2": 2, "3": 5, "4": 8, "5": 10 });
      }
    });
  });

  it("Frage-IDs sind kanonisch (M0.1..M0.5, F1.1..F9.5 inkl. KI, R10.1.1..R10.2.2)", async () => {
    await withTestDb(async (client) => {
      await applyMigration102(client);
      const res = await client.query<{ frage_ids: string[] }>(
        `SELECT ARRAY(
            SELECT q->>'frage_id'
              FROM public.template,
                   jsonb_array_elements(blocks) m,
                   jsonb_array_elements(m->'questions') q
             WHERE slug = 'exit-readiness-teaser-v1'
         ) AS frage_ids`
      );
      const ids = res.rows[0].frage_ids;
      // Hygiene
      expect(ids).toContain("M0.1");
      expect(ids).toContain("M0.5");
      // KI-Erweiterungen (per User-Direktive 2026-05-29)
      expect(ids).toContain("F4.4");
      expect(ids).toContain("F6.5");
      expect(ids).toContain("F6.6");
      expect(ids).toContain("F8.7");
      expect(ids).toContain("F9.4");
      expect(ids).toContain("F9.5");
      // Reflexion
      expect(ids).toContain("R10.1.1");
      expect(ids).toContain("R10.2.2");
    });
  });

  it("metadata enthaelt stufen_lookup, worum_es_geht, hausaufgaben_lookup, gewichtung", async () => {
    await withTestDb(async (client) => {
      await applyMigration102(client);
      const res = await client.query<{
        has_stufen: boolean;
        has_worum: boolean;
        has_hausaufgaben: boolean;
        has_gewichtung: boolean;
        gewichtung_m9: number;
      }>(
        `SELECT (metadata ? 'stufen_lookup')        AS has_stufen,
                (metadata ? 'worum_es_geht')        AS has_worum,
                (metadata ? 'hausaufgaben_lookup')  AS has_hausaufgaben,
                (metadata ? 'gewichtung')           AS has_gewichtung,
                (metadata->'gewichtung'->>'m9')::int AS gewichtung_m9
           FROM public.template
          WHERE slug = 'exit-readiness-teaser-v1'`
      );
      expect(res.rows[0].has_stufen).toBe(true);
      expect(res.rows[0].has_worum).toBe(true);
      expect(res.rows[0].has_hausaufgaben).toBe(true);
      expect(res.rows[0].has_gewichtung).toBe(true);
      expect(res.rows[0].gewichtung_m9).toBe(20);
    });
  });

  it("capture_session hat released_for_strategaize_review + Timestamp-Spalte", async () => {
    await withTestDb(async (client) => {
      await applyMigration102(client);
      const res = await client.query<{
        column_name: string;
        data_type: string;
        column_default: string | null;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, column_default, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'capture_session'
            AND column_name IN ('released_for_strategaize_review',
                                'released_for_strategaize_review_at')
          ORDER BY column_name`
      );
      expect(res.rowCount).toBe(2);
      const flag = res.rows.find((r) => r.column_name === "released_for_strategaize_review");
      const ts = res.rows.find((r) => r.column_name === "released_for_strategaize_review_at");
      expect(flag?.data_type).toBe("boolean");
      expect(flag?.is_nullable).toBe("NO");
      expect(flag?.column_default).toMatch(/false/);
      expect(ts?.data_type).toBe("timestamp with time zone");
      expect(ts?.is_nullable).toBe("YES");
    });
  });

  it("RESTRICTIVE Policy capture_session_strategaize_admin_snapshot_gated existiert", async () => {
    await withTestDb(async (client) => {
      await applyMigration102(client);
      const res = await client.query<{
        polname: string;
        is_restrictive: boolean;
        cmd: string;
      }>(
        `SELECT polname,
                NOT polpermissive AS is_restrictive,
                CASE polcmd WHEN 'r' THEN 'SELECT' ELSE polcmd::text END AS cmd
           FROM pg_policy
          WHERE polname = 'capture_session_strategaize_admin_snapshot_gated'`
      );
      expect(res.rowCount).toBe(1);
      expect(res.rows[0].is_restrictive).toBe(true);
      expect(res.rows[0].cmd).toBe("SELECT");
    });
  });

  it("Backfill: existing non-V8-Sessions bekommen released=true", async () => {
    await withTestDb(async (client) => {
      // Pre-Setup: erstelle eine pre-existing non-V8 capture_session BEVOR Migration laeuft
      const fixtures = await seedV4Fixtures(client);
      // sessionEmployeeA referenziert ein V4-Template, NICHT exit-readiness-teaser-v1.
      // Vor Migration: Spalte existiert noch nicht — Migration legt sie an mit DEFAULT false.
      // Backfill innerhalb der Migration soll diesen Row auf released=true setzen.
      await applyMigration102(client);
      const res = await client.query<{
        released: boolean;
      }>(
        `SELECT released_for_strategaize_review AS released
           FROM public.capture_session WHERE id = $1`,
        [fixtures.sessionEmployeeA]
      );
      expect(res.rows[0].released).toBe(true);
    });
  });
});

// ================================================================
// RLS-Tests — capture_session_strategaize_admin_snapshot_gated
// ================================================================
//
// Annahme: V4-Fixtures verwenden ein non-V8-Template. Damit der RLS-Effekt
// auf strategaize_admin sichtbar wird, simulieren wir explizit eine V8-Session,
// indem wir das Fixture-Session-Row auf released=false setzen + sicherstellen,
// dass das Template-Slug nicht 'exit-readiness-teaser-v1' ist (Backfill greift
// nicht weiter), bzw. den Flag explizit toggeln.

describe("RLS capture_session — strategaize_admin Snapshot-Gate (RESTRICTIVE)", () => {
  it("strategaize_admin SIEHT Session wenn released_for_strategaize_review=true", async () => {
    await withTestDb(async (client) => {
      const fixtures = await seedV4Fixtures(client);
      await applyMigration102(client);
      // Fixture-Session: Backfill setzte released=true (siehe Schema-Test oben).
      await withJwtContext(client, fixtures.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c
             FROM public.capture_session WHERE id = $1`,
          [fixtures.sessionEmployeeA]
        );
        expect(res.rows[0].c).toBe("1");
      });
    });
  });

  it("strategaize_admin SIEHT Session NICHT wenn released_for_strategaize_review=false", async () => {
    await withTestDb(async (client) => {
      const fixtures = await seedV4Fixtures(client);
      await applyMigration102(client);
      // Backfill setzte released=true. Wir simulieren eine V8-Session indem wir
      // den Flag explizit auf false zuruecksetzen (als postgres-Superuser).
      await client.query(
        `UPDATE public.capture_session
            SET released_for_strategaize_review = false
          WHERE id = $1`,
        [fixtures.sessionEmployeeA]
      );
      await withJwtContext(client, fixtures.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c
             FROM public.capture_session WHERE id = $1`,
          [fixtures.sessionEmployeeA]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_admin SIEHT eigene Session ungeachtet des Flags (RESTRICTIVE nicht relevant)", async () => {
    await withTestDb(async (client) => {
      const fixtures = await seedV4Fixtures(client);
      await applyMigration102(client);
      // Flag auf false setzen — soll keinen Effekt fuer tenant_admin haben
      await client.query(
        `UPDATE public.capture_session
            SET released_for_strategaize_review = false
          WHERE id = $1`,
        [fixtures.sessionEmployeeA]
      );
      await withJwtContext(client, fixtures.tenantAdminAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c
             FROM public.capture_session WHERE id = $1`,
          [fixtures.sessionEmployeeA]
        );
        expect(res.rows[0].c).toBe("1");
      });
    });
  });

  it("employee SIEHT eigene Session ungeachtet des Flags", async () => {
    await withTestDb(async (client) => {
      const fixtures = await seedV4Fixtures(client);
      await applyMigration102(client);
      await client.query(
        `UPDATE public.capture_session
            SET released_for_strategaize_review = false
          WHERE id = $1`,
        [fixtures.sessionEmployeeA]
      );
      await withJwtContext(client, fixtures.employeeAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c
             FROM public.capture_session WHERE id = $1`,
          [fixtures.sessionEmployeeA]
        );
        expect(res.rows[0].c).toBe("1");
      });
    });
  });
});
