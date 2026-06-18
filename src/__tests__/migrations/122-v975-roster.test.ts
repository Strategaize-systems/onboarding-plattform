// V9.75 SLC-V9.75-C MT-1 — Migration 122 (employee_roster_draft).
//
// Verifiziert Schema, Tenant-RLS und weiche Dedup gegen die Coolify-DB im selben
// Docker-Netzwerk (siehe .claude/rules/coolify-test-setup.md). Test-Strategie wie
// 121-Test: jede Assertion in eigener withTestDb-Transaction (Auto-ROLLBACK), die
// Migration wird PRO Transaction frisch angewendet, Outer BEGIN/COMMIT gestrippt.
//
// Deckt:
//   AC-C-1 — Schema (Name+Funktion ohne E-Mail, session-/tenant-scoped, block_key-Tag).
//   AC-C-3 — Tenant-RLS (kein Cross-Tenant Read/Write, SAVEPOINT-Pen-Test).
//   AC-C-4 — weiche Dedup (UNIQUE-Index greift, ON CONFLICT DO NOTHING).
//
// Unabhaengig von Migration 121 (referenziert keine tier-Spalte) — die Session
// wird ohne tier geseedet, damit der Test auch vor dem 121-Live-Apply laeuft.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../sql/migrations/122_v975_employee_roster_draft.sql",
);

function loadMigrationSql(): string {
  const raw = readFileSync(MIGRATION_PATH, "utf-8");
  return raw
    .replace(/^\s*BEGIN\s*;\s*$/m, "")
    .replace(/^\s*COMMIT\s*;\s*$/m, "");
}

async function applyMigration122(client: Client): Promise<void> {
  await client.query(loadMigrationSql());
}

/**
 * Seedet tenant + tenant_admin-User + capture_session (OHNE tier — 122 ist
 * 121-unabhaengig). Laeuft als postgres (Superuser). Gibt Ids zurueck.
 */
async function seedTenantSession(
  client: Client,
  label: string,
): Promise<{ tenantId: string; userId: string; sessionId: string }> {
  const tenantRes = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name) VALUES ($1) RETURNING id`,
    ["V975C-roster-" + label],
  );
  const tenantId = tenantRes.rows[0]!.id;

  const userRes = await client.query<{ id: string }>(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     )
     VALUES (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated',
       'v975c-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
       '{}'::jsonb,
       jsonb_build_object('tenant_id', $1::text, 'role', 'tenant_admin'),
       now(), now()
     )
     RETURNING id`,
    [tenantId],
  );
  const userId = userRes.rows[0]!.id;

  const sessionRes = await client.query<{ id: string }>(
    `INSERT INTO public.capture_session (
       tenant_id, template_id, template_version, owner_user_id,
       status, answers, released_for_strategaize_review, metadata
     )
     SELECT $1::uuid, t.id, t.version, $2::uuid,
            'open', '{}'::jsonb, false, '{}'::jsonb
       FROM public.template t LIMIT 1
     RETURNING id`,
    [tenantId, userId],
  );
  return { tenantId, userId, sessionId: sessionRes.rows[0]!.id };
}

