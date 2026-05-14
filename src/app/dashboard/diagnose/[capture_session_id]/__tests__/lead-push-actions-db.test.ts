import { describe, it, expect } from "vitest";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";

/**
 * V6 SLC-106 MT-5 — DB-contract-Tests fuer requestLeadPush Server Action.
 *
 * Pattern-Reuse aus partners-actions-db.test.ts + mandanten-actions-db.test.ts.
 * Wir verifizieren die SQL-Semantik (Schema + Constraints + Idempotenz +
 * Compensating-Action-Path) die requestLeadPush voraussetzt — der Server-
 * Action-Aufruf selbst (mit Next-Cookies + Auth-Gate + HTTP-Push) ist nicht
 * gemockt; das laeuft im Live-Smoke MT-12.
 *
 * 8 Faelle (Slice-Spec):
 *   1. Happy DB-Sequenz — INSERT consent + INSERT audit(pending) + UPDATE audit(success).
 *   2. Idempotency UNIQUE auf capture_session_id — 2. consent-INSERT scheitert mit 23505.
 *   3. CHECK constraint `status` — invalid-Wert wird rejected.
 *   4. CHECK constraint `attempt_number BETWEEN 1 AND 3` — Wert 4 rejected.
 *   5. FK consent_id ON DELETE RESTRICT — DELETE consent mit audit blockiert (23503).
 *   6. ON DELETE CASCADE capture_session — DELETE Session (ohne audit) raeumt consent ab.
 *   7. ai_jobs lead_push_retry — neuer job_type-CHECK whitelisted, INSERT funktioniert.
 *   8. UPDATE audit failed — pending → failed + error_message UPDATE funktioniert.
 */

interface LeadPushFixture {
  strategaizeAdmin: string;
  partnerTenantId: string;
  mandantTenantId: string;
  mandantUserId: string;
  captureSessionId: string;
}

async function seedLeadPushFixture(client: Client): Promise<LeadPushFixture> {
  const saRes = await client.query<{ id: string }>(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     )
     VALUES (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated',
       'slc106-sa-' || substr(gen_random_uuid()::text, 1, 8) || '@v6.test', '',
       '{}'::jsonb, $1::jsonb,
       now(), now()
     )
     RETURNING id`,
    [JSON.stringify({ role: "strategaize_admin" })],
  );
  const strategaizeAdmin = saRes.rows[0].id;
  await client.query(
    `UPDATE public.profiles SET role='strategaize_admin', tenant_id=NULL WHERE id=$1`,
    [strategaizeAdmin],
  );

  // Partner-Organisation-Tenant + Row
  const pTenant = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, created_by)
     VALUES ('SLC106 Partner', 'de', 'partner_organization', $1)
     RETURNING id`,
    [strategaizeAdmin],
  );
  const partnerTenantId = pTenant.rows[0].id;
  await client.query(
    `INSERT INTO public.partner_organization
       (tenant_id, legal_name, display_name, partner_kind, contact_email,
        country, created_by_admin_user_id)
       VALUES ($1, 'SLC106 Partner Legal', 'SLC106 Partner', 'tax_advisor',
               'slc106-partner@kanzlei.local', 'DE', $2)`,
    [partnerTenantId, strategaizeAdmin],
  );

  // Mandant (partner_client) Tenant
  const mTenant = await client.query<{ id: string }>(
    `INSERT INTO public.tenants
       (name, language, tenant_kind, parent_partner_tenant_id, created_by)
     VALUES ('SLC106 Mandant', 'de', 'partner_client', $1, $2)
     RETURNING id`,
    [partnerTenantId, strategaizeAdmin],
  );
  const mandantTenantId = mTenant.rows[0].id;

  // Mandant-User
  const mUser = await client.query<{ id: string }>(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     )
     VALUES (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated',
       'slc106-mandant-' || substr(gen_random_uuid()::text, 1, 8) || '@v6.test', '',
       '{}'::jsonb, $1::jsonb,
       now(), now()
     )
     RETURNING id`,
    [JSON.stringify({ role: "tenant_admin", tenant_id: mandantTenantId })],
  );
  const mandantUserId = mUser.rows[0].id;
  await client.query(
    `INSERT INTO public.profiles (id, email, role, tenant_id)
       VALUES ($1, (SELECT email FROM auth.users WHERE id=$1), 'tenant_admin', $2)
       ON CONFLICT (id) DO UPDATE SET role='tenant_admin', tenant_id=$2`,
    [mandantUserId, mandantTenantId],
  );

  // Template (minimal)
  const tmpl = await client.query<{ id: string; version: string }>(
    `INSERT INTO public.template (slug, name, version, blocks)
     VALUES ('slc106-tmpl-' || substr(gen_random_uuid()::text, 1, 8),
             'SLC106 Template', '1.0.0', '[]'::jsonb)
     RETURNING id, version`,
  );

  // Capture-Session (status='finalized')
  const sess = await client.query<{ id: string }>(
    `INSERT INTO public.capture_session
       (tenant_id, template_id, template_version, owner_user_id, status)
     VALUES ($1, $2, $3, $4, 'finalized')
     RETURNING id`,
    [mandantTenantId, tmpl.rows[0].id, tmpl.rows[0].version, mandantUserId],
  );

  return {
    strategaizeAdmin,
    partnerTenantId,
    mandantTenantId,
    mandantUserId,
    captureSessionId: sess.rows[0].id,
  };
}

async function insertConsent(client: Client, fx: LeadPushFixture): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO public.lead_push_consent
       (capture_session_id, mandant_user_id, mandant_tenant_id,
        partner_tenant_id, consent_text_version)
     VALUES ($1, $2, $3, $4, 'v1-2026-05')
     RETURNING id`,
    [fx.captureSessionId, fx.mandantUserId, fx.mandantTenantId, fx.partnerTenantId],
  );
  return r.rows[0].id;
}

