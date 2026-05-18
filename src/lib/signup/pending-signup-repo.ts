/**
 * Pending-Signup Repository (V7 SLC-132 FEAT-051 / FEAT-053-Storage).
 *
 * Wrappt die drei DB-Operationen rund um `public.pending_signup`:
 * - `insertPendingSignup` — Public-Signup-Endpoint (SLC-132 MT-6).
 * - `findActivePendingSignup` — Doppel-Signup-Check (SLC-132 MT-6) +
 *   Verify-Endpoint (SLC-133).
 * - `findPendingByTokenHash` — Verify-Endpoint (SLC-133).
 *
 * Nutzt `createAdminClient()` (service_role, bypasses RLS) weil die
 * Tabelle in Migration 098 RLS-enabled wurde und KEINE Public-Policies
 * hat (default deny per DEC-129).
 *
 * DSGVO-Hinweis: Klartext-Token wird NIE in DB gespeichert — der Caller
 * berechnet SHA-256-Hash via `hashWithSha256` aus `@/lib/auth/service-key`
 * und uebergibt nur `verify_token_hash`. Klartext-Email landet als
 * `email_lower` (lowercase normalisiert vom Caller) — DSGVO-erforderlich
 * fuer Doppel-Signup-Check, aber Audit-Log nutzt SHA-256-Hash davon.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface PendingSignupRow {
  id: string;
  partner_tenant_id: string;
  email_lower: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  dsgvo_consent_text_version: string;
  dsgvo_consent_accepted_at: string;
  verify_token_hash: string;
  expires_at: string;
  status: "pending" | "verified" | "expired";
  verified_at: string | null;
  created_at: string;
}

export interface InsertPendingSignupInput {
  partner_tenant_id: string;
  email_lower: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  dsgvo_consent_text_version: string;
  verify_token_hash: string;
  /** TTL in hours, e.g. 24 per DEC-131. */
  ttl_hours: number;
}

export interface InsertPendingSignupResult {
  id: string;
  expires_at: string;
}

/**
 * Inserts a new pending_signup row with `expires_at = now() + ttl_hours`.
 * Throws on UNIQUE violation (partner_tenant_id + email_lower already
 * has a pending row) — the caller maps that to HTTP 409 per DEC-135.
 */
export async function insertPendingSignup(
  input: InsertPendingSignupInput
): Promise<InsertPendingSignupResult> {
  const admin = createAdminClient();
  const expiresAtIso = new Date(
    Date.now() + input.ttl_hours * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await admin
    .from("pending_signup")
    .insert({
      partner_tenant_id: input.partner_tenant_id,
      email_lower: input.email_lower,
      first_name: input.first_name,
      last_name: input.last_name,
      company_name: input.company_name,
      dsgvo_consent_text_version: input.dsgvo_consent_text_version,
      verify_token_hash: input.verify_token_hash,
      expires_at: expiresAtIso,
      // status defaults to 'pending' via DEFAULT; dsgvo_consent_accepted_at
      // defaults to now() via DEFAULT.
    })
    .select("id, expires_at")
    .single();

  if (error) {
    throw error;
  }

  return { id: data.id, expires_at: data.expires_at };
}

/**
 * Liefert die ALIVE pending_signup-Row (status='pending' AND expires_at > now())
 * fuer (partner_tenant_id, email_lower). Lower-Case-Email-Vergleich erwartet —
 * Caller normalisiert vor Aufruf. Liefert null wenn nichts gefunden ODER nur
 * eine expired-Row existiert (Re-Signup nach Expiry erlaubt per DEC-131).
 */
export async function findActivePendingSignup(
  partner_tenant_id: string,
  email_lower: string
): Promise<PendingSignupRow | null> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("pending_signup")
    .select(
      "id, partner_tenant_id, email_lower, first_name, last_name, company_name, " +
        "dsgvo_consent_text_version, dsgvo_consent_accepted_at, verify_token_hash, " +
        "expires_at, status, verified_at, created_at"
    )
    .eq("partner_tenant_id", partner_tenant_id)
    .eq("email_lower", email_lower)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as PendingSignupRow | null) ?? null;
}

/**
 * Lookup-by-Hash fuer SLC-133 Verify-Endpoint. Liefert pending-Row falls
 * status='pending' UND expires_at > now(). Andernfalls (Hash unbekannt /
 * Row expired / Row already verified) → null.
 *
 * Status='verified' wird bewusst NICHT mitgeliefert — SLC-133 verlangt fuer
 * Idempotent-Branch (Doppel-Klick auf Verify-Link) eine separate Query, die
 * `status='verified'` matcht. V7-Scope: Token-Replay-Schutz, Status-spezifische
 * Erkennung erfolgt im Caller.
 */
export async function findPendingByTokenHash(
  token_hash: string
): Promise<PendingSignupRow | null> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("pending_signup")
    .select(
      "id, partner_tenant_id, email_lower, first_name, last_name, company_name, " +
        "dsgvo_consent_text_version, dsgvo_consent_accepted_at, verify_token_hash, " +
        "expires_at, status, verified_at, created_at"
    )
    .eq("verify_token_hash", token_hash)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as PendingSignupRow | null) ?? null;
}