async function insertRoster(
  client: Client,
  tenantId: string,
  sessionId: string,
  userId: string,
  name: string,
  roleHint: string | null,
  blockKey: string | null = null,
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO public.employee_roster_draft
       (tenant_id, capture_session_id, name, role_hint, block_key, created_by)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid)
     RETURNING id`,
    [tenantId, sessionId, name, roleHint, blockKey, userId],
  );
  return r.rows[0]!.id;
}

// ============================================================================
// AC-C-1 — Schema
// ============================================================================

describe("Migration 122 — Schema (employee_roster_draft)", () => {
  it("Tabelle existiert mit name NOT NULL, role_hint/block_key/promoted_invitation_id nullable", async () => {
    await withTestDb(async (client) => {
      await applyMigration122(client);

      const cols = await client.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema='public' AND table_name='employee_roster_draft'`,
      );
      const byName = Object.fromEntries(cols.rows.map((c) => [c.column_name, c.is_nullable]));

      // erwartete Spalten vorhanden
      for (const c of [
        "id", "tenant_id", "capture_session_id", "name", "role_hint",
        "block_key", "promoted_invitation_id", "created_by", "created_at", "updated_at",
      ]) {
        expect(byName, `Spalte ${c}`).toHaveProperty(c);
      }

      expect(byName.name).toBe("NO");                    // Name Pflicht
      expect(byName.role_hint).toBe("YES");              // Funktion optional
      expect(byName.block_key).toBe("YES");              // Block-Tag optional
      expect(byName.promoted_invitation_id).toBe("YES"); // erst nach Promote gesetzt
    });
  });

  it("promoted_invitation_id FK -> employee_invitation ON DELETE SET NULL", async () => {
    await withTestDb(async (client) => {
      await applyMigration122(client);
      const fk = await client.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conrelid='public.employee_roster_draft'::regclass
            AND contype='f'
            AND confrelid='public.employee_invitation'::regclass`,
      );
      expect(fk.rowCount).toBe(1);
      expect(fk.rows[0]!.def).toMatch(/SET NULL/i);
    });
  });
});

// ============================================================================
// AC-C-4 — Weiche Dedup (UNIQUE-Index, ON CONFLICT DO NOTHING)
// ============================================================================

describe("Migration 122 — weiche Dedup", () => {
  it("UNIQUE(capture_session_id, lower(name), lower(coalesce(role_hint,''))) greift; ON CONFLICT DO NOTHING", async () => {
    await withTestDb(async (client) => {
      await applyMigration122(client);
      const { tenantId, userId, sessionId } = await seedTenantSession(client, "dedup");

      await insertRoster(client, tenantId, sessionId, userId, "Anna Beispiel", "Buchhaltung");

      // gleicher Name (andere Schreibweise) + gleiche Funktion -> ON CONFLICT DO NOTHING
      await client.query(
        `INSERT INTO public.employee_roster_draft
           (tenant_id, capture_session_id, name, role_hint, created_by)
         VALUES ($1::uuid, $2::uuid, 'anna beispiel', 'BUCHHALTUNG', $3::uuid)
         ON CONFLICT (capture_session_id, lower(name), lower(coalesce(role_hint, '')))
         DO NOTHING`,
        [tenantId, sessionId, userId],
      );

      const cnt = await client.query<{ n: string }>(
        `SELECT count(*) n FROM public.employee_roster_draft WHERE capture_session_id=$1`,
        [sessionId],
      );
      expect(Number(cnt.rows[0]!.n)).toBe(1);
    });
  });

  it("unterschiedliche Funktion -> zweite Zeile erlaubt (Dedup ist Name+Funktion)", async () => {
    await withTestDb(async (client) => {
      await applyMigration122(client);
      const { tenantId, userId, sessionId } = await seedTenantSession(client, "dedup2");

      await insertRoster(client, tenantId, sessionId, userId, "Max Muster", "Vertrieb");
      await insertRoster(client, tenantId, sessionId, userId, "Max Muster", "Einkauf");

      const cnt = await client.query<{ n: string }>(
        `SELECT count(*) n FROM public.employee_roster_draft WHERE capture_session_id=$1`,
        [sessionId],
      );
      expect(Number(cnt.rows[0]!.n)).toBe(2);
    });
  });
});

// ============================================================================
// AC-C-3 — Tenant-RLS (kein Cross-Tenant Read/Write)
// ============================================================================

describe("Migration 122 — Tenant-RLS", () => {
  it("tenant_admin liest/schreibt eigene Roster-Zeilen", async () => {
    await withTestDb(async (client) => {
      await applyMigration122(client);
      const { tenantId, userId, sessionId } = await seedTenantSession(client, "rls-own");

      await withJwtContext(client, userId, async () => {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO public.employee_roster_draft
             (tenant_id, capture_session_id, name, role_hint, created_by)
           VALUES ($1::uuid, $2::uuid, 'Eigen Mitarbeiter', 'IT', $3::uuid)
           RETURNING id`,
          [tenantId, sessionId, userId],
        );
        expect(ins.rowCount).toBe(1);

        const read = await client.query(
          `SELECT 1 FROM public.employee_roster_draft WHERE capture_session_id=$1`,
          [sessionId],
        );
        expect(read.rowCount).toBe(1);
      });
    });
  });

  it("tenant_admin von Tenant B sieht Roster von Tenant A NICHT und darf dort NICHT schreiben", async () => {
    await withTestDb(async (client) => {
      await applyMigration122(client);
      const a = await seedTenantSession(client, "rls-A");
      const b = await seedTenantSession(client, "rls-B");

      // Roster fuer Tenant A als postgres anlegen
      await insertRoster(client, a.tenantId, a.sessionId, a.userId, "A Mitarbeiter", "Lager");

      await withJwtContext(client, b.userId, async () => {
        // Read: Tenant B sieht A-Zeilen nicht
        const read = await client.query(
          `SELECT 1 FROM public.employee_roster_draft WHERE capture_session_id=$1`,
          [a.sessionId],
        );
        expect(read.rowCount).toBe(0);

        // Write: INSERT mit fremder tenant_id -> RLS WITH CHECK lehnt ab
        let errMessage: string | null = null;
        await client.query("SAVEPOINT try_x");
        try {
          await client.query(
            `INSERT INTO public.employee_roster_draft
               (tenant_id, capture_session_id, name, created_by)
             VALUES ($1::uuid, $2::uuid, 'X-Tenant Inject', $3::uuid)`,
            [a.tenantId, a.sessionId, b.userId],
          );
        } catch (e) {
          errMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT try_x");
        expect(errMessage).toMatch(/row-level security/i);
      });

      // Zeile von A unveraendert (genau 1)
      const cnt = await client.query<{ n: string }>(
        `SELECT count(*) n FROM public.employee_roster_draft WHERE capture_session_id=$1`,
        [a.sessionId],
      );
      expect(Number(cnt.rows[0]!.n)).toBe(1);
    });
  });
});
