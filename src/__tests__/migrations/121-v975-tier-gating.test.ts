// V9.75 SLC-V9.75-A MT-1 — Migration 121 (Tier-Gating Foundation).
//
// Verifiziert Schema-, Matrix-Funktions- und Trigger-Effekte der Migration gegen
// die Coolify-DB im selben Docker-Netzwerk (siehe .claude/rules/coolify-test-setup.md).
//
// Test-Strategie identisch zu MIG-106/116-Test:
//   - Jeder Test laeuft in einer eigenen withTestDb-Transaction (Auto-ROLLBACK).
//   - Die Migration wird PRO Transaction frisch angewendet (auch vor LIVE-Apply).
//   - Outer BEGIN/COMMIT der Migration werden gestrippt — withTestDb haelt die TX.
//   - Erwartete Trigger-Rejections via SAVEPOINT (sonst Tx-Abort, coolify-test-setup.md §2).
//
// Deckt AC-A-1 (tier-Spalte + Default-Backfill), AC-A-5 (Trigger blockt
// tenant_admin tier-Change, erlaubt service_role), AC-A-7 (Matrix-Single-Source
// fuer alle 20 job_types). Dispatch-/Worker-Gate-Verhalten (AC-A-2/3/4) folgt in
// MT-2/MT-4 + der Bypass-Suite (MT-5).

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
  const raw = readFileSync(MIGRATION_PATH, "utf-8");
  return raw
    .replace(/^\s*BEGIN\s*;\s*$/m, "")
    .replace(/^\s*COMMIT\s*;\s*$/m, "");
}

async function applyMigration121(client: Client): Promise<void> {
  await client.query(loadMigrationSql());
}

/**
 * Seedet tenant + tenant_admin-User + capture_session mit explizitem tier.
 * Laeuft als postgres (Superuser); der tier-Change-Guard ist BEFORE UPDATE,
 * INSERT mit beliebigem tier ist daher erlaubt. Gibt sessionId + userId zurueck.
 */
