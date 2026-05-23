// E2E-Test-Akteur fuer SLC-140 Visual-Regression — partner_client-Mandant
// mit aktiver Diagnose-Session, gegen Coolify-Supabase-DB.
//
// Pattern-Referenzen:
//  - reference_playwright_browser_smoke (Auth-User via Admin-API, Setup-Cleanup)
//  - reference_magic_link_smoke_pattern (Admin-API generate_link + /auth/callback)
//  - reference_coolify_test_setup (pg-Client gegen TEST_DATABASE_URL)
//  - sql/fixtures/slc-105-qa-fixture.sql (Tenant + Branding-Pattern, V6.3)
//
// WICHTIG: Direct-INSERT in auth.users ist verboten (Memory
// feedback_supabase_auth_user_null_tokens) — wir nutzen die Admin-API.
// handle_new_user-Trigger legt profiles aus raw_user_meta_data automatisch an.

import type { Page } from "@playwright/test";
import { Client } from "pg";
import { withDb } from "./db";
import type { E2EEnv } from "./env";

const TEST_ID_PREFIX = "e2e1";

export type DiagnoseStage = "start" | "run" | "bericht";

export type PartnerClientActor = {
  partnerTenantId: string;
  mandantTenantId: string;
  userId: string;
  email: string;
  password: string;
  captureSessionId?: string;
  templateId?: string;
};

function uuid(suffix: string): string {
  // Stabile Test-UUIDs mit e2e1-Prefix damit Cleanup zielsicher ist.
  // suffix muss 12 hex Zeichen lang sein.
  if (suffix.length !== 12 || !/^[0-9a-f]+$/.test(suffix)) {
    throw new Error(`uuid suffix must be 12 hex chars, got: ${suffix}`);
  }
  return `${TEST_ID_PREFIX}aaaa-0000-0000-0000-${suffix}`;
}

function randomHex(bytes: number): string {
  let hex = "";
  for (let i = 0; i < bytes; i++) {
    hex += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  }
  return hex;
}

async function adminApi(
  env: E2EEnv,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const url = `${env.supabaseUrl.replace(/\/$/, "")}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });
}

async function fetchLatestTemplateId(client: Client, slug: string): Promise<string> {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM public.template WHERE slug = $1 ORDER BY created_at DESC LIMIT 1`,
    [slug],
  );
  if (res.rows.length === 0) {
    throw new Error(`Template not found for slug=${slug}. Seed partner_diagnostic before running E2E.`);
  }
  return res.rows[0].id;
}

/**
 * Setup-Sequenz fuer Visual-Regression-Snapshots:
 *  - Partner-Org-Tenant (partner_organization)
 *  - Partner-Branding-Config (Logo-Slot + Display-Name)
 *  - Partner-Client-Tenant (partner_client mit parent_partner_tenant_id)
 *  - Auth-User via Admin-API (user_metadata.tenant_id + role=tenant_admin)
 *    → handle_new_user-Trigger erzeugt profiles automatisch
 *  - Optional: capture_session in passendem Stage (start/run/bericht)
 *
 * @param stage  "start" → keine Session, "run" → status=in_progress mit 3 answers,
 *               "bericht" → status=finalized mit allen answers + ai_jobs done.
 */
export async function setupPartnerClientActor(
  env: E2EEnv,
  stage: DiagnoseStage,
): Promise<PartnerClientActor> {
  const runId = randomHex(6); // 12 hex chars
  const partnerTenantId = uuid(runId);
  const mandantTenantId = uuid(randomHex(6));
  const email = `e2e-${runId}@strategaize.test`;
  const password = `E2eTemp-${randomHex(8)}!`;

  // 1. Tenants + Branding via pg direkt (umgeht RLS dank service-role-Postgres-Connection).
  const { templateId } = await withDb(env.testDatabaseUrl, async (client) => {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.tenants (id, name, language, tenant_kind, parent_partner_tenant_id, onboarding_wizard_state)
       VALUES ($1, $2, 'de', 'partner_organization', NULL, 'completed')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [partnerTenantId, `E2E Partner ${runId}`],
    );
    await client.query(
      `INSERT INTO public.partner_branding_config (partner_tenant_id, primary_color, display_name)
       VALUES ($1, '#4454b8', $2)
       ON CONFLICT (partner_tenant_id) DO UPDATE
         SET primary_color = EXCLUDED.primary_color, display_name = EXCLUDED.display_name`,
      [partnerTenantId, `E2E Steuerberater ${runId}`],
    );
    await client.query(
      `INSERT INTO public.tenants (id, name, language, tenant_kind, parent_partner_tenant_id, onboarding_wizard_state)
       VALUES ($1, $2, 'de', 'partner_client', $3, 'completed')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [mandantTenantId, `E2E Mandant ${runId}`, partnerTenantId],
    );
    const templateId = await fetchLatestTemplateId(client, "partner_diagnostic");
    await client.query("COMMIT");
    return { templateId };
  });

  // 2. Auth-User via Admin-API (user_metadata triggert handle_new_user → profiles).
  const userResp = await adminApi(env, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        tenant_id: mandantTenantId,
        role: "tenant_admin",
      },
    }),
  });
  if (!userResp.ok) {
    throw new Error(`Admin-API create user failed (${userResp.status}): ${await userResp.text()}`);
  }
  const userBody = (await userResp.json()) as { id: string };
  const userId = userBody.id;

  // 3. Stage-spezifisches Setup.
  let captureSessionId: string | undefined;
  if (stage === "run" || stage === "bericht") {
    captureSessionId = await withDb(env.testDatabaseUrl, async (client) => {
      const status = stage === "bericht" ? "finalized" : "in_progress";
      const sessionRes = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, 'v1', $3, $4)
         RETURNING id`,
        [mandantTenantId, templateId, userId, status],
      );
      return sessionRes.rows[0].id;
    });
  }

  return {
    partnerTenantId,
    mandantTenantId,
    userId,
    email,
    password,
    captureSessionId,
    templateId,
  };
}

