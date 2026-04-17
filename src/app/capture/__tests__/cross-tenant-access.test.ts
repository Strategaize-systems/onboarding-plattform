import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

describe("Capture Session — Cross-Tenant Access", () => {
  it("tenant_admin of Tenant A cannot read capture_session of Tenant B", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      // Create sessions for both tenants as superuser
      const sessionA = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );
      const sessionB = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantB, templateId, templateVersion, userB]
      );

      const sessionBId = sessionB.rows[0].id;

      // As tenant_admin of A, try to read B's session
      await withJwtContext(client, userA, async () => {
        const result = await client.query<{ id: string }>(
          `SELECT id FROM public.capture_session WHERE id = $1`,
          [sessionBId]
        );
        expect(result.rowCount).toBe(0);
      });

      // As tenant_admin of A, only see own session
      await withJwtContext(client, userA, async () => {
        const result = await client.query<{ id: string; tenant_id: string }>(
          `SELECT id, tenant_id FROM public.capture_session`
        );
        expect(result.rowCount).toBe(1);
        expect(result.rows[0].tenant_id).toBe(tenantA);
      });
    });
  });

  it("tenant_admin of Tenant B cannot read block_checkpoint of Tenant A", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      // Session for A
      const sessionA = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );
      const sessionAId = sessionA.rows[0].id;

      // Checkpoint for A's session
      await client.query(
        `INSERT INTO public.block_checkpoint
           (tenant_id, capture_session_id, block_key, checkpoint_type, content, content_hash, created_by)
         VALUES ($1, $2, 'A', 'questionnaire_submit', '{}', 'hash123', $3)`,
        [tenantA, sessionAId, userA]
      );

      // As B, should see 0 checkpoints
      await withJwtContext(client, userB, async () => {
        const result = await client.query(
          `SELECT id FROM public.block_checkpoint`
        );
        expect(result.rowCount).toBe(0);
      });
    });
  });
});
