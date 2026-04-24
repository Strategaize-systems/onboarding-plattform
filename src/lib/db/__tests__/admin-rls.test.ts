import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

describe("Admin RLS — Cross-Tenant Knowledge Unit Access", () => {
  it("strategaize_admin kann KUs aus beiden Tenants lesen", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      // strategaize_admin-User anlegen
      const adminInsert = await client.query<{ id: string }>(
        `INSERT INTO auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at
         )
         VALUES (
           '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
           'authenticated', 'authenticated',
           'test-strategaize-admin-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
           '{}'::jsonb, jsonb_build_object('role', 'strategaize_admin'),
           now(), now()
         )
         RETURNING id`
      );
      const adminUserId = adminInsert.rows[0].id;

      // Profile fuer admin manuell setzen (Trigger setzt evtl. kein tenant_id)
      await client.query(
        `UPDATE public.profiles
         SET role = 'strategaize_admin', tenant_id = NULL
         WHERE id = $1`,
        [adminUserId]
      );

      // Sessions + Checkpoints + KUs fuer beide Tenants
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

      // KUs fuer beide Tenants
      await client.query(
        `INSERT INTO public.knowledge_unit
           (tenant_id, capture_session_id, block_checkpoint_id, block_key,
            unit_type, source, title, body, confidence)
         VALUES
           ($1, $2, $3, 'block_1', 'observation', 'ai_draft', 'KU-A', 'body-A', 'high'),
           ($4, $5, $6, 'block_1', 'observation', 'ai_draft', 'KU-B', 'body-B', 'medium')`,
        [
          tenantA, sessionA.rows[0].id, cpA.rows[0].id,
          tenantB, sessionB.rows[0].id, cpB.rows[0].id,
        ]
      );

      // strategaize_admin sieht BEIDE KUs — Filter auf Test-Tenants, damit Bestandsdaten die Assertion nicht brechen (ISSUE-018)
      await withJwtContext(client, adminUserId, async () => {
        const result = await client.query<{ title: string; tenant_id: string }>(
          `SELECT title, tenant_id FROM public.knowledge_unit
           WHERE tenant_id IN ($1, $2)
           ORDER BY title`,
          [tenantA, tenantB]
        );
        expect(result.rowCount).toBe(2);
        expect(result.rows[0].title).toBe("KU-A");
        expect(result.rows[1].title).toBe("KU-B");
        expect(result.rows[0].tenant_id).toBe(tenantA);
        expect(result.rows[1].tenant_id).toBe(tenantB);
      });

      // tenant_admin von A sieht NUR KU-A — Filter auf Test-Tenants (ISSUE-018)
      await withJwtContext(client, userA, async () => {
        const result = await client.query<{ title: string }>(
          `SELECT title FROM public.knowledge_unit
           WHERE tenant_id IN ($1, $2)`,
          [tenantA, tenantB]
        );
        expect(result.rowCount).toBe(1);
        expect(result.rows[0].title).toBe("KU-A");
      });
    });
  });

  it("strategaize_admin kann validation_layer cross-tenant lesen", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      // strategaize_admin
      const adminInsert = await client.query<{ id: string }>(
        `INSERT INTO auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at
         )
         VALUES (
           '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
           'authenticated', 'authenticated',
           'test-admin-vl-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
           '{}'::jsonb, jsonb_build_object('role', 'strategaize_admin'),
           now(), now()
         )
         RETURNING id`
      );
      const adminUserId = adminInsert.rows[0].id;

      await client.query(
        `UPDATE public.profiles
         SET role = 'strategaize_admin', tenant_id = NULL
         WHERE id = $1`,
        [adminUserId]
      );

      // Setup: sessions, checkpoints, KUs, validation entries
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

      const cpA = await client.query<{ id: string }>(
        `INSERT INTO public.block_checkpoint
           (tenant_id, capture_session_id, block_key, checkpoint_type,
            content, content_hash, created_by)
         VALUES ($1, $2, 'block_1', 'questionnaire_submit', '{}'::jsonb, 'hash-a-vl', $3)
         RETURNING id`,
        [tenantA, sessionA.rows[0].id, userA]
      );
      const cpB = await client.query<{ id: string }>(
        `INSERT INTO public.block_checkpoint
           (tenant_id, capture_session_id, block_key, checkpoint_type,
            content, content_hash, created_by)
         VALUES ($1, $2, 'block_1', 'questionnaire_submit', '{}'::jsonb, 'hash-b-vl', $3)
         RETURNING id`,
        [tenantB, sessionB.rows[0].id, userB]
      );

      const kuA = await client.query<{ id: string }>(
        `INSERT INTO public.knowledge_unit
           (tenant_id, capture_session_id, block_checkpoint_id, block_key,
            unit_type, source, title, body, confidence)
         VALUES ($1, $2, $3, 'block_1', 'finding', 'ai_draft', 'KU-VL-A', 'body', 'high')
         RETURNING id`,
        [tenantA, sessionA.rows[0].id, cpA.rows[0].id]
      );
      const kuB = await client.query<{ id: string }>(
        `INSERT INTO public.knowledge_unit
           (tenant_id, capture_session_id, block_checkpoint_id, block_key,
            unit_type, source, title, body, confidence)
         VALUES ($1, $2, $3, 'block_1', 'finding', 'ai_draft', 'KU-VL-B', 'body', 'high')
         RETURNING id`,
        [tenantB, sessionB.rows[0].id, cpB.rows[0].id]
      );

      await client.query(
        `INSERT INTO public.validation_layer
           (tenant_id, knowledge_unit_id, reviewer_user_id, reviewer_role, action)
         VALUES ($1, $2, $3, 'tenant_admin', 'comment'),
                ($4, $5, $6, 'tenant_admin', 'comment')`,
        [tenantA, kuA.rows[0].id, userA, tenantB, kuB.rows[0].id, userB]
      );

      // strategaize_admin sieht BEIDE validation_layer-Eintraege — Filter auf Test-Tenants (ISSUE-018)
      await withJwtContext(client, adminUserId, async () => {
        const result = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.validation_layer
           WHERE tenant_id IN ($1, $2)
           ORDER BY tenant_id`,
          [tenantA, tenantB]
        );
        expect(result.rowCount).toBe(2);
      });

      // tenant_admin von A sieht nur eigene — Filter auf Test-Tenants (ISSUE-018)
      await withJwtContext(client, userA, async () => {
        const result = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.validation_layer
           WHERE tenant_id IN ($1, $2)`,
          [tenantA, tenantB]
        );
        expect(result.rowCount).toBe(1);
        expect(result.rows[0].tenant_id).toBe(tenantA);
      });
    });
  });
});