/**
 * Login-Flow via Admin-API Magic-Link + /auth/callback-Navigation.
 *
 * Pflicht: Browser-Navigate (NICHT fetch), damit Cookies aus der Response
 * im Browser-Context persistiert werden. Memory-Hinweis aus
 * reference_magic_link_smoke_pattern.
 *
 * Wichtige Implementations-Detail (auth/callback/route.ts:13-22):
 * Die /auth/callback-Route IGNORIERT den `next`-Query-Param und redirected
 * hard auf /dashboard. Daher: Callback abwarten, dann explizit zu next
 * navigieren. Cookies sind nach Callback gesetzt, alle Folge-Navs sind auth'd.
 */
export async function loginViaMagicLink(
  page: Page,
  env: E2EEnv,
  email: string,
  next: string = "/dashboard",
): Promise<void> {
  const linkResp = await adminApi(env, "/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!linkResp.ok) {
    throw new Error(`generate_link failed (${linkResp.status}): ${await linkResp.text()}`);
  }
  const linkBody = (await linkResp.json()) as { hashed_token?: string; properties?: { hashed_token?: string } };
  const hashedToken = linkBody.hashed_token ?? linkBody.properties?.hashed_token;
  if (!hashedToken) {
    throw new Error(`generate_link response missing hashed_token: ${JSON.stringify(linkBody)}`);
  }

  const callbackUrl = `${env.baseUrl.replace(/\/$/, "")}/auth/callback?token_hash=${encodeURIComponent(
    hashedToken,
  )}&type=magiclink`;
  await page.goto(callbackUrl);
  // Callback redirected hart auf /dashboard. Warte darauf, dann navigate zu next.
  await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 15_000 });
  if (next !== "/dashboard") {
    await page.goto(`${env.baseUrl.replace(/\/$/, "")}${next}`);
  }
}

/**
 * Cleanup in umgekehrter Reihenfolge. ON DELETE CASCADE auf profiles/capture_session
 * via tenants_id räumt Sub-Tabellen mit.
 */
export async function cleanupActor(env: E2EEnv, actor: PartnerClientActor): Promise<void> {
  await withDb(env.testDatabaseUrl, async (client) => {
    // ai_jobs.capture_session_id liegt in payload JSONB. Einfacher per
    // tenant_id raeumen — alles zu dem Test-Mandanten weg.
    await client.query(`DELETE FROM public.ai_jobs WHERE tenant_id = $1`, [actor.mandantTenantId]);
    if (actor.captureSessionId) {
      await client.query(`DELETE FROM public.capture_session WHERE id = $1`, [actor.captureSessionId]);
    }
    await client.query(`DELETE FROM public.profiles WHERE id = $1`, [actor.userId]);
  });

  const delResp = await adminApi(env, `/auth/v1/admin/users/${actor.userId}`, { method: "DELETE" });
  if (!delResp.ok && delResp.status !== 404) {
    // Nicht-fatal: weiterleiten als Warning. Cleanup soll robust sein.
    console.warn(`cleanupActor: admin delete user ${actor.userId} returned ${delResp.status}`);
  }

  await withDb(env.testDatabaseUrl, async (client) => {
    await client.query(`DELETE FROM public.partner_branding_config WHERE partner_tenant_id = $1`, [
      actor.partnerTenantId,
    ]);
    await client.query(`DELETE FROM public.tenants WHERE id = $1`, [actor.mandantTenantId]);
    await client.query(`DELETE FROM public.tenants WHERE id = $1`, [actor.partnerTenantId]);
  });
}