async function seedSession(
  client: Client,
  tier: "free" | "blueprint" | "handbook",
): Promise<{ tenantId: string; userId: string; sessionId: string }> {
  const tenantRes = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name) VALUES ($1) RETURNING id`,
    ["V975-tier-test-" + tier],
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
       'v975-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
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

// ============================================================================
// AC-A-1 — Schema
// ============================================================================

describe("Migration 121 — Schema (tier + session_tier)", () => {
  it("capture_session.tier ist NOT NULL, DEFAULT 'handbook', CHECK(free/blueprint/handbook)", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);

      const col = await client.query<{ is_nullable: string; column_default: string | null }>(
        `SELECT is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema='public' AND table_name='capture_session' AND column_name='tier'`,
      );
      expect(col.rowCount).toBe(1);
      expect(col.rows[0]!.is_nullable).toBe("NO");
      expect(col.rows[0]!.column_default ?? "").toContain("handbook");

      const checks = await client.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conrelid='public.capture_session'::regclass AND contype='c'`,
      );
      const allChecks = checks.rows.map((r) => r.def).join("\n");
      for (const t of ["free", "blueprint", "handbook"]) {
        expect(allChecks).toContain(t);
      }
    });
  });

  it("Bestands-Sessions defaulten auf 'handbook' (Backward-Compat, R-A-4)", async () => {
    await withTestDb(async (client) => {
      // Session VOR der Migration anlegen -> muss nach ADD COLUMN auf 'handbook' backfillen.
      const tenant = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name) VALUES ('V975-backfill') RETURNING id`,
      );
      const user = await client.query<{ id: string }>(
        `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
            'authenticated','authenticated',
            'v975-bf-' || substr(gen_random_uuid()::text,1,8) || '@onboarding.test','',
            '{}'::jsonb, jsonb_build_object('tenant_id',$1::text,'role','tenant_admin'),
            now(), now()) RETURNING id`,
        [tenant.rows[0]!.id],
      );
      const sess = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
            (tenant_id, template_id, template_version, owner_user_id,
             status, answers, released_for_strategaize_review, metadata)
         SELECT $1::uuid, t.id, t.version, $2::uuid, 'open', '{}'::jsonb, false, '{}'::jsonb
           FROM public.template t LIMIT 1 RETURNING id`,
        [tenant.rows[0]!.id, user.rows[0]!.id],
      );

      await applyMigration121(client);

      const res = await client.query<{ tier: string }>(
        `SELECT tier FROM public.capture_session WHERE id=$1`,
        [sess.rows[0]!.id],
      );
      expect(res.rows[0]!.tier).toBe("handbook");
    });
  });

  it("ai_jobs.session_tier existiert und ist nullable", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const col = await client.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema='public' AND table_name='ai_jobs' AND column_name='session_tier'`,
      );
      expect(col.rowCount).toBe(1);
      expect(col.rows[0]!.is_nullable).toBe("YES");
    });
  });
});

// ============================================================================
// AC-A-7 — Matrix-Single-Source (alle 20 job_types)
// ============================================================================

const JOB_MIN_TIER: Record<string, string | null> = {
  knowledge_unit_condensation: "blueprint",
  recondense_with_gaps: "blueprint",
  diagnosis_generation: "blueprint",
  evidence_extraction: "blueprint",
  bridge_generation: "blueprint",
  dialogue_transcription: "handbook",
  dialogue_extraction: "handbook",
  walkthrough_stub_processing: "handbook",
  walkthrough_transcribe: "handbook",
  walkthrough_redact_pii: "handbook",
  walkthrough_extract_steps: "handbook",
  walkthrough_map_subtopics: "handbook",
  handbook_snapshot_generation: "handbook",
  email_bulk_parse: "handbook",
  email_bulk_pre_filter: "handbook",
  email_bulk_thread_redact: "handbook",
  email_bulk_pattern_extract: "handbook",
  email_bulk_synthesis: "handbook",
  sop_generation: "handbook",
  lead_push_retry: null, // ungated
};

describe("Migration 121 — Matrix-Funktionen", () => {
  it("fn_tier_rank: free<blueprint<handbook, unbekannt/NULL = -1", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const r = await client.query<{ free: number; bp: number; hb: number; bogus: number; nul: number }>(
        `SELECT fn_tier_rank('free') free, fn_tier_rank('blueprint') bp,
                fn_tier_rank('handbook') hb, fn_tier_rank('bogus') bogus, fn_tier_rank(NULL) nul`,
      );
      expect(r.rows[0]).toEqual({ free: 0, bp: 1, hb: 2, bogus: -1, nul: -1 });
    });
  });

  it("fn_min_tier_for_job liefert das korrekte Min-Tier fuer alle 20 job_types", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      for (const [jobType, expected] of Object.entries(JOB_MIN_TIER)) {
        const r = await client.query<{ min_tier: string | null }>(
          `SELECT fn_min_tier_for_job($1) AS min_tier`,
          [jobType],
        );
        expect(r.rows[0]!.min_tier, `min-tier fuer ${jobType}`).toBe(expected);
      }
    });
  });

  it("fn_tier_allows: gated unter Stufe = false, ab Stufe = true; ungated immer; NULL fail-closed", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const cases: Array<[string | null, string, boolean]> = [
        ["free", "knowledge_unit_condensation", false],
        ["blueprint", "knowledge_unit_condensation", true],
        ["blueprint", "recondense_with_gaps", true],
        ["blueprint", "sop_generation", false],
        ["blueprint", "handbook_snapshot_generation", false],
        ["handbook", "sop_generation", true],
        ["handbook", "email_bulk_synthesis", true],
        ["free", "lead_push_retry", true], // ungated -> immer erlaubt
        ["handbook", "lead_push_retry", true],
        [null, "knowledge_unit_condensation", false], // fail-closed
        [null, "lead_push_retry", true], // ungated trotz NULL
      ];
      for (const [tier, job, expected] of cases) {
        const r = await client.query<{ allowed: boolean }>(
          `SELECT fn_tier_allows($1, $2) AS allowed`,
          [tier, job],
        );
        expect(r.rows[0]!.allowed, `${tier} + ${job}`).toBe(expected);
      }
    });
  });

  it("fn_session_tier_allows loest den tier aus der Session auf", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const bp = await seedSession(client, "blueprint");
      const hb = await seedSession(client, "handbook");

      const bpCond = await client.query<{ a: boolean }>(
        `SELECT fn_session_tier_allows($1,'knowledge_unit_condensation') a`, [bp.sessionId]);
      const bpSop = await client.query<{ a: boolean }>(
        `SELECT fn_session_tier_allows($1,'sop_generation') a`, [bp.sessionId]);
      const hbSop = await client.query<{ a: boolean }>(
        `SELECT fn_session_tier_allows($1,'sop_generation') a`, [hb.sessionId]);
      const missing = await client.query<{ a: boolean }>(
        `SELECT fn_session_tier_allows(gen_random_uuid(),'knowledge_unit_condensation') a`);

      expect(bpCond.rows[0]!.a).toBe(true);
      expect(bpSop.rows[0]!.a).toBe(false);
      expect(hbSop.rows[0]!.a).toBe(true);
      expect(missing.rows[0]!.a).toBe(false); // unbekannte Session -> fail-closed
    });
  });
});

// ============================================================================
// AC-A-5 — Column-Level-Schutz (tier-Change-Guard, ISSUE-097-Kern)
// ============================================================================

describe("Migration 121 — capture_session_tier_change_guard", () => {
  it("Trigger existiert", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const r = await client.query<{ tgname: string }>(
        `SELECT tgname FROM pg_trigger
          WHERE tgrelid='public.capture_session'::regclass
            AND tgname='capture_session_tier_change_guard'`,
      );
      expect(r.rowCount).toBe(1);
    });
  });

  it("tenant_admin (authenticated) kann tier NICHT aendern (insufficient_privilege)", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, sessionId } = await seedSession(client, "blueprint");

      let errMessage: string | null = null;
      await withJwtContext(client, userId, async () => {
        await client.query("SAVEPOINT try_tier");
        try {
          await client.query(
            `UPDATE public.capture_session SET tier='handbook' WHERE id=$1`,
            [sessionId],
          );
        } catch (e) {
          errMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT try_tier");
      });
      expect(errMessage).toMatch(/service_role required|insufficient/i);

      // tier unveraendert
      const after = await client.query<{ tier: string }>(
        `SELECT tier FROM public.capture_session WHERE id=$1`, [sessionId]);
      expect(after.rows[0]!.tier).toBe("blueprint");
    });
  });

  it("tenant_admin darf NICHT-tier-Spalten weiter aendern (Trigger blockt nur tier)", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, sessionId } = await seedSession(client, "blueprint");
      await withJwtContext(client, userId, async () => {
        // status-Update ohne tier-Change -> Trigger passt durch
        await client.query(
          `UPDATE public.capture_session SET status='in_progress' WHERE id=$1`, [sessionId]);
      });
      const after = await client.query<{ status: string; tier: string }>(
        `SELECT status, tier FROM public.capture_session WHERE id=$1`, [sessionId]);
      expect(after.rows[0]!.status).toBe("in_progress");
      expect(after.rows[0]!.tier).toBe("blueprint");
    });
  });

  it("service_role darf tier aendern (legitimer Berater-/Admin-Pfad)", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { sessionId } = await seedSession(client, "blueprint");
      await client.query("SET LOCAL ROLE service_role");
      try {
        await client.query(
          `UPDATE public.capture_session SET tier='handbook' WHERE id=$1`, [sessionId]);
      } finally {
        await client.query("RESET ROLE");
      }
      const after = await client.query<{ tier: string }>(
        `SELECT tier FROM public.capture_session WHERE id=$1`, [sessionId]);
      expect(after.rows[0]!.tier).toBe("handbook");
    });
  });
});

// ============================================================================
// AC-A-2/AC-A-3 — Dispatch-RPC Tier-Gates (MT-2)
//   Jede gated Dispatch-RPC lehnt eine Session unter der Mindest-Stufe mit
//   'tier_gate_denied' ab (kein Checkpoint/Snapshot/Job bleibt liegen) und
//   stempelt bei Erfolg den session_tier auf den erzeugten ai_job.
//   Die voll-adversariale Bypass-Suite (PostgREST-Patch, direkter Job-INSERT,
//   Worker-Defense) folgt in MT-5.
// ============================================================================

/** Seedet einen block_checkpoint fuer eine Session (als postgres/Superuser). */
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
             '{}'::jsonb, encode(sha256('seed'::bytea), 'hex'), $3::uuid)
     RETURNING id`,
    [tenantId, sessionId, userId],
  );
  return r.rows[0]!.id;
}

