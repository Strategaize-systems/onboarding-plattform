/**
 * V7 Pen-Test-Fixture (SLC-134 MT-1).
 *
 * Test-Helper fuer Pen-Test-Suite-Erweiterung Public-Signup-Caller. Kapselt
 * Test-Partner-Anlage, Test-Service-Key-ENV-Override, Pending-Signup-Seeding
 * und aggressive Cleanup-Hooks gegen die Coolify-Postgres-DB.
 *
 * Konventionen (per `coolify-test-setup.md` + `feedback_no_local_docker`):
 *   - Tests laufen im node:20-Container im Coolify-Netzwerk.
 *   - TEST_DATABASE_URL = direkte Postgres-Connection (postgres-Superuser).
 *   - Pen-Tests rufen echte Route-Handler auf — Cleanup MUSS pollution-frei sein.
 *
 * Pattern-Reuse:
 *   - Test-Prefix `v7-pentest-` (analog V6-Pen-Test `v6-rls-`).
 *   - hashWithSha256 aus `@/lib/auth/service-key` (kein doppelter Hash-Impl).
 *   - createSafeClient via pg.Client direkt (umgeht createAdminClient-ENV-Drift).
 */

import { randomBytes } from "node:crypto";
import { Client } from "pg";

import { hashWithSha256 } from "@/lib/auth/service-key";

const TEST_PREFIX = "v7-pentest-";

export interface TestPartner {
  tenant_id: string;
  partner_org_id: string;
  slug: string;
  contact_email: string;
  legal_name: string;
}

export interface SetupTestPartnerOptions {
  slug?: string;
  legalName?: string;
  contactEmail?: string;
}

/**
 * Oeffnet eine pg-Connection gegen `process.env.TEST_DATABASE_URL`.
 * Caller muss `await client.end()` am Ende rufen — keine impliziten
 * Transactions, weil Pen-Tests echte Route-Handler aufrufen die ihre
 * eigenen Connections oeffnen.
 */
export async function openTestDbClient(): Promise<Client> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. V7 Pen-Tests require a direct Postgres connection."
    );
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/**
 * Legt einen Test-Partner-Tenant + partner_organization-Row an. Slug
 * beginnt mit `v7-pentest-` damit Cleanup-Hooks ihn deterministisch
 * finden. Caller bekommt IDs + Slug zurueck.
 *
 * Default-Werte koennen ueberschrieben werden (z.B. fuer Slug-Konflikt-Tests).
 */
