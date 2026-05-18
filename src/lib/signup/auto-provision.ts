/**
 * Auto-Provision Pure-Function fuer V7 Self-Signup-Verify (SLC-133 MT-1 / FEAT-053).
 *
 * Pattern aus src/app/accept-invitation/[token]/actions.ts (V6 SLC-103)
 * + src/app/partner/dashboard/mandanten/actions.ts (V6 SLC-103 inviteMandant)
 * via .claude/rules/strategaize-pattern-reuse.md.
 *
 * Wird vom Verify-Endpoint (`/auth/verify-signup`) NACH Lookup einer
 * pending-Row aufgerufen. Provisioniert in 4 Schritten:
 *
 *   1. INSERT tenants (kind='partner_client', parent_partner_tenant_id=partner)
 *      -> new_tenant_id (gen_random_uuid DEFAULT)
 *   2. auth.admin.createUser({ email, password=random hex, email_confirm: true,
 *        user_metadata: { tenant_id, role: 'tenant_admin', first_name, last_name } })
 *      -> handle_new_user-Trigger legt profiles-Row automatisch an
 *         (id=new_user_id, tenant_id, email, role). ISSUE-051-Resolution: die
 *         Names landen via user_metadata, denn `profiles` hat KEINE
 *         first_name/last_name-Spalten — die existierende Lead-Push-Funktion
 *         (workers/lead-push/handle-job.ts `deriveNameFromUser`) liest die
 *         Werte sowieso aus user_metadata, mit Fallback auf Email-Local-Part.
 *         Damit ist V7-Self-Signup-Pfad sauber befuellt, V6-Bestand bleibt
 *         unbetroffen (Backfill V7.1 optional, BL bleibt offen).
 *      -> Email-Konflikt cross-Partner (msg enthaelt 'already'/'exists'/'registered')
 *         => Discriminated-Union `email_conflict_cross_partner` + Rollback Schritt 1.
 *      -> Anderer Fehler (z.B. self-hosted GoTrue-Outage) => `user_create_failed`
 *         + Rollback Schritt 1.
 *   3. INSERT partner_client_mapping
 *        (partner_tenant_id=pending.partner_tenant_id, client_tenant_id=new_tenant_id,
 *         invitation_status='accepted', invitation_source='self_signup',
 *         invited_by_user_id=NULL, accepted_at=now(),
 *         dsgvo_consent_text_version, dsgvo_consent_accepted_at)
 *      -> Trigger check_partner_client_mapping_tenant_kinds erzwingt
 *         partner_kind='partner_organization' + client_kind='partner_client'.
 *      -> Fehler => `mapping_insert_failed` + Rollback Schritt 2 + Schritt 1.
 *   4. UPDATE pending_signup SET status='verified', verified_at=now()
 *        WHERE id=pending_signup_id AND status='pending'
 *      -> Atomar via status-Filter: zweiter parallel-Klick auf gleichen Verify-
 *         Link sieht 0 rows updated (Race-Guard).
 *      -> Bei updateCount=0 (z.B. parallel-COMMIT-Race oder pending bereits
 *         verified durch Race): Return ok=true (Provisioning steht), aber
 *         metadata-Flag `pending_already_verified=true` (Verify-Endpoint-Caller
 *         kann das als idempotenten Re-Klick logging).
 *      -> Bei harter Fehler-Antwort (z.B. DB-Outage): captureException +
 *         akzeptieren — tenant/user/mapping existieren bereits, pending kann
 *         spaeter via Manual-Cleanup auf verified gesetzt werden.
 *
 * Rollback-Disziplin:
 * Self-hosted Supabase + GoTrue sind NICHT in derselben PostgreSQL-Transaction.
 * Bei Misserfolg in Schritt N werden die Schritte 1..N-1 via Compensating-Delete
 * zurueckgerollt (Pattern aus inviteMandant V6 SLC-103). Wir rollen GoTrue-User
 * via `auth.admin.deleteUser` zurueck, nicht via PostgreSQL DELETE auf
 * `auth.users` (das umgeht GoTrue's eigene Cleanup-Routinen).
 *
 * Die "PostgreSQL-Transaction-Rollback nur unserer INSERTs"-Formulierung aus
 * Slice MT-1 verlangt logische Konsistenz, nicht eine literale BEGIN..COMMIT.
 * Pattern existiert in inviteMandant V6 SLC-103 mit den gleichen Compensating-
 * Deletes — Reuse statt neu erfinden.
 */

import { randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

export interface AutoProvisionInput {
  /** Pending-Signup-ID, wird nach Erfolg auf status='verified' gesetzt. */
  pending_signup_id: string;
  /** Partner-Tenant (partner_organization), unter dem der neue Mandant landet. */
  partner_tenant_id: string;
  /** Klartext-Email (lower-case) aus pending_signup.email_lower. */
  email_lower: string;
  /** Vorname aus pending_signup.first_name. ISSUE-051 Resolution-Quelle. */
  first_name: string;
  /** Nachname aus pending_signup.last_name. ISSUE-051 Resolution-Quelle. */
  last_name: string;
  /** Optionaler Firmenname (Tenant-Display-Name). NULL => Fallback "first last". */
  company_name: string | null;
  /** DSGVO-Consent-Version-String aus pending_signup. */
  dsgvo_consent_text_version: string;
  /** DSGVO-Consent-Akzeptanz-Zeitstempel aus pending_signup. */
  dsgvo_consent_accepted_at: string;
}

export type AutoProvisionError =
  | "email_conflict_cross_partner"
  | "user_create_failed"
  | "tenant_insert_failed"
  | "mapping_insert_failed";

export type AutoProvisionResult =
  | {
      ok: true;
      new_tenant_id: string;
      new_user_id: string;
      /** `true` wenn UPDATE pending_signup 0 rows getroffen hat (Race-Guard). */
      pending_already_verified: boolean;
    }
  | {
      ok: false;
      error: AutoProvisionError;
    };

type AdminClient = ReturnType<typeof createAdminClient>;

function isEmailConflictMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already") ||
    m.includes("exists") ||
    m.includes("registered") ||
    m.includes("duplicate")
  );
}

