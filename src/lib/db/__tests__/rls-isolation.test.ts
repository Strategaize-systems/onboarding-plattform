import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

describe("RLS Isolation — Cross-Tenant Leseverbot", () => {
  it("tenant_admin von Tenant A sieht capture_session nur von Tenant A", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      // Je eine capture_session pro Tenant als Superuser anlegen (ohne RLS).
      await client.query(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open'),
                ($5, $2, $3, $6, 'open')`,
        [tenantA, templateId, templateVersion, userA, tenantB, userB]
      );

      // Lese als tenant_admin von A.
      await withJwtContext(client, userA, async () => {
        const visible = await client.query<{ id: string; tenant_id: string }>(
          `SELECT id, tenant_id FROM public.capture_session ORDER BY id`
        );
        expect(visible.rowCount).toBe(1);
        expect(visible.rows[0].tenant_id).toBe(tenantA);
      });

      // Lese als tenant_admin von B.
      await withJwtContext(client, userB, async () => {
        const visible = await client.query<{ id: string; tenant_id: string }>(
          `SELECT id, tenant_id FROM public.capture_session ORDER BY id`
        );
        expect(visible.rowCount).toBe(1);
        expect(visible.rows[0].tenant_id).toBe(tenantB);
      });
    });
  });

  it("tenant_admin von A sieht knowledge_unit und validation_layer nur von A", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      // Capture-Sessions
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

      // Block-Checkpoints
      const cpA = await client.query<{ id: string }>(
        `INSERT INTO public.block_checkpoint
           (tenant_id, capture_session_id, block_key, checkpoint_type,
            content, content_hash, created_by)
         VALUES ($1, $2, 'block_1', 'questionnaire_submit',
                 '{}'::jsonb, 'hash-a', $3)
         RETURNING id`,
        [tenantA, sessionA.rows[0].id, userA]
      );
      const cpB = await client.query<{ id: string }>(
        `INSERT INTO public.block_checkpoint
           (tenant_id, capture_session_id, block_key, checkpoint_type,
            content, content_hash, created_by)
         VALUES ($1, $2, 'block_1', 'questionnaire_submit',
                 '{}'::jsonb, 'hash-b', $3)
         RETURNING id`,
        [tenantB, sessionB.rows[0].id, userB]
      );

      // Knowledge-Units
      const kuA = await client.query<{ id: string }>(
        `INSERT INTO public.knowledge_unit
           (tenant_id, capture_session_id, block_checkpoint_id, block_key,
            unit_type, source, title, body, confidence)
         VALUES ($1, $2, $3, 'block_1',
                 'observation', 'questionnaire', 'title-A', 'body-A', 'high')
         RETURNING id`,
        [tenantA, sessionA.rows[0].id, cpA.rows[0].id]
      );
      const kuB = await client.query<{ id: string }>(
        `INSERT INTO public.knowledge_unit
           (tenant_id, capture_session_id, block_checkpoint_id, block_key,
            unit_type, source, title, body, confidence)
         VALUES ($1, $2, $3, 'block_1',
                 'observation', 'questionnaire', 'title-B', 'body-B', 'high')
         RETURNING id`,
        [tenantB, sessionB.rows[0].id, cpB.rows[0].id]
      );

      // Validation-Layer-Audit pro KU
      await client.query(
        `INSERT INTO public.validation_layer
           (tenant_id, knowledge_unit_id, reviewer_user_id, reviewer_role, action)
         VALUES ($1, $2, $3, 'tenant_admin', 'comment'),
                ($4, $5, $6, 'tenant_admin', 'comment')`,
        [tenantA, kuA.rows[0].id, userA, tenantB, kuB.rows[0].id, userB]
      );

      await withJwtContext(client, userA, async () => {
        const ku = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.knowledge_unit`
        );
        expect(ku.rowCount).toBe(1);
        expect(ku.rows[0].tenant_id).toBe(tenantA);

        const vl = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.validation_layer`
        );
        expect(vl.rowCount).toBe(1);
        expect(vl.rows[0].tenant_id).toBe(tenantA);
      });

      await withJwtContext(client, userB, async () => {
        const ku = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.knowledge_unit`
        );
        expect(ku.rowCount).toBe(1);
        expect(ku.rows[0].tenant_id).toBe(tenantB);
      });
    });
  });

  it("tenant_admin von A kann keine capture_session fuer Tenant B anlegen (WITH CHECK)", async () => {
    await withTestDb(async (client) => {
      const { tenantB, userA, templateId, templateVersion } =
        await seedTestTenants(client);

      await withJwtContext(client, userA, async () => {
        await expect(
          client.query(
            `INSERT INTO public.capture_session
               (tenant_id, template_id, template_version, owner_user_id, status)
             VALUES ($1, $2, $3, $4, 'open')`,
            [tenantB, templateId, templateVersion, userA]
          )
        ).rejects.toThrowError(/row-level security|violates/i);
      });
    });
  });
});
