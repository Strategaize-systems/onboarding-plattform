import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

describe("Answer Persistence (capture_session.answers JSONB)", () => {
  it("Happy Path: saves answer into capture_session.answers and persists on re-read", async () => {
    await withTestDb(async (client) => {
      const { tenantA, userA, templateId, templateVersion } =
        await seedTestTenants(client);

      // Create a capture session as superuser
      const sessionInsert = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status, answers)
         VALUES ($1, $2, $3, $4, 'open', '{}'::jsonb) RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );
      const sessionId = sessionInsert.rows[0].id;

      // As tenant_admin of A, write an answer via JSONB merge
      await withJwtContext(client, userA, async () => {
        const answerKey = "A.question-uuid-1";
        const answerValue = "Das Unternehmen ist im Bereich Beratung taetig.";

        await client.query(
          `UPDATE public.capture_session
           SET answers = answers || $1::jsonb
           WHERE id = $2`,
          [JSON.stringify({ [answerKey]: answerValue }), sessionId]
        );

        // Re-read and verify persistence
        const result = await client.query<{ answers: Record<string, string> }>(
          `SELECT answers FROM public.capture_session WHERE id = $1`,
          [sessionId]
        );
        expect(result.rowCount).toBe(1);
        expect(result.rows[0].answers[answerKey]).toBe(answerValue);
      });
    });
  });

  it("saves multiple answers across blocks and preserves all", async () => {
    await withTestDb(async (client) => {
      const { tenantA, userA, templateId, templateVersion } =
        await seedTestTenants(client);

      const sessionInsert = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status, answers)
         VALUES ($1, $2, $3, $4, 'open', '{}'::jsonb) RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );
      const sessionId = sessionInsert.rows[0].id;

      await withJwtContext(client, userA, async () => {
        // Write answer 1 (Block A)
        await client.query(
          `UPDATE public.capture_session
           SET answers = answers || $1::jsonb
           WHERE id = $2`,
          [JSON.stringify({ "A.q1": "Antwort Block A" }), sessionId]
        );

        // Write answer 2 (Block B) — must NOT overwrite Block A
        await client.query(
          `UPDATE public.capture_session
           SET answers = answers || $1::jsonb
           WHERE id = $2`,
          [JSON.stringify({ "B.q2": "Antwort Block B" }), sessionId]
        );

        // Both answers must be present
        const result = await client.query<{ answers: Record<string, string> }>(
          `SELECT answers FROM public.capture_session WHERE id = $1`,
          [sessionId]
        );
        expect(result.rows[0].answers["A.q1"]).toBe("Antwort Block A");
        expect(result.rows[0].answers["B.q2"]).toBe("Antwort Block B");
      });
    });
  });

  it("RLS: Tenant B cannot write answers into Tenant A session", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      // Session owned by Tenant A
      const sessionInsert = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status, answers)
         VALUES ($1, $2, $3, $4, 'open', '{}'::jsonb) RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );
      const sessionId = sessionInsert.rows[0].id;

      // As Tenant B user, try to update Tenant A's session
      await withJwtContext(client, userB, async () => {
        const result = await client.query(
          `UPDATE public.capture_session
           SET answers = answers || '{"A.q1": "Hacked!"}'::jsonb
           WHERE id = $1`,
          [sessionId]
        );
        // RLS should prevent the update — rowCount should be 0
        expect(result.rowCount).toBe(0);
      });

      // Verify A's session is untouched (read as superuser)
      const check = await client.query<{ answers: Record<string, string> }>(
        `SELECT answers FROM public.capture_session WHERE id = $1`,
        [sessionId]
      );
      expect(Object.keys(check.rows[0].answers)).toHaveLength(0);
    });
  });
});
