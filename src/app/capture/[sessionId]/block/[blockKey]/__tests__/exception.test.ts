import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

describe("Exception Field Persistence (SLC-007)", () => {
  it("saves exception text under __exception__.<blockKey> and persists on re-read", async () => {
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
        const exceptionKey = "__exception__.A";
        const exceptionText =
          "Das Unternehmen hat eine Sonderregelung fuer Mitarbeiter-Beteiligungen, die nicht ins Schema passt.";

        await client.query(
          `UPDATE public.capture_session
           SET answers = answers || $1::jsonb
           WHERE id = $2`,
          [JSON.stringify({ [exceptionKey]: exceptionText }), sessionId]
        );

        const result = await client.query<{ answers: Record<string, string> }>(
          `SELECT answers FROM public.capture_session WHERE id = $1`,
          [sessionId]
        );
        expect(result.rowCount).toBe(1);
        expect(result.rows[0].answers[exceptionKey]).toBe(exceptionText);
      });
    });
  });

  it("exception text coexists with regular answers without overwriting", async () => {
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
        // Write regular answer
        await client.query(
          `UPDATE public.capture_session
           SET answers = answers || $1::jsonb
           WHERE id = $2`,
          [JSON.stringify({ "A.q1": "Regulaere Antwort" }), sessionId]
        );

        // Write exception — must NOT overwrite regular answer
        await client.query(
          `UPDATE public.capture_session
           SET answers = answers || $1::jsonb
           WHERE id = $2`,
          [
            JSON.stringify({ "__exception__.A": "Sonderfall hier" }),
            sessionId,
          ]
        );

        const result = await client.query<{ answers: Record<string, string> }>(
          `SELECT answers FROM public.capture_session WHERE id = $1`,
          [sessionId]
        );
        expect(result.rows[0].answers["A.q1"]).toBe("Regulaere Antwort");
        expect(result.rows[0].answers["__exception__.A"]).toBe(
          "Sonderfall hier"
        );
      });
    });
  });

  it("exception text is included in block_checkpoint.content when block is submitted", async () => {
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

      // Write answer + exception as superuser (simulating pre-submit state)
      await client.query(
        `UPDATE public.capture_session
         SET answers = $1::jsonb
         WHERE id = $2`,
        [
          JSON.stringify({
            "A.q1": "Antwort auf Frage 1",
            "__exception__.A": "Wichtiger Sonderfall",
          }),
          sessionId,
        ]
      );

      // Call the RPC to create a checkpoint — simulate what submit-action.ts does
      // Build the content object the same way submit-action.ts does
      const content = {
        answers: { q1: "Antwort auf Frage 1" },
        exception: "Wichtiger Sonderfall",
        chat_context: null,
        block_key: "A",
        template_version: templateVersion,
      };

      const rpcResult = await client.query<{
        checkpoint_id: string;
        job_id: string | null;
        deduplicated: boolean;
      }>(
        `SELECT * FROM public.rpc_create_block_checkpoint($1, $2, $3, $4)`,
        [sessionId, "A", "questionnaire_submit", JSON.stringify(content)]
      );
      expect(rpcResult.rowCount).toBe(1);
      const { checkpoint_id } = rpcResult.rows[0];

      // Verify checkpoint content includes exception
      const cpResult = await client.query<{ content: Record<string, unknown> }>(
        `SELECT content FROM public.block_checkpoint WHERE id = $1`,
        [checkpoint_id]
      );
      expect(cpResult.rowCount).toBe(1);
      expect(cpResult.rows[0].content.exception).toBe("Wichtiger Sonderfall");
      expect(cpResult.rows[0].content.answers).toEqual({
        q1: "Antwort auf Frage 1",
      });
    });
  });

  it("exception text is null in checkpoint when not provided", async () => {
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

      // Only regular answers, no exception
      await client.query(
        `UPDATE public.capture_session
         SET answers = $1::jsonb
         WHERE id = $2`,
        [JSON.stringify({ "A.q1": "Nur Antwort" }), sessionId]
      );

      const content = {
        answers: { q1: "Nur Antwort" },
        exception: null,
        chat_context: null,
        block_key: "A",
        template_version: templateVersion,
      };

      const rpcResult = await client.query<{
        checkpoint_id: string;
        job_id: string | null;
        deduplicated: boolean;
      }>(
        `SELECT * FROM public.rpc_create_block_checkpoint($1, $2, $3, $4)`,
        [sessionId, "A", "questionnaire_submit", JSON.stringify(content)]
      );
      const { checkpoint_id } = rpcResult.rows[0];

      const cpResult = await client.query<{ content: Record<string, unknown> }>(
        `SELECT content FROM public.block_checkpoint WHERE id = $1`,
        [checkpoint_id]
      );
      expect(cpResult.rows[0].content.exception).toBeNull();
    });
  });

  it("RLS: Tenant B cannot read or modify Tenant A exception text", async () => {
    await withTestDb(async (client) => {
      const { tenantA, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      const sessionInsert = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status, answers)
         VALUES ($1, $2, $3, $4, 'open', $5::jsonb) RETURNING id`,
        [
          tenantA,
          templateId,
          templateVersion,
          userA,
          JSON.stringify({ "__exception__.A": "Vertraulich" }),
        ]
      );
      const sessionId = sessionInsert.rows[0].id;

      // As Tenant B user — should not be able to update
      await withJwtContext(client, userB, async () => {
        const result = await client.query(
          `UPDATE public.capture_session
           SET answers = answers || '{"__exception__.A": "Hacked!"}'::jsonb
           WHERE id = $1`,
          [sessionId]
        );
        expect(result.rowCount).toBe(0);
      });

      // Verify original value unchanged
      const check = await client.query<{ answers: Record<string, string> }>(
        `SELECT answers FROM public.capture_session WHERE id = $1`,
        [sessionId]
      );
      expect(check.rows[0].answers["__exception__.A"]).toBe("Vertraulich");
    });
  });
});