export async function setupTestPartner(
  options: SetupTestPartnerOptions = {}
): Promise<TestPartner> {
  const suffix = randomBytes(6).toString("hex");
  const slug = options.slug ?? `${TEST_PREFIX}${suffix}`;
  const legalName = options.legalName ?? `Pentest Partner ${suffix}`;
  const contactEmail = options.contactEmail ?? `${TEST_PREFIX}${suffix}@example.test`;

  const client = await openTestDbClient();
  try {
    const tenantRes = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, language, tenant_kind)
       VALUES ($1, 'de', 'partner_organization')
       RETURNING id`,
      [`Pentest Tenant ${suffix}`]
    );
    const tenant_id = tenantRes.rows[0].id;

    const orgRes = await client.query<{ id: string }>(
      `INSERT INTO partner_organization
         (tenant_id, legal_name, display_name, partner_kind, contact_email, country, slug)
       VALUES ($1, $2, $3, 'tax_advisor', $4, 'DE', $5)
       RETURNING id`,
      [tenant_id, legalName, legalName, contactEmail, slug]
    );

    return {
      tenant_id,
      partner_org_id: orgRes.rows[0].id,
      slug,
      contact_email: contactEmail,
      legal_name: legalName,
    };
  } finally {
    await client.end();
  }
}

/**
 * Loescht alle abhaengigen Test-Daten fuer einen einzelnen Partner-Tenant.
 *
 * Reihenfolge (CASCADE-Tatsache nutzen, aber auth.users explizit weil
 * profiles.id_fkey ON DELETE CASCADE auf auth.users zeigt, NICHT umgekehrt):
 *   1. auth.users IN (SELECT id FROM profiles WHERE tenant_id IN tenants-to-delete)
 *      → CASCADE loescht profiles selbst.
 *   2. tenants WHERE id = partner_tenant_id OR parent_partner_tenant_id = partner
 *      → CASCADE loescht partner_organization, partner_client_mapping (beide Seiten),
 *        pending_signup, plus alle Client-Tenants (mit eigenem CASCADE-Lauf).
 *
 * Idempotent: kann mehrfach aufgerufen werden ohne Fehler. Liefert kein Result.
 */
export async function cleanupTestPartner(tenant_id: string): Promise<void> {
  const client = await openTestDbClient();
  try {
    await client.query(
      `DELETE FROM auth.users
       WHERE id IN (
         SELECT id FROM profiles
         WHERE tenant_id = $1
            OR tenant_id IN (
              SELECT client_tenant_id FROM partner_client_mapping
              WHERE partner_tenant_id = $1
            )
       )`,
      [tenant_id]
    );

    await client.query(
      `DELETE FROM tenants
       WHERE id = $1 OR parent_partner_tenant_id = $1`,
      [tenant_id]
    );
  } finally {
    await client.end();
  }
}

/**
 * Defense-in-Depth-Cleanup. Loescht ALLES was mit `v7-pentest-` markiert ist.
 * Wird in `beforeAll`/`afterAll` empfohlen, falls vorherige Test-Laeufe
 * Daten hinterlassen haben (z.B. abgebrochener Test ohne afterEach-Cleanup).
 */
export async function cleanupAllPentestArtifacts(): Promise<void> {
  const client = await openTestDbClient();
  try {
    // 1. auth.users hinter pentest-Tenants
    await client.query(
      `DELETE FROM auth.users
       WHERE id IN (
         SELECT p.id FROM profiles p
         JOIN tenants t ON t.id = p.tenant_id
         WHERE t.name LIKE 'Pentest Tenant %'
            OR t.parent_partner_tenant_id IN (
              SELECT tenant_id FROM partner_organization WHERE slug LIKE $1
            )
       )`,
      [`${TEST_PREFIX}%`]
    );

    // 2. tenants per Slug-Match auf partner_organization
    await client.query(
      `DELETE FROM tenants
       WHERE id IN (
         SELECT tenant_id FROM partner_organization WHERE slug LIKE $1
       )`,
      [`${TEST_PREFIX}%`]
    );

    // Hinweis: error_log-Rows werden NICHT pauschal geloescht. V7 ist im
    // Internal-Test-Mode (BL-104 Stop-Gate), aber wir vermeiden den
    // Pauschal-DELETE trotzdem — Pen-Tests pruefen Audit-Trail via
    // `fetchAuditLogRows(since)` mit Time-Window, kein Cleanup-Bedarf.
  } finally {
    await client.end();
  }
}

/**
 * Setzt PUBLIC_SIGNUP_SERVICE_KEY auf einen bekannten Test-Wert. Caller
 * MUSS die zurueckgegebene restore-Funktion am Test-Ende aufrufen, damit
 * Folge-Tests den ENV-State nicht erben.
 *
 * @param overrideKey - Optionaler Override (z.B. fuer Multi-Key-Tests).
 *                      Default: stabiler pentest-Key, lang genug fuer
 *                      timing-safe-equal (32 Bytes hex = 64 Zeichen).
 */
export function setupTestServiceKey(overrideKey?: string): {
  key: string;
  restore: () => void;
} {
  const previous = process.env.PUBLIC_SIGNUP_SERVICE_KEY;
  const key =
    overrideKey ?? "pentest-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  process.env.PUBLIC_SIGNUP_SERVICE_KEY = key;
  return {
    key,
    restore: () => {
      if (previous === undefined) {
        delete process.env.PUBLIC_SIGNUP_SERVICE_KEY;
      } else {
        process.env.PUBLIC_SIGNUP_SERVICE_KEY = previous;
      }
    },
  };
}

export interface PendingSignupSeed {
  pending_id: string;
  token_clear: string;
  token_hash: string;
  expires_at: string;
}

export interface SetupPendingSignupOptions {
  firstName?: string;
  lastName?: string;
  companyName?: string | null;
  dsgvoConsentVersion?: string;
  /** TTL in hours (default 24). Negative Werte = bereits-expired (siehe `setupExpiredPendingSignup`). */
  ttlHours?: number;
}

/**
 * Schreibt eine `pending_signup`-Row direkt in die DB (umgeht den Route-
 * Handler, weil der Test ja gerade den Handler testen will). Returnt
 * sowohl Klartext-Token als auch Hash, damit Tests beide Pfade
 * (Email-Link mit Klartext + DB-Lookup per Hash) abdecken koennen.
 */
export async function setupTestPendingSignup(
  partner_tenant_id: string,
  email_lower: string,
  options: SetupPendingSignupOptions = {}
): Promise<PendingSignupSeed> {
  const token_clear = randomBytes(32).toString("hex");
  const token_hash = hashWithSha256(token_clear);
  const ttlHours = options.ttlHours ?? 24;
  const expiresMs = Date.now() + ttlHours * 60 * 60 * 1000;
  const expiresAt = new Date(expiresMs).toISOString();

  const client = await openTestDbClient();
  try {
    const res = await client.query<{ id: string; expires_at: string }>(
      `INSERT INTO pending_signup
         (partner_tenant_id, email_lower, first_name, last_name, company_name,
          dsgvo_consent_text_version, verify_token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, expires_at`,
      [
        partner_tenant_id,
        email_lower.toLowerCase(),
        options.firstName ?? "Test",
        options.lastName ?? "Pentest",
        options.companyName ?? null,
        options.dsgvoConsentVersion ?? "v1-2026-05",
        token_hash,
        expiresAt,
      ]
    );
    return {
      pending_id: res.rows[0].id,
      token_clear,
      token_hash,
      expires_at: res.rows[0].expires_at,
    };
  } finally {
    await client.end();
  }
}

/**
 * Schreibt eine `pending_signup`-Row mit `expires_at` in der Vergangenheit
 * (Default 1h ago). Status bleibt 'pending' — der Caller-Test prueft
 * dass der Verify-Endpoint die Expiry-Detection korrekt vornimmt.
 */
export async function setupExpiredPendingSignup(
  partner_tenant_id: string,
  email_lower: string,
  hoursAgo: number = 1
): Promise<PendingSignupSeed> {
  return setupTestPendingSignup(partner_tenant_id, email_lower, {
    ttlHours: -hoursAgo,
  });
}

/**
 * Legt einen vollstaendigen "bereits-verifizierten" Mandanten unter dem
 * gegebenen Partner an: auth.users + profiles + Client-Tenant (tenant_kind
 * = 'partner_client') + partner_client_mapping (status='accepted').
 *
 * Benoetigt fuer Pen-Test Case 5 (Doppel-Signup nach Verify → 409).
 * Returnt client_tenant_id + auth_user_id zum spaeteren Cleanup.
 */
export async function setupVerifiedClientMandant(
  partner_tenant_id: string,
  email_lower: string
): Promise<{ client_tenant_id: string; auth_user_id: string }> {
  const suffix = randomBytes(4).toString("hex");
  const lowered = email_lower.toLowerCase();
  const client = await openTestDbClient();
  try {
    // Schritt 1: Client-Tenant zuerst (handle_new_user-Trigger validiert
    // tenant_id-Existenz im naechsten Schritt).
    const tenantRes = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, language, tenant_kind, parent_partner_tenant_id)
       VALUES ($1, 'de', 'partner_client', $2)
       RETURNING id`,
      [`Pentest Verified Client ${suffix}`, partner_tenant_id]
    );
    const client_tenant_id = tenantRes.rows[0].id;

    // Schritt 2: auth.users mit tenant_id + role im user_metadata —
    // handle_new_user-Trigger braucht das, sonst RAISE EXCEPTION P0422.
    // Trigger erzeugt zugleich die profiles-Row.
    const metaJson = JSON.stringify({
      tenant_id: client_tenant_id,
      role: "tenant_admin",
      first_name: "Pentest",
      last_name: "Verified",
    });
    const userRes = await client.query<{ id: string }>(
      `INSERT INTO auth.users (instance_id, id, aud, role, email,
                                encrypted_password, email_confirmed_at,
                                raw_app_meta_data, raw_user_meta_data,
                                created_at, updated_at)
       VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
               'authenticated', 'authenticated', $1,
               '$2a$10$verifiedmandantpwhashplaceholder0000000000', NOW(),
               '{}'::jsonb, $2::jsonb, NOW(), NOW())
       RETURNING id`,
      [lowered, metaJson]
    );
    const auth_user_id = userRes.rows[0].id;

    await client.query(
      `INSERT INTO partner_client_mapping
         (partner_tenant_id, client_tenant_id, invitation_status,
          invitation_source, accepted_at, dsgvo_consent_text_version,
          dsgvo_consent_accepted_at)
       VALUES ($1, $2, 'accepted', 'self_signup', NOW(), 'v1-2026-05', NOW())`,
      [partner_tenant_id, client_tenant_id]
    );

    return { client_tenant_id, auth_user_id };
  } finally {
    await client.end();
  }
}