describe("Migration 121 — rpc_create_block_checkpoint Tier-Gate (knowledge_unit_condensation)", () => {
  it("free-tier Session wird mit tier_gate_denied abgelehnt; kein Checkpoint/Job", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, sessionId, tenantId } = await seedSession(client, "free");

      let errMessage: string | null = null;
      await withJwtContext(client, userId, async () => {
        await client.query("SAVEPOINT try_cp");
        try {
          await client.query(
            `SELECT rpc_create_block_checkpoint($1, 'block_1', 'questionnaire_submit', '{"a":1}'::jsonb)`,
            [sessionId],
          );
        } catch (e) {
          errMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT try_cp");
      });
      expect(errMessage).toMatch(/tier_gate_denied/);

      const cp = await client.query(
        `SELECT 1 FROM block_checkpoint WHERE capture_session_id=$1`, [sessionId]);
      expect(cp.rowCount).toBe(0);
      const job = await client.query(
        `SELECT 1 FROM ai_jobs WHERE tenant_id=$1 AND job_type='knowledge_unit_condensation'`,
        [tenantId]);
      expect(job.rowCount).toBe(0);
    });
  });

  it("blueprint-Session erlaubt; ai_job traegt session_tier='blueprint'", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, sessionId } = await seedSession(client, "blueprint");

      let jobId: string | null = null;
      await withJwtContext(client, userId, async () => {
        const r = await client.query<{ result: { job_id: string | null } }>(
          `SELECT rpc_create_block_checkpoint($1, 'block_1', 'questionnaire_submit', '{"a":1}'::jsonb) AS result`,
          [sessionId],
        );
        jobId = r.rows[0]!.result.job_id;
      });
      expect(jobId).not.toBeNull();

      const job = await client.query<{ session_tier: string }>(
        `SELECT session_tier FROM ai_jobs WHERE id=$1`, [jobId]);
      expect(job.rows[0]!.session_tier).toBe("blueprint");
    });
  });
});

