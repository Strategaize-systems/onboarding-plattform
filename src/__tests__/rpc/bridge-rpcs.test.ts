import { describe, it, expect } from "vitest";
import type { Client, QueryResult } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedV4Fixtures, type V4Fixtures } from "../rls/v4-fixtures";

/**
 * SLC-035 MT-1 — Migration 073: rpc_trigger_bridge_run, rpc_approve_bridge_proposal,
 * rpc_reject_bridge_proposal.
 *
 * TDD-Strikt (SaaS-Mandat). Jeder Testfall beschreibt eine konkrete
 * Sicherheits- oder Lifecycle-Garantie.
 *
 * Voraussetzung: TEST_DATABASE_URL mit Migrationen 065-075 + 073 + 073b angewendet.
 */

async function queryAs<T extends Record<string, unknown>>(
  client: Client,
  userId: string,
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  let result!: QueryResult<T>;
  await withJwtContext(client, userId, async () => {
    result = await client.query<T>(sql, params);
  });
  return result;
}

async function insertBridgeProposal(
  client: Client,
  fixtures: V4Fixtures,
  tenantId: string,
  opts: {
    mode?: "template" | "free_form";
    title?: string;
    employeeUserId?: string | null;
    questions?: unknown[];
  } = {}
): Promise<{ bridgeRunId: string; proposalId: string }> {
  const bridgeRun = await client.query<{ id: string }>(
    `INSERT INTO public.bridge_run
       (tenant_id, capture_session_id, template_id, template_version,
        status, triggered_by_user_id, source_checkpoint_ids)
     VALUES ($1, $2, $3, $4, 'completed', $5, '{}'::uuid[])
     RETURNING id`,
    [
      tenantId,
      tenantId === fixtures.tenantA ? fixtures.sessionAdminA : fixtures.sessionAdminB,
      fixtures.templateId,
      fixtures.templateVersion,
      tenantId === fixtures.tenantA ? fixtures.tenantAdminAUserId : fixtures.tenantAdminBUserId,
    ]
  );

  const proposal = await client.query<{ id: string }>(
    `INSERT INTO public.bridge_proposal
       (tenant_id, bridge_run_id, proposal_mode, source_subtopic_key,
        proposed_block_title, proposed_block_description, proposed_questions,
        proposed_employee_user_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'proposed')
     RETURNING id`,
    [
      tenantId,
      bridgeRun.rows[0].id,
      opts.mode ?? "template",
      "c1_kernablaeufe",
      opts.title ?? "Mitarbeiter-Sicht: Kernablaeufe",
      "Description",
      JSON.stringify(opts.questions ?? [{ id: "EM-C1-1", text: "Q1", required: true }]),
      opts.employeeUserId === undefined
        ? tenantId === fixtures.tenantA
          ? fixtures.employeeAUserId
          : fixtures.employeeBUserId
        : opts.employeeUserId,
    ]
  );

  return { bridgeRunId: bridgeRun.rows[0].id, proposalId: proposal.rows[0].id };
}

