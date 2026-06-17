// V9.75 SLC-V9.75-A MT-5 — Tier-Bypass-Matrix + ISSUE-097-Closure (Security).
//
// Beweist die SERVER-SIDE-Durchsetzung des Stufen-Gates pro gated Pfad gegen die
// Coolify-DB im selben Docker-Netzwerk (coolify-test-setup.md), nicht nur das
// Fehlen eines Nav-Links. Deckt:
//   - AC-A-2: Dispatch-RPC direkter Call auf zu-niedriger Session -> tier_gate_denied.
//   - AC-A-4: fn_session_tier_allows == false fuer ALLE gated job_types unter Stufe
//     (die EINE Wahrheit, an die TS-Dispatch-Guard UND Worker-Payload-Resolve delegieren).
//   - AC-A-3: direkter ai_jobs-INSERT (Dispatch umgangen) -> Worker fail-closed
//     (NULL-Stempel -> fn_tier_allows=false); GEFORGTER Stempel wird zwangs-genullt.
//   - AC-A-5: PATCH capture_session.tier durch authenticated -> Trigger-Block.
//   - V9.1-Regression-Guard: session-loser Forward-Bucket-Bulk-Run bleibt moeglich.
//
// Test-Strategie wie 121-Migration-Test: pro Test eine eigene withTestDb-Tx
// (Auto-ROLLBACK), Migration 121 frisch angewendet, erwartete Rejections via
// SAVEPOINT (sonst Tx-Abort). Die TS-Worker-Entscheidung selbst (Carve-out +
// fail-closed) ist hermetisch in src/workers/condensation/__tests__/claim-loop.test.ts
// verifiziert; hier werden die DB-Enforcement-Primitive nachgewiesen.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../sql/migrations/121_v975_tier_gating_foundation.sql",
);

function loadMigrationSql(): string {
  return readFileSync(MIGRATION_PATH, "utf-8")
    .replace(/^\s*BEGIN\s*;\s*$/m, "")
    .replace(/^\s*COMMIT\s*;\s*$/m, "");
}

async function applyMigration121(client: Client): Promise<void> {
  await client.query(loadMigrationSql());
}

/** Seedet tenant + tenant_admin-User + capture_session mit explizitem tier. */
async function seedSession(
  client: Client,
  tier: "free" | "blueprint" | "handbook",
): Promise<{ tenantId: string; userId: string; sessionId: string }> {
  const tenantRes = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name) VALUES ($1) RETURNING id`,
    ["V975-bypass-" + tier],
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
       'v975b-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
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
       status, answers, released_for_strategaize_review, metadata, tier
     )
     SELECT $1::uuid, t.id, t.version, $2::uuid,
            'open', '{}'::jsonb, false, '{}'::jsonb, $3
       FROM public.template t LIMIT 1
     RETURNING id`,
    [tenantId, userId, tier],
  );
  return { tenantId, userId, sessionId: sessionRes.rows[0]!.id };
}

