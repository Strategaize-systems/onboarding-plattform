import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

describe("RLS Isolation — Cross-Tenant Leseverbot", () => {
  it("tenant_admin von Tenant A sieht capture_session nur von Tenant A", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, userB } = await seedTestTenants(client);

      // Je eine capture_session pro Tenant als Superuser anlegen (ohne RLS).
      const sessionA = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session (tenant_id, owner_user_id, status)
         VALUES ($1, $2, 'draft')
         RETURNING id`,
        [tenantA, userA]
      );
      const sessionB = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session (tenant_id, owner_user_id, status)
         VALUES ($1, $2, 'draft')
         RETURNING id`,
        [tenantB, userB]
      );
      expect(sessionA.rows[0].id).toBeDefined();
      expect(sessionB.rows[0].id).toBeDefined();

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
      const { tenantA, tenantB, userA, userB } = await seedTestTenants(client);

      // Capture-Sessions fuer beide Tenants anlegen.
      const sessionA = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session (tenant_id, owner_user_id, status)
         VALUES ($1, $2, 'draft') RETURNING id`,
        [tenantA, userA]
      );
      const sessionB = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session (tenant_id, owner_user_id, status)
         VALUES ($1, $2, 'draft') RETURNING id`,
        [tenantB, userB]
      );

      // Block-Checkpoints anlegen — Voraussetzung fuer knowledge_unit.
      const cpA = await client.query<{ id: string }>(
        `INSERT INTO public.block_checkpoint (tenant_id, capture_session_id, block_key, checkpoint_type, payload)
         VALUES ($1, $2, 'block_1', 'block_submit', '{}'::jsonb)
         RETURNING id`,
        [tenantA, sessionA.rows[0].id]
      );
      const cpB = await client.query<{ id: string }>(
        `INSERT INTO public.block_checkpoint (tenant_id, capture_session_id, block_key, checkpoint_type, payload)
         VALUES ($1, $2, 'block_1', 'block_submit', '{}'::jsonb)
         RETURNING id`,
        [tenantB, sessionB.rows[0].id]
      );

      // Knowledge-Units pro Tenant.
      const kuA = await client.query<{ id: string }>(
        `INSERT INTO public.knowledge_unit
           (tenant_id, block_checkpoint_id, capture_session_id, block_key,
            unit_type, source, content, confidence)
         VALUES ($1, $2, $3, 'block_1', 'fact', 'questionnaire', 'content-A', 'high')
         RETURNING id`,
        [tenantA, cpA.rows[0].id, sessionA.rows[0].id]
      );
      const kuB = await client.query<{ id: string }>(
        `INSERT INTO public.knowledge_unit
           (tenant_id, block_checkpoint_id, capture_session_id, block_key,
            unit_type, source, content, confidence)
         VALUES ($1, $2, $3, 'block_1', 'fact', 'questionnaire', 'content-B', 'high')
         RETURNING id`,
        [tenantB, cpB.rows[0].id, sessionB.rows[0].id]
      );

      // Validation-Layer-Audit pro KU.
      await client.query(
        `INSERT INTO public.validation_layer (tenant_id, knowledge_unit_id, action, payload)
         VALUES ($1, $2, 'created', '{}'::jsonb), ($3, $4, 'created', '{}'::jsonb)`,
        [tenantA, kuA.rows[0].id, tenantB, kuB.rows[0].id]
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
      const { tenantB, userA } = await seedTestTenants(client);

      await withJwtContext(client, userA, async () => {
        await expect(
          client.query(
            `INSERT INTO public.capture_session (tenant_id, owner_user_id, status)
             VALUES ($1, $2, 'draft')`,
            [tenantB, userA]
          )
        ).rejects.toThrowError(/row-level security|violates/i);
      });
    });
  });
});