describe("rpc_trigger_bridge_run", () => {
  it("tenant_admin erzeugt bridge_run (running) + ai_jobs (bridge_generation)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const res = await queryAs<{ result: Record<string, string> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_trigger_bridge_run($1) AS result`,
        [f.sessionAdminA]
      );

      const r = res.rows[0].result;
      expect(r.bridge_run_id).toMatch(/^[0-9a-f-]{36}$/);

      // bridge_run exists
      const runCheck = await client.query<{
        tenant_id: string;
        status: string;
        triggered_by_user_id: string;
        template_id: string;
      }>(
        `SELECT tenant_id, status, triggered_by_user_id, template_id
           FROM public.bridge_run WHERE id = $1`,
        [r.bridge_run_id]
      );
      expect(runCheck.rowCount).toBe(1);
      expect(runCheck.rows[0].tenant_id).toBe(f.tenantA);
      expect(runCheck.rows[0].status).toBe("running");
      expect(runCheck.rows[0].triggered_by_user_id).toBe(f.tenantAdminAUserId);
      expect(runCheck.rows[0].template_id).toBe(f.templateId);

      // ai_jobs row queued
      const jobCheck = await client.query<{
        job_type: string;
        status: string;
        payload: { bridge_run_id: string };
        tenant_id: string;
      }>(
        `SELECT job_type, status, payload, tenant_id
           FROM public.ai_jobs
          WHERE job_type = 'bridge_generation'
            AND payload->>'bridge_run_id' = $1`,
        [r.bridge_run_id]
      );
      expect(jobCheck.rowCount).toBe(1);
      expect(jobCheck.rows[0].status).toBe("pending");
      expect(jobCheck.rows[0].tenant_id).toBe(f.tenantA);
      expect(jobCheck.rows[0].payload.bridge_run_id).toBe(r.bridge_run_id);
    });
  });

  it("tenant_member wird abgelehnt (forbidden)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantMemberAUserId,
        `SELECT public.rpc_trigger_bridge_run($1) AS result`,
        [f.sessionAdminA]
      );

      expect(res.rows[0].result).toEqual({ error: "forbidden" });
    });
  });

  it("employee wird abgelehnt (forbidden)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.employeeAUserId,
        `SELECT public.rpc_trigger_bridge_run($1) AS result`,
        [f.sessionAdminA]
      );

      expect(res.rows[0].result).toEqual({ error: "forbidden" });
    });
  });

  it("Cross-Tenant-Schutz: tenant_admin B kann keine Session aus Tenant A triggern", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantAdminBUserId,
        `SELECT public.rpc_trigger_bridge_run($1) AS result`,
        [f.sessionAdminA]
      );

      expect(res.rows[0].result).toEqual({ error: "forbidden" });
    });
  });

  it("nicht existierende Session -> capture_session_not_found", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_trigger_bridge_run($1) AS result`,
        ["00000000-0000-0000-0000-000000000000"]
      );

      expect(res.rows[0].result).toEqual({ error: "capture_session_not_found" });
    });
  });

  it("strategaize_admin darf jede Session triggern", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const res = await queryAs<{ result: Record<string, string> }>(
        client,
        f.strategaizeAdminUserId,
        `SELECT public.rpc_trigger_bridge_run($1) AS result`,
        [f.sessionAdminB]
      );

      expect(res.rows[0].result.bridge_run_id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it("source_checkpoint_ids enthalten submitted/finalized checkpoints der Session", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      // 2 Checkpoints auf Session A
      const cp1 = await client.query<{ id: string }>(
        `INSERT INTO public.block_checkpoint
           (tenant_id, capture_session_id, block_key, checkpoint_type,
            content, content_hash, created_by)
         VALUES ($1, $2, 'A', 'questionnaire_submit', '{}'::jsonb, 'hash-a', $3)
         RETURNING id`,
        [f.tenantA, f.sessionAdminA, f.tenantAdminAUserId]
      );
      const cp2 = await client.query<{ id: string }>(
        `INSERT INTO public.block_checkpoint
           (tenant_id, capture_session_id, block_key, checkpoint_type,
            content, content_hash, created_by)
         VALUES ($1, $2, 'B', 'meeting_final', '{}'::jsonb, 'hash-b', $3)
         RETURNING id`,
        [f.tenantA, f.sessionAdminA, f.tenantAdminAUserId]
      );

      const res = await queryAs<{ result: Record<string, string> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_trigger_bridge_run($1) AS result`,
        [f.sessionAdminA]
      );
      const runId = res.rows[0].result.bridge_run_id;

      const runCheck = await client.query<{ source_checkpoint_ids: string[] }>(
        `SELECT source_checkpoint_ids FROM public.bridge_run WHERE id = $1`,
        [runId]
      );
      expect(runCheck.rows[0].source_checkpoint_ids).toEqual(
        expect.arrayContaining([cp1.rows[0].id, cp2.rows[0].id])
      );
      expect(runCheck.rows[0].source_checkpoint_ids).toHaveLength(2);
    });
  });
});

