import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

describe("RLS Isolation — dialogue_session", () => {
  it("tenant_admin sieht nur Dialogue Sessions des eigenen Tenants", async () => {
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

      // Dialogue Sessions als Superuser anlegen
      await client.query(
        `INSERT INTO public.dialogue_session
           (tenant_id, capture_session_id, jitsi_room_name, status,
            participant_a_user_id, participant_b_user_id, created_by)
         VALUES
           ($1, $2, 'room-a-' || gen_random_uuid(), 'planned', $3, $3, $3),
           ($4, $5, 'room-b-' || gen_random_uuid(), 'planned', $6, $6, $6)`,
        [
          tenantA, sessionA.rows[0].id, userA,
          tenantB, sessionB.rows[0].id, userB,
        ]
      );

      // User A sieht nur eigene Sessions
      await withJwtContext(client, userA, async () => {
        const visible = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.dialogue_session`
        );
        expect(visible.rowCount).toBe(1);
        expect(visible.rows[0].tenant_id).toBe(tenantA);
      });

      // User B sieht nur eigene Sessions
      await withJwtContext(client, userB, async () => {
        const visible = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.dialogue_session`
        );
        expect(visible.rowCount).toBe(1);
        expect(visible.rows[0].tenant_id).toBe(tenantB);
      });
    });
  });

  it("tenant_admin kann keine Dialogue Session fuer fremden Tenant anlegen", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      // Session fuer Tenant B anlegen (Superuser)
      const sessionB = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantB, templateId, templateVersion, userB]
      );

      // User A versucht Dialogue Session fuer Tenant B anzulegen
      await withJwtContext(client, userA, async () => {
        await client.query(`SAVEPOINT try_cross_tenant_insert`);
        let errorMessage: string | null = null;
        try {
          await client.query(
            `INSERT INTO public.dialogue_session
               (tenant_id, capture_session_id, jitsi_room_name, status,
                participant_a_user_id, participant_b_user_id, created_by)
             VALUES ($1, $2, 'room-cross-' || gen_random_uuid(), 'planned', $3, $3, $3)`,
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

  it("jitsi_room_name UNIQUE constraint verhindert doppelte Rooms", async () => {
    await withTestDb(async (client) => {
      const { tenantA, userA, templateId, templateVersion } =
        await seedTestTenants(client);

      const session = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );
      const session2 = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );

      const roomName = "unique-room-" + Date.now();

      // Erste Session: ok
      await client.query(
        `INSERT INTO public.dialogue_session
           (tenant_id, capture_session_id, jitsi_room_name, status,
            participant_a_user_id, participant_b_user_id, created_by)
         VALUES ($1, $2, $3, 'planned', $4, $4, $4)`,
        [tenantA, session.rows[0].id, roomName, userA]
      );

      // Zweite Session mit gleichem Room-Name: muss fehlschlagen
      let errorMessage: string | null = null;
      try {
        await client.query(
          `INSERT INTO public.dialogue_session
             (tenant_id, capture_session_id, jitsi_room_name, status,
              participant_a_user_id, participant_b_user_id, created_by)
           VALUES ($1, $2, $3, 'planned', $4, $4, $4)`,
          [tenantA, session2.rows[0].id, roomName, userA]
        );
      } catch (e) {
        errorMessage = (e as Error).message;
      }

      expect(errorMessage).not.toBeNull();
      expect(errorMessage!).toMatch(/unique|duplicate/i);
    });
  });

  it("status CHECK constraint validiert erlaubte Werte", async () => {
    await withTestDb(async (client) => {
      const { tenantA, userA, templateId, templateVersion } =
        await seedTestTenants(client);

      const session = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );

      // Gueltiger Status: ok
      const result = await client.query<{ status: string }>(
        `INSERT INTO public.dialogue_session
           (tenant_id, capture_session_id, jitsi_room_name, status,
            participant_a_user_id, participant_b_user_id, created_by)
         VALUES ($1, $2, 'room-status-test', 'planned', $3, $3, $3)
         RETURNING status`,
        [tenantA, session.rows[0].id, userA]
      );
      expect(result.rows[0].status).toBe("planned");

      // Ungueltiger Status: muss fehlschlagen
      let errorMessage: string | null = null;
      try {
        await client.query(
          `INSERT INTO public.dialogue_session
             (tenant_id, capture_session_id, jitsi_room_name, status,
              participant_a_user_id, participant_b_user_id, created_by)
           VALUES ($1, $2, 'room-status-bad', 'invalid_status', $3, $3, $3)`,
          [tenantA, session.rows[0].id, userA]
        );
      } catch (e) {
        errorMessage = (e as Error).message;
      }

      expect(errorMessage).not.toBeNull();
      expect(errorMessage!).toMatch(/check|violates/i);
    });
  });

  it("consent und summary JSONB Felder funktionieren korrekt", async () => {
    await withTestDb(async (client) => {
      const { tenantA, userA, templateId, templateVersion } =
        await seedTestTenants(client);

      const session = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );

      const summary = JSON.stringify({
        topics: [
          {
            key: "topic-1",
            title: "Nachfolge",
            highlights: ["Nachfolger identifiziert"],
            decisions: ["Uebergabe in 6 Monaten"],
            open_points: [],
          },
        ],
        overall: "Produktives Meeting",
      });

      const gaps = JSON.stringify([
        {
          topic_key: "topic-2",
          topic_title: "Marktposition",
          reason: "Nicht besprochen wegen Zeitmangel",
        },
      ]);

      const result = await client.query<{
        consent_a: boolean;
        consent_b: boolean;
        summary: unknown;
        gaps: unknown;
      }>(
        `INSERT INTO public.dialogue_session
           (tenant_id, capture_session_id, jitsi_room_name, status,
            participant_a_user_id, participant_b_user_id, created_by,
            consent_a, consent_b, summary, gaps)
         VALUES ($1, $2, 'room-jsonb-test', 'processed', $3, $3, $3,
                 true, true, $4::jsonb, $5::jsonb)
         RETURNING consent_a, consent_b, summary, gaps`,
        [tenantA, session.rows[0].id, userA, summary, gaps]
      );

      expect(result.rows[0].consent_a).toBe(true);
      expect(result.rows[0].consent_b).toBe(true);

      const savedSummary = result.rows[0].summary as { overall: string };
      expect(savedSummary.overall).toBe("Produktives Meeting");

      const savedGaps = result.rows[0].gaps as Array<{ topic_key: string }>;
      expect(savedGaps).toHaveLength(1);
      expect(savedGaps[0].topic_key).toBe("topic-2");
    });
  });
});