/**
 * Default-Tenant-Display-Name. Bevorzugt `company_name`, sonst
 * `"first_name last_name"`. Beide Eingaben sind NOT NULL in pending_signup
 * gem. Migration 098 — first_name/last_name liegen immer vor.
 */
function deriveTenantName(input: AutoProvisionInput): string {
  if (input.company_name && input.company_name.trim().length > 0) {
    return input.company_name.trim();
  }
  return `${input.first_name.trim()} ${input.last_name.trim()}`.trim();
}

export async function provisionSelfSignupTenant(
  input: AutoProvisionInput
): Promise<AutoProvisionResult> {
  const admin: AdminClient = createAdminClient();

  // ── Schritt 1 — INSERT tenants (kind='partner_client') ──────────────────
  const tenantName = deriveTenantName(input);
  const { data: tenantRow, error: tenantErr } = await admin
    .from("tenants")
    .insert({
      name: tenantName,
      language: "de",
      tenant_kind: "partner_client",
      parent_partner_tenant_id: input.partner_tenant_id,
    })
    .select("id")
    .single();

  if (tenantErr || !tenantRow) {
    return { ok: false, error: "tenant_insert_failed" };
  }
  const newTenantId = tenantRow.id as string;

  // ── Schritt 2 — auth.admin.createUser ───────────────────────────────────
  // Random-Password — Mandant setzt eigenes Passwort via Magic-Link-Flow
  // (`/auth/set-password?session=<onetime>`) im naechsten Step des Verify-
  // Endpoints. Crypto.randomBytes(24).hex liefert 48 Hex-Zeichen Entropie.
  const password = randomBytes(24).toString("hex");

  const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
    email: input.email_lower,
    password,
    email_confirm: true,
    user_metadata: {
      tenant_id: newTenantId,
      role: "tenant_admin",
      first_name: input.first_name,
      last_name: input.last_name,
    },
  });

  if (createErr || !createdAuth?.user) {
    // Rollback Schritt 1: delete new tenant.
    await admin.from("tenants").delete().eq("id", newTenantId);

    const message = createErr?.message ?? "";
    if (isEmailConflictMessage(message)) {
      return { ok: false, error: "email_conflict_cross_partner" };
    }
    return { ok: false, error: "user_create_failed" };
  }
  const newUserId = createdAuth.user.id;

  // ── Schritt 3 — INSERT partner_client_mapping ───────────────────────────
  const { error: mappingErr } = await admin
    .from("partner_client_mapping")
    .insert({
      partner_tenant_id: input.partner_tenant_id,
      client_tenant_id: newTenantId,
      invited_by_user_id: null,
      invitation_status: "accepted",
      accepted_at: new Date().toISOString(),
      invitation_source: "self_signup",
      dsgvo_consent_text_version: input.dsgvo_consent_text_version,
      dsgvo_consent_accepted_at: input.dsgvo_consent_accepted_at,
    });

  if (mappingErr) {
    // Rollback Schritt 2 (GoTrue-User) + Schritt 1 (tenants).
    // auth.admin.deleteUser cascade-loescht profiles via FK ON DELETE CASCADE
    // (siehe schema.sql `profiles.id REFERENCES auth.users ON DELETE CASCADE`).
    try {
      await admin.auth.admin.deleteUser(newUserId);
    } catch {
      // Cleanup-Fehler still tolerieren — Manual-Cleanup-Pflicht bei Drift.
    }
    await admin.from("tenants").delete().eq("id", newTenantId);
    return { ok: false, error: "mapping_insert_failed" };
  }

  // ── Schritt 4 — UPDATE pending_signup status='verified' ─────────────────
  // Status-Filter `eq('status', 'pending')` macht den UPDATE atomar gegen
  // den Race-Doppel-Klick: parallel-COMMIT erster Verify-Calls setzt
  // status='verified', zweiter Call sieht 0 rows updated und kann seinen
  // Caller per `pending_already_verified=true` informieren.
  const { data: updateRows, error: updateErr } = await admin
    .from("pending_signup")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
    })
    .eq("id", input.pending_signup_id)
    .eq("status", "pending")
    .select("id");

  // Hartfehler beim UPDATE: tenant/user/mapping existieren bereits — KEIN
  // Rollback. Manual-Cleanup-Pflicht bei DB-Outage.
  // (Behaviour aligned mit V7-Tradeoff DEC-129: best-effort Pending-Markierung.)
  const pendingAlreadyVerified =
    updateErr !== null || (updateRows ?? []).length === 0;

  return {
    ok: true,
    new_tenant_id: newTenantId,
    new_user_id: newUserId,
    pending_already_verified: pendingAlreadyVerified,
  };
}