async function seedCheckpoint(
  client: Client,
  tenantId: string,
  sessionId: string,
  userId: string,
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO public.block_checkpoint (
       tenant_id, capture_session_id, block_key,
       checkpoint_type, content, content_hash, created_by
     )
     VALUES ($1::uuid, $2::uuid, 'block_1', 'questionnaire_submit',
             '{}'::jsonb, encode(sha256('bypass'::bytea), 'hex'), $3::uuid)
     RETURNING id`,
    [tenantId, sessionId, userId],
  );
  return r.rows[0]!.id;
}

// Matrix aus fn_min_tier_for_job (§3 Operatives Stufen-Mapping).
const BLUEPRINT_JOBS = [
  "knowledge_unit_condensation",
  "diagnosis_generation",
  "recondense_with_gaps",
  "evidence_extraction",
  "bridge_generation",
] as const;

const HANDBOOK_JOBS = [
  "dialogue_transcription",
  "dialogue_extraction",
  "walkthrough_stub_processing",
  "walkthrough_transcribe",
  "walkthrough_redact_pii",
  "walkthrough_extract_steps",
  "walkthrough_map_subtopics",
  "email_bulk_parse",
  "email_bulk_pre_filter",
  "email_bulk_thread_redact",
  "email_bulk_pattern_extract",
  "email_bulk_synthesis",
  "sop_generation",
  "handbook_snapshot_generation",
] as const;

const ALL_GATED_JOBS = [...BLUEPRINT_JOBS, ...HANDBOOK_JOBS];

/** SELECT fn_session_tier_allows(session, job) fuer eine Liste job_types. */
async function gateMatrix(
  client: Client,
  sessionId: string,
  jobs: readonly string[],
): Promise<Record<string, boolean>> {
  const r = await client.query<{ job: string; allowed: boolean }>(
    `SELECT job, fn_session_tier_allows($1, job) AS allowed
       FROM unnest($2::text[]) AS job`,
    [sessionId, jobs as string[]],
  );
  return Object.fromEntries(r.rows.map((row) => [row.job, row.allowed]));
}

// ============================================================================
// AC-A-2 — Dispatch-RPC direkter Call auf zu-niedriger Session -> Reject
// ============================================================================

describe("V9.75 Bypass-Matrix — Dispatch-RPC direkter Call (AC-A-2)", () => {
  it("rpc_create_block_checkpoint: free-Session -> tier_gate_denied, kein Job", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, sessionId, tenantId } = await seedSession(client, "free");

      let errMessage: string | null = null;
      await withJwtContext(client, userId, async () => {
        await client.query("SAVEPOINT s");
        try {
          await client.query(
            `SELECT rpc_create_block_checkpoint($1, 'block_1', 'questionnaire_submit', '{"a":1}'::jsonb)`,
            [sessionId],
          );
        } catch (e) {
          errMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT s");
      });
      expect(errMessage).toMatch(/tier_gate_denied/);
      const job = await client.query(
        `SELECT 1 FROM ai_jobs WHERE tenant_id=$1 AND job_type='knowledge_unit_condensation'`,
        [tenantId],
      );
      expect(job.rowCount).toBe(0);
    });
  });

  it("rpc_enqueue_recondense_job: free-Checkpoint -> tier_gate_denied, kein Job", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, sessionId, tenantId } = await seedSession(client, "free");
      const checkpointId = await seedCheckpoint(client, tenantId, sessionId, userId);

      let errMessage: string | null = null;
      await client.query("SAVEPOINT s");
      try {
        await client.query(
          `SELECT rpc_enqueue_recondense_job($1, '{}'::uuid[])`,
          [checkpointId],
        );
      } catch (e) {
        errMessage = (e as Error).message;
      }
      await client.query("ROLLBACK TO SAVEPOINT s");
      expect(errMessage).toMatch(/tier_gate_denied/);
      const job = await client.query(
        `SELECT 1 FROM ai_jobs WHERE tenant_id=$1 AND job_type='recondense_with_gaps'`,
        [tenantId],
      );
      expect(job.rowCount).toBe(0);
    });
  });

  it("rpc_trigger_handbook_snapshot: blueprint-Session -> tier_gate_denied, kein Snapshot/Job", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, sessionId, tenantId } = await seedSession(client, "blueprint");

      let errMessage: string | null = null;
      await withJwtContext(client, userId, async () => {
        await client.query("SAVEPOINT s");
        try {
          await client.query(`SELECT rpc_trigger_handbook_snapshot($1)`, [sessionId]);
        } catch (e) {
          errMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT s");
      });
      expect(errMessage).toMatch(/tier_gate_denied/);
      const job = await client.query(
        `SELECT 1 FROM ai_jobs WHERE tenant_id=$1 AND job_type='handbook_snapshot_generation'`,
        [tenantId],
      );
      expect(job.rowCount).toBe(0);
    });
  });
});

// ============================================================================
// AC-A-4 — Enforcement-Primitiv pro gated job_type (fn_session_tier_allows)
//   Schliesst ISSUE-097: blueprint/free-Session darf keinen Voll-Kunden-Job.
// ============================================================================

describe("V9.75 Bypass-Matrix — fn_session_tier_allows pro gated job_type (AC-A-4)", () => {
  it("free-Session: ALLE 19 gated job_types -> false", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { sessionId } = await seedSession(client, "free");
      const m = await gateMatrix(client, sessionId, ALL_GATED_JOBS);
      for (const job of ALL_GATED_JOBS) expect(m[job]).toBe(false);
    });
  });

  it("blueprint-Session: 14 handbook-Jobs -> false, 5 blueprint-Jobs -> true", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { sessionId } = await seedSession(client, "blueprint");
      const m = await gateMatrix(client, sessionId, ALL_GATED_JOBS);
      for (const job of HANDBOOK_JOBS) expect(m[job]).toBe(false);
      for (const job of BLUEPRINT_JOBS) expect(m[job]).toBe(true);
    });
  });

  it("handbook-Session: ALLE 19 gated job_types -> true", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { sessionId } = await seedSession(client, "handbook");
      const m = await gateMatrix(client, sessionId, ALL_GATED_JOBS);
      for (const job of ALL_GATED_JOBS) expect(m[job]).toBe(true);
    });
  });

  it("lead_push_retry ist ungated (true auf jeder Stufe, inkl. free)", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { sessionId } = await seedSession(client, "free");
      const m = await gateMatrix(client, sessionId, ["lead_push_retry"]);
      expect(m["lead_push_retry"]).toBe(true);
    });
  });
});

// ============================================================================
// AC-A-3 — Worker-Defense gegen direkten ai_jobs-INSERT (Dispatch umgangen)
// ============================================================================

describe("V9.75 Bypass-Matrix — Worker-Defense direkter ai_jobs-INSERT (AC-A-3)", () => {
  it("gated Job mit NULL-Stempel: Claim liefert NULL -> fn_tier_allows(NULL,job)=false", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const t = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name) VALUES ('v975-bypass-worker') RETURNING id`);
      const tenantId = t.rows[0]!.id;
      // Direkter INSERT (Dispatch umgangen), Stempel NULL — als postgres seedbar.
      await client.query(
        `INSERT INTO ai_jobs (tenant_id, job_type, payload, status, session_tier)
         VALUES ($1, 'sop_generation', '{}'::jsonb, 'pending', NULL)`,
        [tenantId],
      );

      const claim = await client.query<{ r: { session_tier: string | null } }>(
        `SELECT rpc_claim_next_ai_job_for_type('sop_generation') AS r`);
      expect(claim.rows[0]!.r.session_tier).toBeNull();

      // Genau die Pruefung, die claim-loop.ts nach dem Claim macht:
      const allowed = await client.query<{ a: boolean }>(
        `SELECT fn_tier_allows($1, 'sop_generation') AS a`,
        [claim.rows[0]!.r.session_tier],
      );
      expect(allowed.rows[0]!.a).toBe(false); // -> Worker: status='failed', tier_gate_denied_worker
    });
  });

  it("GEFORGTER session_tier='handbook' durch authenticated tenant_admin -> Trigger zwangs-nullt", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, tenantId } = await seedSession(client, "blueprint");

      await withJwtContext(client, userId, async () => {
        const r = await client.query<{ session_tier: string | null }>(
          `INSERT INTO ai_jobs (tenant_id, job_type, payload, status, session_tier)
           VALUES ($1, 'handbook_snapshot_generation', '{}'::jsonb, 'pending', 'handbook')
           RETURNING session_tier`,
          [tenantId],
        );
        // Anti-Forge-Trigger: authenticated darf den Stempel nicht setzen.
        expect(r.rows[0]!.session_tier).toBeNull();
      });
    });
  });

  it("service_role darf den Stempel setzen (legitimer Dispatch-/Worker-Pfad)", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const t = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name) VALUES ('v975-bypass-svc') RETURNING id`);
      const tenantId = t.rows[0]!.id;

      await client.query("SET LOCAL ROLE service_role");
      const r = await client.query<{ session_tier: string | null }>(
        `INSERT INTO ai_jobs (tenant_id, job_type, payload, status, session_tier)
         VALUES ($1, 'sop_generation', '{}'::jsonb, 'pending', 'handbook')
         RETURNING session_tier`,
        [tenantId],
      );
      await client.query("RESET ROLE");
      expect(r.rows[0]!.session_tier).toBe("handbook");
    });
  });
});

// ============================================================================
// AC-A-5 — Self-Promotion-Block (PATCH capture_session.tier)
// ============================================================================

describe("V9.75 Bypass-Matrix — Self-Promotion-Block (AC-A-5)", () => {
  it("authenticated/tenant_admin UPDATE tier='handbook' -> Trigger-Block", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, sessionId } = await seedSession(client, "free");

      let errMessage: string | null = null;
      await withJwtContext(client, userId, async () => {
        await client.query("SAVEPOINT s");
        try {
          await client.query(
            `UPDATE public.capture_session SET tier='handbook' WHERE id=$1`,
            [sessionId],
          );
        } catch (e) {
          errMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT s");
      });
      expect(errMessage).toMatch(/service_role required|insufficient_privilege|denied/);

      const row = await client.query<{ tier: string }>(
        `SELECT tier FROM capture_session WHERE id=$1`, [sessionId]);
      expect(row.rows[0]!.tier).toBe("free"); // unveraendert
    });
  });
});

// ============================================================================
// V9.1-Regression-Guard — session-loser Forward-Bucket-Bulk-Run (IMP-1279)
//   Die End-zu-End-Allow-Entscheidung liegt im Worker-Carve-out
//   (claim-loop.test.ts). Hier: die DB-Vorbedingungen, die ihn load-bearing machen.
// ============================================================================

describe("V9.75 Bypass-Matrix — V9.1 Forward-Bucket-Regression-Guard", () => {
  it("email_bulk_run.capture_session_id ist nullable (session-loser Run moeglich)", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const col = await client.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema='public' AND table_name='email_bulk_run'
            AND column_name='capture_session_id'`);
      expect(col.rows[0]!.is_nullable).toBe("YES");
    });
  });

  it("email_bulk_* bleibt gated (handbook) — der Carve-out ist load-bearing, kein No-Op", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const r = await client.query<{ min_tier: string }>(
        `SELECT fn_min_tier_for_job('email_bulk_pre_filter') AS min_tier`);
      expect(r.rows[0]!.min_tier).toBe("handbook");
    });
  });
});