describe("Migration 121 — rpc_enqueue_recondense_job Tier-Gate (recondense_with_gaps)", () => {
  it("free-tier Checkpoint wird mit tier_gate_denied abgelehnt", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, sessionId, tenantId } = await seedSession(client, "free");
      const checkpointId = await seedCheckpoint(client, tenantId, sessionId, userId);

      let errMessage: string | null = null;
      await client.query("SAVEPOINT try_rc");
      try {
        await client.query(
          `SELECT rpc_enqueue_recondense_job($1, '{}'::uuid[])`, [checkpointId]);
      } catch (e) {
        errMessage = (e as Error).message;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_rc");
      expect(errMessage).toMatch(/tier_gate_denied/);

      const job = await client.query(
        `SELECT 1 FROM ai_jobs WHERE tenant_id=$1 AND job_type='recondense_with_gaps'`,
        [tenantId]);
      expect(job.rowCount).toBe(0);
    });
  });

  it("blueprint-Checkpoint erlaubt; ai_job traegt session_tier='blueprint'", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, sessionId, tenantId } = await seedSession(client, "blueprint");
      const checkpointId = await seedCheckpoint(client, tenantId, sessionId, userId);

      const r = await client.query<{ result: { job_id: string } }>(
        `SELECT rpc_enqueue_recondense_job($1, '{}'::uuid[]) AS result`, [checkpointId]);
      const jobId = r.rows[0]!.result.job_id;
      expect(jobId).toBeTruthy();

      const job = await client.query<{ session_tier: string }>(
        `SELECT session_tier FROM ai_jobs WHERE id=$1`, [jobId]);
      expect(job.rows[0]!.session_tier).toBe("blueprint");
    });
  });
});

describe("Migration 121 — rpc_trigger_handbook_snapshot Tier-Gate (handbook_snapshot_generation)", () => {
  it("blueprint-Session wird mit tier_gate_denied abgelehnt; kein Snapshot/Job", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, sessionId, tenantId } = await seedSession(client, "blueprint");

      let errMessage: string | null = null;
      await withJwtContext(client, userId, async () => {
        await client.query("SAVEPOINT try_hb");
        try {
          await client.query(
            `SELECT rpc_trigger_handbook_snapshot($1)`, [sessionId]);
        } catch (e) {
          errMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT try_hb");
      });
      expect(errMessage).toMatch(/tier_gate_denied/);

      const snap = await client.query(
        `SELECT 1 FROM handbook_snapshot WHERE capture_session_id=$1`, [sessionId]);
      expect(snap.rowCount).toBe(0);
      const job = await client.query(
        `SELECT 1 FROM ai_jobs WHERE tenant_id=$1 AND job_type='handbook_snapshot_generation'`,
        [tenantId]);
      expect(job.rowCount).toBe(0);
    });
  });

  it("handbook-Session erlaubt; ai_job traegt session_tier='handbook'", async () => {
    await withTestDb(async (client) => {
      await applyMigration121(client);
      const { userId, sessionId, tenantId } = await seedSession(client, "handbook");

      let snapshotId: string | null = null;
      await withJwtContext(client, userId, async () => {
        const r = await client.query<{ result: { handbook_snapshot_id: string | null; error?: string } }>(
          `SELECT rpc_trigger_handbook_snapshot($1) AS result`, [sessionId]);
        snapshotId = r.rows[0]!.result.handbook_snapshot_id;
      });
      expect(snapshotId).not.toBeNull();

      const job = await client.query<{ session_tier: string }>(
        `SELECT session_tier FROM ai_jobs
          WHERE tenant_id=$1 AND job_type='handbook_snapshot_generation'`,
        [tenantId]);
      expect(job.rowCount).toBe(1);
      expect(job.rows[0]!.session_tier).toBe("handbook");
    });
  });
});