/**
 * Markiert eine bestehende Pending-Row als `verified` (Doppel-Klick-Test).
 * Caller hat zuvor `setupTestPendingSignup` aufgerufen und besitzt die
 * pending_id.
 */
export async function markPendingAsVerified(pending_id: string): Promise<void> {
  const client = await openTestDbClient();
  try {
    await client.query(
      `UPDATE pending_signup
       SET status = 'verified', verified_at = NOW()
       WHERE id = $1`,
      [pending_id]
    );
  } finally {
    await client.end();
  }
}

export interface AuditLogRow {
  id: string;
  level: string;
  source: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Liefert error_log-Rows mit `metadata->>'category' = $category` die nach
 * `since` entstanden. Pen-Tests nutzen das, um Audit-Log-Eintrag pro Test
 * zu verifizieren.
 *
 * Wichtig: error_log hat KEINE `category`-Spalte — Filter erfolgt ueber
 * `metadata->>'category'` (Production-Code schreibt es als JSONB-Feld).
 * `source` ist die DB-Spalte (z.B. "api/public/signup").
 */
export async function fetchAuditLogRows(
  category: string,
  since: Date
): Promise<AuditLogRow[]> {
  const client = await openTestDbClient();
  try {
    const res = await client.query<AuditLogRow>(
      `SELECT id, level, source, message, metadata, created_at
       FROM error_log
       WHERE metadata->>'category' = $1
         AND created_at >= $2
       ORDER BY created_at ASC`,
      [category, since.toISOString()]
    );
    return res.rows;
  } finally {
    await client.end();
  }
}

/**
 * Pruefung gegen Klartext-PII im Audit-Log (DSGVO-Negativ-Probe).
 * RegEx-Pattern erkennt:
 *   - Email-Adressen (lokale Komponente + @ + Domain)
 *   - IPv4-Adressen (4 Dot-getrennte Bytes)
 *
 * Die Function nimmt das vollstaendige `metadata`-Objekt (JSONB) und
 * serialisiert es zu String, damit auch verschachtelte Strings erfasst werden.
 */
export function containsPlaintextPII(
  metadata: Record<string, unknown> | null | undefined
): { hasEmail: boolean; hasIp: boolean; rawText: string } {
  if (!metadata) {
    return { hasEmail: false, hasIp: false, rawText: "" };
  }
  const raw = JSON.stringify(metadata);
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw);
  const hasIp = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(raw);
  return { hasEmail, hasIp, rawText: raw };
}