async function insertPendingAudit(
  client: Client,
  consentId: string,
  partnerTenantId: string,
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO public.lead_push_audit
       (consent_id, attempt_number, status,
        attribution_utm_source, attribution_utm_campaign, attribution_utm_medium)
     VALUES ($1, 1, 'pending', $2, 'partner_diagnostic_v1', 'referral')
     RETURNING id`,
    [consentId, `partner_${partnerTenantId}`],
  );
  return r.rows[0].id;
}

// ============================================================

describe("requestLeadPush — DB contract (V6 SLC-106 MT-5)", () => {
  it("happy path: INSERT consent + INSERT audit(pending) + UPDATE audit(success)", async () => {
    await withTestDb(async (client) => {
      const fx = await seedLeadPushFixture(client);
      const consentId = await insertConsent(client, fx);
      const auditId = await insertPendingAudit(client, consentId, fx.partnerTenantId);

      const auditCheck = await client.query<{
        consent_id: string;
        status: string;
        attempt_number: number;
        attribution_utm_source: string;
        attribution_utm_campaign: string;
        attribution_utm_medium: string;
      }>(
        `SELECT consent_id, status, attempt_number,
                attribution_utm_source, attribution_utm_campaign,
                attribution_utm_medium
           FROM public.lead_push_audit WHERE id = $1`,
        [auditId],
      );
      expect(auditCheck.rows[0].consent_id).toBe(consentId);
      expect(auditCheck.rows[0].status).toBe("pending");
      expect(auditCheck.rows[0].attempt_number).toBe(1);
      expect(auditCheck.rows[0].attribution_utm_source).toBe(
        `partner_${fx.partnerTenantId}`,
      );
      expect(auditCheck.rows[0].attribution_utm_campaign).toBe(
        "partner_diagnostic_v1",
      );
      expect(auditCheck.rows[0].attribution_utm_medium).toBe("referral");

      // Transition pending -> success
      const upRes = await client.query(
        `UPDATE public.lead_push_audit
            SET status = 'success',
                business_system_response_status = 200,
                business_system_contact_id = $1,
                business_system_was_new = true
          WHERE id = $2`,
        ["00000000-0000-0000-0000-000000000001", auditId],
      );
      expect(upRes.rowCount).toBe(1);

      const verify = await client.query<{
        status: string;
        business_system_contact_id: string;
        business_system_was_new: boolean;
      }>(
        `SELECT status, business_system_contact_id, business_system_was_new
           FROM public.lead_push_audit WHERE id = $1`,
        [auditId],
      );
      expect(verify.rows[0].status).toBe("success");
      expect(verify.rows[0].business_system_contact_id).toBe(
        "00000000-0000-0000-0000-000000000001",
      );
      expect(verify.rows[0].business_system_was_new).toBe(true);
    });
  });

  it("idempotency: 2. consent-INSERT mit gleicher capture_session_id wird durch UNIQUE-Index geblockt", async () => {
    await withTestDb(async (client) => {
      const fx = await seedLeadPushFixture(client);
      await insertConsent(client, fx);

      let uniqueErrorCode: string | null = null;
      await client.query("SAVEPOINT try_dup_consent");
      try {
        await client.query(
          `INSERT INTO public.lead_push_consent
             (capture_session_id, mandant_user_id, mandant_tenant_id,
              partner_tenant_id, consent_text_version)
           VALUES ($1, $2, $3, $4, 'v1-2026-05')`,
          [
            fx.captureSessionId,
            fx.mandantUserId,
            fx.mandantTenantId,
            fx.partnerTenantId,
          ],
        );
      } catch (e) {
        uniqueErrorCode = (e as { code?: string }).code ?? null;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_dup_consent");
      expect(uniqueErrorCode).toBe("23505");
    });
  });

  it("CHECK status: INSERT audit mit status='unknown' wird rejected", async () => {
    await withTestDb(async (client) => {
      const fx = await seedLeadPushFixture(client);
      const consentId = await insertConsent(client, fx);

      let checkErrorCode: string | null = null;
      await client.query("SAVEPOINT try_bad_status");
      try {
        await client.query(
          `INSERT INTO public.lead_push_audit
             (consent_id, status,
              attribution_utm_source, attribution_utm_campaign, attribution_utm_medium)
           VALUES ($1, 'unknown', $2, 'partner_diagnostic_v1', 'referral')`,
          [consentId, `partner_${fx.partnerTenantId}`],
        );
      } catch (e) {
        checkErrorCode = (e as { code?: string }).code ?? null;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_bad_status");
      expect(checkErrorCode).toBe("23514"); // CHECK violation
    });
  });

  it("CHECK attempt_number: INSERT audit mit attempt_number=4 wird rejected (BETWEEN 1 AND 3)", async () => {
    await withTestDb(async (client) => {
      const fx = await seedLeadPushFixture(client);
      const consentId = await insertConsent(client, fx);

      let checkErrorCode: string | null = null;
      await client.query("SAVEPOINT try_bad_attempt");
      try {
        await client.query(
          `INSERT INTO public.lead_push_audit
             (consent_id, attempt_number, status,
              attribution_utm_source, attribution_utm_campaign, attribution_utm_medium)
           VALUES ($1, 4, 'pending', $2, 'partner_diagnostic_v1', 'referral')`,
          [consentId, `partner_${fx.partnerTenantId}`],
        );
      } catch (e) {
        checkErrorCode = (e as { code?: string }).code ?? null;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_bad_attempt");
      expect(checkErrorCode).toBe("23514"); // CHECK violation
    });
  });

  it("FK consent_id ON DELETE RESTRICT: DELETE consent mit audit-Row blockiert (23503)", async () => {
    await withTestDb(async (client) => {
      const fx = await seedLeadPushFixture(client);
      const consentId = await insertConsent(client, fx);
      await insertPendingAudit(client, consentId, fx.partnerTenantId);

      let fkErrorCode: string | null = null;
      await client.query("SAVEPOINT try_delete_consent");
      try {
        await client.query(
          `DELETE FROM public.lead_push_consent WHERE id = $1`,
          [consentId],
        );
      } catch (e) {
        fkErrorCode = (e as { code?: string }).code ?? null;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_delete_consent");
      expect(fkErrorCode).toBe("23503"); // foreign_key_violation
    });
  });

  it("ON DELETE CASCADE capture_session → consent (ohne audit) wird automatisch entfernt", async () => {
    await withTestDb(async (client) => {
      const fx = await seedLeadPushFixture(client);
      const consentId = await insertConsent(client, fx);
      // BEWUSST kein audit anlegen — RESTRICT wuerde sonst blockieren.

      const beforeRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public.lead_push_consent
          WHERE id = $1`,
        [consentId],
      );
      expect(beforeRes.rows[0].count).toBe("1");

      await client.query(
        `DELETE FROM public.capture_session WHERE id = $1`,
        [fx.captureSessionId],
      );

      const afterRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public.lead_push_consent
          WHERE id = $1`,
        [consentId],
      );
      expect(afterRes.rows[0].count).toBe("0");
    });
  });

  it("ai_jobs lead_push_retry: INSERT mit neuem job_type aus CHECK-Whitelist funktioniert", async () => {
    await withTestDb(async (client) => {
      const fx = await seedLeadPushFixture(client);
      const consentId = await insertConsent(client, fx);
      const auditId = await insertPendingAudit(client, consentId, fx.partnerTenantId);

      const r = await client.query<{ id: string; job_type: string; payload: unknown }>(
        `INSERT INTO public.ai_jobs (tenant_id, job_type, payload, status)
           VALUES ($1, 'lead_push_retry', $2::jsonb, 'pending')
           RETURNING id, job_type, payload`,
        [
          fx.mandantTenantId,
          JSON.stringify({
            audit_id: auditId,
            attempt: 2,
            scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          }),
        ],
      );
      expect(r.rows[0].id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(r.rows[0].job_type).toBe("lead_push_retry");
      const payload = r.rows[0].payload as Record<string, unknown>;
      expect(payload.audit_id).toBe(auditId);
      expect(payload.attempt).toBe(2);

      // Sanity-Check: unbekannter job_type wird durch CHECK rejected
      let bogusCode: string | null = null;
      await client.query("SAVEPOINT try_bogus_job_type");
      try {
        await client.query(
          `INSERT INTO public.ai_jobs (tenant_id, job_type, payload, status)
             VALUES ($1, 'lead_push_bogus', '{}'::jsonb, 'pending')`,
          [fx.mandantTenantId],
        );
      } catch (e) {
        bogusCode = (e as { code?: string }).code ?? null;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_bogus_job_type");
      expect(bogusCode).toBe("23514");
    });
  });

  it("UPDATE audit failed: Transition pending → failed mit error_message funktioniert", async () => {
    await withTestDb(async (client) => {
      const fx = await seedLeadPushFixture(client);
      const consentId = await insertConsent(client, fx);
      const auditId = await insertPendingAudit(client, consentId, fx.partnerTenantId);

      const upRes = await client.query(
        `UPDATE public.lead_push_audit
            SET status = 'failed',
                error_message = 'HTTP 500'
          WHERE id = $1`,
        [auditId],
      );
      expect(upRes.rowCount).toBe(1);

      const verify = await client.query<{
        status: string;
        error_message: string;
        business_system_contact_id: string | null;
      }>(
        `SELECT status, error_message, business_system_contact_id
           FROM public.lead_push_audit WHERE id = $1`,
        [auditId],
      );
      expect(verify.rows[0].status).toBe("failed");
      expect(verify.rows[0].error_message).toBe("HTTP 500");
      expect(verify.rows[0].business_system_contact_id).toBeNull();
    });
  });
});
