import { describe, it, expect } from "vitest";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { seedV4Fixtures, type V4Fixtures } from "../rls/v4-fixtures";

/**
 * SLC-035 MT-5 — Stale-Trigger End-to-End-Verifikation (DEC-039).
 *
 * Trigger `trg_block_checkpoint_set_bridge_stale` (Migration 068) setzt den
 * juengsten `completed` bridge_run derselben capture_session_id auf `stale`,
 * sobald ein neuer `block_checkpoint` mit `checkpoint_type='questionnaire_submit'`
 * angelegt wird.
 *
 * Dieser Test simuliert nicht den vollen Worker-Pfad — er prueft nur die
 * DB-seitige Trigger-Mechanik. Der Worker-E2E-Pfad (rpc_trigger_bridge_run ->
 * Worker -> bridge_run completed) wird in /qa SLC-035 mit echtem Bedrock-Call
 * durchlaufen.
 */

async function insertBridgeRun(
  client: Client,
  fixtures: V4Fixtures,
  opts: {
    captureSessionId: string;
    status?: "running" | "completed" | "failed" | "stale";
    tenantId?: string;
  }
): Promise<string> {
  const tenantId = opts.tenantId ?? fixtures.tenantA;
  const userId =
    tenantId === fixtures.tenantA
      ? fixtures.tenantAdminAUserId
      : fixtures.tenantAdminBUserId;

  // Wichtig: created_at + completed_at via clock_timestamp() statt now().
  // now() ist innerhalb einer Transaktion KONSTANT; mehrere Inserts bekaemen
  // dasselbe created_at, was den ORDER-BY-Trigger nichtdeterministisch macht.
  const res = await client.query<{ id: string }>(
    `INSERT INTO public.bridge_run
       (tenant_id, capture_session_id, template_id, template_version,
        status, triggered_by_user_id, source_checkpoint_ids,
        created_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, '{}'::uuid[],
             clock_timestamp(),
             CASE WHEN $5 IN ('completed','failed','stale') THEN clock_timestamp() ELSE NULL END)
     RETURNING id`,
    [
      tenantId,
      opts.captureSessionId,
      fixtures.templateId,
      fixtures.templateVersion,
      opts.status ?? "completed",
      userId,
    ]
  );
  return res.rows[0].id;
}

async function insertBlockCheckpoint(
  client: Client,
  fixtures: V4Fixtures,
  opts: {
    captureSessionId: string;
    checkpointType?: "questionnaire_submit" | "meeting_final";
    blockKey?: string;
    tenantId?: string;
  }
): Promise<string> {
  const tenantId = opts.tenantId ?? fixtures.tenantA;
  const userId =
    tenantId === fixtures.tenantA
      ? fixtures.tenantAdminAUserId
      : fixtures.tenantAdminBUserId;

  const res = await client.query<{ id: string }>(
    `INSERT INTO public.block_checkpoint
       (tenant_id, capture_session_id, block_key, checkpoint_type,
        content, content_hash, created_by)
     VALUES ($1, $2, $3, $4, '{}'::jsonb,
             encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'),
             $5)
     RETURNING id`,
    [
      tenantId,
      opts.captureSessionId,
      opts.blockKey ?? "A",
      opts.checkpointType ?? "questionnaire_submit",
      userId,
    ]
  );
  return res.rows[0].id;
}

async function fetchBridgeRunStatus(
  client: Client,
  bridgeRunId: string
): Promise<string> {
  const res = await client.query<{ status: string }>(
    `SELECT status FROM public.bridge_run WHERE id = $1`,
    [bridgeRunId]
  );
  return res.rows[0]?.status ?? "<missing>";
}

describe("bridge_run stale-Trigger (DEC-039)", () => {
  it("AC-6 — completed bridge_run wird stale, sobald neuer questionnaire_submit-Checkpoint kommt", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const bridgeRunId = await insertBridgeRun(client, f, {
        captureSessionId: f.sessionAdminA,
        status: "completed",
      });

      expect(await fetchBridgeRunStatus(client, bridgeRunId)).toBe("completed");

      await insertBlockCheckpoint(client, f, {
        captureSessionId: f.sessionAdminA,
        checkpointType: "questionnaire_submit",
        blockKey: "A",
      });

      expect(await fetchBridgeRunStatus(client, bridgeRunId)).toBe("stale");
    });
  });

  it("meeting_final-Checkpoint loest KEIN stale aus (nur questionnaire_submit ist Trigger-Quelle)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const bridgeRunId = await insertBridgeRun(client, f, {
        captureSessionId: f.sessionAdminA,
        status: "completed",
      });

      await insertBlockCheckpoint(client, f, {
        captureSessionId: f.sessionAdminA,
        checkpointType: "meeting_final",
        blockKey: "A",
      });

      expect(await fetchBridgeRunStatus(client, bridgeRunId)).toBe("completed");
    });
  });

  it("nur der juengste completed bridge_run wird stale (aelterer bleibt completed)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const olderRunId = await insertBridgeRun(client, f, {
        captureSessionId: f.sessionAdminA,
        status: "completed",
      });

      const newerRunId = await insertBridgeRun(client, f, {
        captureSessionId: f.sessionAdminA,
        status: "completed",
      });

      await insertBlockCheckpoint(client, f, {
        captureSessionId: f.sessionAdminA,
        checkpointType: "questionnaire_submit",
        blockKey: "B",
      });

      expect(await fetchBridgeRunStatus(client, olderRunId)).toBe("completed");
      expect(await fetchBridgeRunStatus(client, newerRunId)).toBe("stale");
    });
  });

  it("running bridge_run bleibt running (Trigger zielt nur auf completed)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const runningRunId = await insertBridgeRun(client, f, {
        captureSessionId: f.sessionAdminA,
        status: "running",
      });

      await insertBlockCheckpoint(client, f, {
        captureSessionId: f.sessionAdminA,
        checkpointType: "questionnaire_submit",
        blockKey: "A",
      });

      expect(await fetchBridgeRunStatus(client, runningRunId)).toBe("running");
    });
  });

  it("bereits stale markierter Run wird nicht erneut beruehrt", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const staleRunId = await insertBridgeRun(client, f, {
        captureSessionId: f.sessionAdminA,
        status: "stale",
      });

      await insertBlockCheckpoint(client, f, {
        captureSessionId: f.sessionAdminA,
        checkpointType: "questionnaire_submit",
        blockKey: "A",
      });

      expect(await fetchBridgeRunStatus(client, staleRunId)).toBe("stale");
    });
  });

  it("bridge_run einer anderen capture_session bleibt unberuehrt", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const otherSessionRunId = await insertBridgeRun(client, f, {
        captureSessionId: f.sessionEmployeeA,
        status: "completed",
      });

      await insertBlockCheckpoint(client, f, {
        captureSessionId: f.sessionAdminA,
        checkpointType: "questionnaire_submit",
        blockKey: "A",
      });

      expect(await fetchBridgeRunStatus(client, otherSessionRunId)).toBe("completed");
    });
  });

  it("Cross-Tenant-Isolation: Checkpoint in Tenant A laesst Tenant-B-Run unberuehrt", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const tenantBRunId = await insertBridgeRun(client, f, {
        captureSessionId: f.sessionAdminB,
        status: "completed",
        tenantId: f.tenantB,
      });

      await insertBlockCheckpoint(client, f, {
        captureSessionId: f.sessionAdminA,
        checkpointType: "questionnaire_submit",
        blockKey: "A",
        tenantId: f.tenantA,
      });

      expect(await fetchBridgeRunStatus(client, tenantBRunId)).toBe("completed");
    });
  });
});