describe("rpc_approve_bridge_proposal", () => {
  it("tenant_admin approved -> capture_session gespawned, proposal status=spawned", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const { proposalId } = await insertBridgeProposal(client, f, f.tenantA);

      const res = await queryAs<{ result: Record<string, string> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_approve_bridge_proposal($1, NULL) AS result`,
        [proposalId]
      );

      const sessionId = res.rows[0].result.capture_session_id;
      expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);

      const sessionCheck = await client.query<{
        tenant_id: string;
        owner_user_id: string;
        capture_mode: string;
        status: string;
        template_id: string;
        answers: Record<string, unknown>;
      }>(
        `SELECT tenant_id, owner_user_id, capture_mode, status, template_id, answers
           FROM public.capture_session WHERE id = $1`,
        [sessionId]
      );
      expect(sessionCheck.rowCount).toBe(1);
      expect(sessionCheck.rows[0].tenant_id).toBe(f.tenantA);
      expect(sessionCheck.rows[0].owner_user_id).toBe(f.employeeAUserId);
      expect(sessionCheck.rows[0].capture_mode).toBe("employee_questionnaire");
      expect(sessionCheck.rows[0].status).toBe("open");
      expect(sessionCheck.rows[0].template_id).toBe(f.templateId);
      expect(sessionCheck.rows[0].answers).toEqual({});

      const propCheck = await client.query<{
        status: string;
        approved_capture_session_id: string;
        reviewed_by_user_id: string;
      }>(
        `SELECT status, approved_capture_session_id, reviewed_by_user_id
           FROM public.bridge_proposal WHERE id = $1`,
        [proposalId]
      );
      expect(propCheck.rows[0].status).toBe("spawned");
      expect(propCheck.rows[0].approved_capture_session_id).toBe(sessionId);
      expect(propCheck.rows[0].reviewed_by_user_id).toBe(f.tenantAdminAUserId);
    });
  });

  it("edited_payload ueberschreibt proposed_block_title + proposed_questions", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const { proposalId } = await insertBridgeProposal(client, f, f.tenantA, {
        title: "Original Title",
      });

      const edited = {
        proposed_block_title: "Edited Title",
        proposed_questions: [{ id: "EM-X-1", text: "Edited Q", required: true }],
      };

      const res = await queryAs<{ result: Record<string, string> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_approve_bridge_proposal($1, $2::jsonb) AS result`,
        [proposalId, JSON.stringify(edited)]
      );

      expect(res.rows[0].result.capture_session_id).toMatch(/^[0-9a-f-]{36}$/);

      const propCheck = await client.query<{
        proposed_block_title: string;
        proposed_questions: unknown[];
      }>(
        `SELECT proposed_block_title, proposed_questions
           FROM public.bridge_proposal WHERE id = $1`,
        [proposalId]
      );
      expect(propCheck.rows[0].proposed_block_title).toBe("Edited Title");
      expect(propCheck.rows[0].proposed_questions).toEqual([
        { id: "EM-X-1", text: "Edited Q", required: true },
      ]);
    });
  });

  it("edited_payload kann proposed_employee_user_id setzen wenn originaler NULL war", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const { proposalId } = await insertBridgeProposal(client, f, f.tenantA, {
        employeeUserId: null,
      });

      const res = await queryAs<{ result: Record<string, string> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_approve_bridge_proposal($1, $2::jsonb) AS result`,
        [proposalId, JSON.stringify({ proposed_employee_user_id: f.employeeAUserId })]
      );

      const sessionId = res.rows[0].result.capture_session_id;
      expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);

      const sessionCheck = await client.query<{ owner_user_id: string }>(
        `SELECT owner_user_id FROM public.capture_session WHERE id = $1`,
        [sessionId]
      );
      expect(sessionCheck.rows[0].owner_user_id).toBe(f.employeeAUserId);
    });
  });

  it("ohne proposed_employee_user_id -> no_employee_assigned", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const { proposalId } = await insertBridgeProposal(client, f, f.tenantA, {
        employeeUserId: null,
      });

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_approve_bridge_proposal($1, NULL) AS result`,
        [proposalId]
      );

      expect(res.rows[0].result).toEqual({ error: "no_employee_assigned" });
    });
  });

  it("Cross-Tenant-Schutz: tenant_admin B kann Tenant A Proposal NICHT approven", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const { proposalId } = await insertBridgeProposal(client, f, f.tenantA);

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantAdminBUserId,
        `SELECT public.rpc_approve_bridge_proposal($1, NULL) AS result`,
        [proposalId]
      );

      expect(res.rows[0].result).toEqual({ error: "forbidden" });
    });
  });

  it("Idempotent: zweites approve auf spawned Proposal liefert selbe session_id + already=true", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const { proposalId } = await insertBridgeProposal(client, f, f.tenantA);

      const first = await queryAs<{ result: Record<string, string> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_approve_bridge_proposal($1, NULL) AS result`,
        [proposalId]
      );
      const firstSession = first.rows[0].result.capture_session_id;

      const second = await queryAs<{ result: Record<string, string | boolean> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_approve_bridge_proposal($1, NULL) AS result`,
        [proposalId]
      );

      expect(second.rows[0].result.capture_session_id).toBe(firstSession);
      expect(second.rows[0].result.already).toBe(true);
    });
  });

  it("rejected Proposal kann nicht approved werden -> invalid_status", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const { proposalId } = await insertBridgeProposal(client, f, f.tenantA);

      await client.query(
        `UPDATE public.bridge_proposal SET status = 'rejected' WHERE id = $1`,
        [proposalId]
      );

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_approve_bridge_proposal($1, NULL) AS result`,
        [proposalId]
      );

      expect(res.rows[0].result).toEqual({ error: "invalid_status" });
    });
  });
});

describe("rpc_reject_bridge_proposal", () => {
  it("tenant_admin rejected mit reason -> status=rejected, reject_reason gesetzt", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const { proposalId } = await insertBridgeProposal(client, f, f.tenantA);

      const res = await queryAs<{ result: Record<string, boolean> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_reject_bridge_proposal($1, $2) AS result`,
        [proposalId, "Zu vage"]
      );

      expect(res.rows[0].result.rejected).toBe(true);

      const propCheck = await client.query<{
        status: string;
        reject_reason: string;
        reviewed_by_user_id: string;
      }>(
        `SELECT status, reject_reason, reviewed_by_user_id
           FROM public.bridge_proposal WHERE id = $1`,
        [proposalId]
      );
      expect(propCheck.rows[0].status).toBe("rejected");
      expect(propCheck.rows[0].reject_reason).toBe("Zu vage");
      expect(propCheck.rows[0].reviewed_by_user_id).toBe(f.tenantAdminAUserId);
    });
  });

  it("Cross-Tenant-Schutz: tenant_admin B kann Tenant A Proposal NICHT rejecten", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const { proposalId } = await insertBridgeProposal(client, f, f.tenantA);

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantAdminBUserId,
        `SELECT public.rpc_reject_bridge_proposal($1, $2) AS result`,
        [proposalId, "Cross tenant try"]
      );

      expect(res.rows[0].result).toEqual({ error: "forbidden" });
    });
  });

  it("Idempotent: zweites reject liefert already=true", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const { proposalId } = await insertBridgeProposal(client, f, f.tenantA);

      await queryAs(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_reject_bridge_proposal($1, $2)`,
        [proposalId, "First"]
      );

      const res = await queryAs<{ result: Record<string, boolean> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_reject_bridge_proposal($1, $2) AS result`,
        [proposalId, "Second"]
      );

      expect(res.rows[0].result.rejected).toBe(true);
      expect(res.rows[0].result.already).toBe(true);
    });
  });

  it("employee darf NICHT rejecten (forbidden)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const { proposalId } = await insertBridgeProposal(client, f, f.tenantA);

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.employeeAUserId,
        `SELECT public.rpc_reject_bridge_proposal($1, $2) AS result`,
        [proposalId, "Employee try"]
      );

      expect(res.rows[0].result).toEqual({ error: "forbidden" });
    });
  });

  it("spawned Proposal kann nicht rejected werden -> already_spawned", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const { proposalId } = await insertBridgeProposal(client, f, f.tenantA);

      await client.query(
        `UPDATE public.bridge_proposal SET status = 'spawned',
         approved_capture_session_id = $1 WHERE id = $2`,
        [f.sessionEmployeeA, proposalId]
      );

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_reject_bridge_proposal($1, $2) AS result`,
        [proposalId, "Too late"]
      );

      expect(res.rows[0].result).toEqual({ error: "already_spawned" });
    });
  });
});
