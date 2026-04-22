import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

describe("RLS Isolation — meeting_guide", () => {
  it("tenant_admin sieht nur Meeting Guides des eigenen Tenants", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      // Capture-Sessions als Superuser anlegen
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

      // Meeting Guides als Superuser anlegen
      await client.query(
        `INSERT INTO public.meeting_guide
           (tenant_id, capture_session_id, goal, topics, created_by)
         VALUES ($1, $2, 'Goal A', '[]'::jsonb, $3),
                ($4, $5, 'Goal B', '[]'::jsonb, $6)`,
        [
          tenantA, sessionA.rows[0].id, userA,
          tenantB, sessionB.rows[0].id, userB,
        ]
      );

      // User A sieht nur Guide A
      await withJwtContext(client, userA, async () => {
        const visible = await client.query<{ tenant_id: string; goal: string }>(
          `SELECT tenant_id, goal FROM public.meeting_guide`
        );
        expect(visible.rowCount).toBe(1);
        expect(visible.rows[0].tenant_id).toBe(tenantA);
        expect(visible.rows[0].goal).toBe("Goal A");
      });

      // User B sieht nur Guide B
      await withJwtContext(client, userB, async () => {
        const visible = await client.query<{ tenant_id: string; goal: string }>(
          `SELECT tenant_id, goal FROM public.meeting_guide`
        );
        expect(visible.rowCount).toBe(1);
        expect(visible.rows[0].tenant_id).toBe(tenantB);
        expect(visible.rows[0].goal).toBe("Goal B");
      });
    });
  });

  it("tenant_admin kann keinen Meeting Guide fuer fremden Tenant anlegen", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, templateId, templateVersion } =
        await seedTestTenants(client);

      // Session fuer Tenant B anlegen (Superuser)
      const sessionB = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantB, templateId, templateVersion, userA]
      );

      // User A versucht Guide fuer Tenant B anzulegen
      await withJwtContext(client, userA, async () => {
        await client.query(`SAVEPOINT try_cross_tenant_insert`);
        let errorMessage: string | null = null;
        try {
          await client.query(
            `INSERT INTO public.meeting_guide
               (tenant_id, capture_session_id, goal, topics, created_by)
             VALUES ($1, $2, 'Cross-tenant', '[]'::jsonb, $3)`,
            [tenantB, sessionB.rows[0].id, userA]
          );
        } catch (e) {
          errorMessage = (e as Error).message;
        }
        await client.query(`ROLLBACK TO SAVEPOINT try_cross_tenant_insert`);

        expect(errorMessage).not.toBeNull();
        expect(errorMessage!).toMatch(/row-level security|violates/i);
      });
    });
  });

  it("UNIQUE constraint auf capture_session_id verhindert doppelte Guides", async () => {
    await withTestDb(async (client) => {
      const { tenantA, userA, templateId, templateVersion } =
        await seedTestTenants(client);

      const session = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );

      // Erster Guide: ok
      await client.query(
        `INSERT INTO public.meeting_guide
           (tenant_id, capture_session_id, goal, topics, created_by)
         VALUES ($1, $2, 'First', '[]'::jsonb, $3)`,
        [tenantA, session.rows[0].id, userA]
      );

      // Zweiter Guide fuer gleiche Session: muss fehlschlagen
      let errorMessage: string | null = null;
      try {
        await client.query(
          `INSERT INTO public.meeting_guide
             (tenant_id, capture_session_id, goal, topics, created_by)
           VALUES ($1, $2, 'Duplicate', '[]'::jsonb, $3)`,
          [tenantA, session.rows[0].id, userA]
        );
      } catch (e) {
        errorMessage = (e as Error).message;
      }

      expect(errorMessage).not.toBeNull();
      expect(errorMessage!).toMatch(/unique|duplicate/i);
    });
  });

  it("topics JSONB akzeptiert block_key Zuordnung", async () => {
    await withTestDb(async (client) => {
      const { tenantA, userA, templateId, templateVersion } =
        await seedTestTenants(client);

      const session = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );

      const topics = JSON.stringify([
        {
          key: "topic-1",
          title: "Nachfolgeplanung",
          description: "Status der Nachfolgeplanung",
          questions: ["Gibt es einen Nachfolger?"],
          block_key: "C",
          order: 1,
        },
        {
          key: "topic-2",
          title: "Marktposition",
          description: "Aktuelle Wettbewerbssituation",
          questions: ["Wie ist die Marktposition?", "Welche Trends?"],
          block_key: "A",
          order: 2,
        },
      ]);

      const result = await client.query<{ topics: unknown }>(
        `INSERT INTO public.meeting_guide
           (tenant_id, capture_session_id, goal, topics, created_by)
         VALUES ($1, $2, 'Test Guide', $3::jsonb, $4)
         RETURNING topics`,
        [tenantA, session.rows[0].id, topics, userA]
      );

      const savedTopics = result.rows[0].topics as Array<{
        key: string;
        block_key: string;
      }>;
      expect(savedTopics).toHaveLength(2);
      expect(savedTopics[0].block_key).toBe("C");
      expect(savedTopics[1].block_key).toBe("A");
    });
  });
});
