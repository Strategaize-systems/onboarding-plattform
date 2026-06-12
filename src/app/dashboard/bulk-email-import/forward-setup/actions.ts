"use server";

// V9.1 SLC-V9.1-D MT-2 — Server-Actions fuer Forward-Bucket-Email Setup-UI (FEAT-079).
//
// Fuenf Actions fuer den GF-Setup-Flow:
//   - createInboundEndpoint   -> email_inbound_endpoint (status='pending_setup') + Setup-Token
//   - regenerateSetupToken    -> neuer Setup-Token + setup_token_created_at
//   - updateAllowlist         -> email_forward_allowlist Insert (Sender-Allowlist)
//   - sendTestEmail           -> Test-Mail an Catchall-Adresse + Inbound-Polling (MT-6)
//   - confirmDsgvoDisclaimer  -> DSGVO-Consent + status='active' (DEC-209, MIG-063)
//
// Auth-Gate: tenant_admin (GF) mit tenant_id. Writes via service_role-Client mit
// explizitem tenant_id-Scope (Pattern aus src/app/dashboard/diagnose/actions.ts).
// Audit durchgaengig via error_log (captureInfo) — OP hat kein audit_log (DEC-208/209).
//
// Inbound-Modell (as-built, IMP-1189-validiert): Single-IONOS-Mailbox, Endpoint-Resolve
// ueber To-Adress-Slug (bulk-<slug>@<INBOUND_CATCHALL_DOMAIN>), slug ist OHNE bulk--Prefix
// gespeichert, kein Token-Header (DEC-R1-3). Test-Send mailt die Catchall-Adresse von
// SMTP_FROM; Validierung = Sender-Allowlist im IMAP-Sync.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureInfo, captureException } from "@/lib/logger";
import { sendMail } from "@/lib/email";
import { pollForInboundEmail } from "@/lib/bulk-email/poll-inbound";
import {
  summarizeSetupIntent,
  SetupSuggestionError,
  type SetupSuggestion,
} from "@/lib/bulk-email/ai-assisted-setup";

const LOG_SOURCE = "setup-ui:forward-setup";
const SETUP_PATH = "/dashboard/bulk-email-import/forward-setup";

/** Local-Part-Format: bulk-<slug>, slug = 3-40 Zeichen [a-z0-9-]. */
const LOCAL_PART_RE = /^bulk-[a-z0-9-]{3,40}$/;
const ALLOWLIST_PATTERN_TYPES = ["domain", "email_exact"] as const;
type AllowlistPatternType = (typeof ALLOWLIST_PATTERN_TYPES)[number];

function inboundDomain(): string {
  return process.env.INBOUND_CATCHALL_DOMAIN ?? "bulk.strategaizetransition.com";
}

function senderAddress(): string {
  return process.env.SMTP_FROM ?? "noreply@strategaize.de";
}

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

interface AuthedTenantAdmin {
  userId: string;
  tenantId: string;
}

/** Auth-Gate: eingeloggter tenant_admin mit tenant_id. */
async function authorizeTenantAdmin(): Promise<
  { admin: AuthedTenantAdmin } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht authentifiziert" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  if (!profile) return { error: "Profil nicht gefunden" };
  if (profile.role !== "tenant_admin") {
    return { error: "Nur fuer Mandanten-Admin verfuegbar" };
  }
  if (!profile.tenant_id) return { error: "Kein Tenant" };

  return {
    admin: { userId: user.id, tenantId: profile.tenant_id as string },
  };
}

/** 32-byte URL-safe Random Setup-Token (base64url, ~43 Zeichen). */
function generateSetupToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Verifiziert, dass der Endpoint dem Tenant des Aufrufers gehoert. Returns slug/status
 * bei Erfolg, sonst null. Genutzt von allen Endpoint-bezogenen Actions als Ownership-Gate
 * (zusaetzlich zum stets gesetzten tenant_id-Filter auf der Mutation selbst).
 */
async function loadOwnedEndpoint(
  db: ReturnType<typeof createAdminClient>,
  endpointId: string,
  tenantId: string,
): Promise<{ slug: string; status: string } | null> {
  const { data } = await db
    .from("email_inbound_endpoint")
    .select("slug, status")
    .eq("id", endpointId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  return { slug: data.slug as string, status: data.status as string };
}

// ─── createInboundEndpoint ──────────────────────────────────────────────────

export async function createInboundEndpoint(input: {
  localPart: string;
  displayName?: string;
}): Promise<ActionResult<{ endpointId: string; setupToken: string; address: string }>> {
  const auth = await authorizeTenantAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };

  const localPart = input.localPart.trim().toLowerCase();
  if (!LOCAL_PART_RE.test(localPart)) {
    return {
      ok: false,
      error:
        "Local-Part muss dem Format bulk-<name> entsprechen (Name: 3-40 Zeichen, a-z 0-9 -).",
    };
  }
  const slug = localPart.slice("bulk-".length);

  const db = createAdminClient();
  const setupToken = generateSetupToken();
  const { data, error } = await db
    .from("email_inbound_endpoint")
    .insert({
      tenant_id: auth.admin.tenantId,
      slug,
      setup_token: setupToken,
      setup_token_created_at: new Date().toISOString(),
      status: "pending_setup",
      display_name: input.displayName?.trim() || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Dieser Local-Part ist bereits vergeben." };
    }
    captureException(error, {
      source: LOG_SOURCE,
      userId: auth.admin.userId,
      metadata: { action: "createInboundEndpoint", slug },
    });
    return { ok: false, error: "Endpoint konnte nicht angelegt werden." };
  }

  const endpointId = data.id as string;
  captureInfo("email_inbound_endpoint_created", {
    source: LOG_SOURCE,
    userId: auth.admin.userId,
    metadata: { endpoint_id: endpointId, slug, tenant_id: auth.admin.tenantId },
  });
  revalidatePath(SETUP_PATH);
  return {
    ok: true,
    endpointId,
    setupToken,
    address: `${localPart}@${inboundDomain()}`,
  };
}

// ─── regenerateSetupToken ───────────────────────────────────────────────────

export async function regenerateSetupToken(
  endpointId: string,
): Promise<ActionResult<{ setupToken: string }>> {
  const auth = await authorizeTenantAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };

  const db = createAdminClient();
  const owned = await loadOwnedEndpoint(db, endpointId, auth.admin.tenantId);
  if (!owned) return { ok: false, error: "Endpoint nicht gefunden." };

  const setupToken = generateSetupToken();
  const { error } = await db
    .from("email_inbound_endpoint")
    .update({
      setup_token: setupToken,
      setup_token_created_at: new Date().toISOString(),
    })
    .eq("id", endpointId)
    .eq("tenant_id", auth.admin.tenantId);

  if (error) {
    captureException(error, {
      source: LOG_SOURCE,
      userId: auth.admin.userId,
      metadata: { action: "regenerateSetupToken", endpoint_id: endpointId },
    });
    return { ok: false, error: "Token konnte nicht neu generiert werden." };
  }

  captureInfo("email_inbound_endpoint_token_regenerated", {
    source: LOG_SOURCE,
    userId: auth.admin.userId,
    metadata: { endpoint_id: endpointId, tenant_id: auth.admin.tenantId },
  });
  revalidatePath(SETUP_PATH);
  return { ok: true, setupToken };
}

// ─── updateAllowlist ────────────────────────────────────────────────────────

export async function updateAllowlist(
  endpointId: string,
  pattern: string,
  patternType: AllowlistPatternType,
  enabled: boolean,
): Promise<ActionResult<{ allowlistId: string }>> {
  const auth = await authorizeTenantAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };

  const trimmed = pattern.trim().toLowerCase();
  if (trimmed.length === 0) {
    return { ok: false, error: "Pattern darf nicht leer sein." };
  }
  if (!ALLOWLIST_PATTERN_TYPES.includes(patternType)) {
    return { ok: false, error: "Ungueltiger Pattern-Typ." };
  }

  const db = createAdminClient();
  const owned = await loadOwnedEndpoint(db, endpointId, auth.admin.tenantId);
  if (!owned) return { ok: false, error: "Endpoint nicht gefunden." };

  const { data, error } = await db
    .from("email_forward_allowlist")
    .insert({
      endpoint_id: endpointId,
      tenant_id: auth.admin.tenantId,
      pattern: trimmed,
      pattern_type: patternType,
      enabled,
    })
    .select("id")
    .single();

  if (error) {
    captureException(error, {
      source: LOG_SOURCE,
      userId: auth.admin.userId,
      metadata: { action: "updateAllowlist", endpoint_id: endpointId },
    });
    return { ok: false, error: "Allowlist-Eintrag konnte nicht gespeichert werden." };
  }

  captureInfo("email_forward_allowlist_added", {
    source: LOG_SOURCE,
    userId: auth.admin.userId,
    metadata: {
      endpoint_id: endpointId,
      tenant_id: auth.admin.tenantId,
      pattern_type: patternType,
      enabled,
    },
  });
  revalidatePath(SETUP_PATH);
  return { ok: true, allowlistId: data.id as string };
}

// ─── sendTestEmail ──────────────────────────────────────────────────────────

export async function sendTestEmail(
  endpointId: string,
): Promise<ActionResult<{ received: boolean }>> {
  const auth = await authorizeTenantAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };

  const db = createAdminClient();
  const owned = await loadOwnedEndpoint(db, endpointId, auth.admin.tenantId);
  if (!owned) return { ok: false, error: "Endpoint nicht gefunden." };

  const address = `bulk-${owned.slug}@${inboundDomain()}`;
  // sinceIso VOR dem Versand, damit das Polling nur die Test-Mail erfasst.
  const sinceIso = new Date().toISOString();

  try {
    await sendMail({
      from: senderAddress(),
      to: address,
      subject: "[Strategaize] Forward-Bucket Test-Mail",
      html:
        "<p>Dies ist eine automatische Test-Mail aus dem Forward-Bucket-Setup. " +
        "Wenn sie in deinem Strategaize-Cockpit erscheint, ist die Weiterleitung korrekt eingerichtet.</p>",
      text:
        "Dies ist eine automatische Test-Mail aus dem Forward-Bucket-Setup. " +
        "Wenn sie in deinem Strategaize-Cockpit erscheint, ist die Weiterleitung korrekt eingerichtet.",
    });
  } catch (err) {
    captureException(err, {
      source: LOG_SOURCE,
      userId: auth.admin.userId,
      metadata: { action: "sendTestEmail", endpoint_id: endpointId, address },
    });
    return { ok: false, error: "Test-Mail konnte nicht versendet werden (SMTP)." };
  }

  const row = await pollForInboundEmail(endpointId, sinceIso);
  captureInfo("email_inbound_endpoint_test_send", {
    source: LOG_SOURCE,
    userId: auth.admin.userId,
    metadata: {
      endpoint_id: endpointId,
      tenant_id: auth.admin.tenantId,
      received: row !== null,
    },
  });
  return { ok: true, received: row !== null };
}

// ─── suggestSetup (Conversational-First Assistant, MT-3b) ───────────────────

/**
 * Client-facing Wrapper um summarizeSetupIntent (Bedrock-Sonnet, eu-central-1).
 * Conversational-First (BLOCKING): der GF beschreibt in eigenen Worten, was er
 * weiterleiten will; das Modell schlaegt Local-Part + Allowlist-Patterns vor.
 * Auth-gated, damit der Bedrock-Call nicht oeffentlich ausloesbar ist.
 */
export async function suggestSetup(
  description: string,
): Promise<ActionResult<{ suggestion: SetupSuggestion }>> {
  const auth = await authorizeTenantAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };

  const trimmed = description.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Bitte beschreibe zuerst, was du weiterleiten moechtest." };
  }

  try {
    const suggestion = await summarizeSetupIntent(trimmed);
    captureInfo("email_inbound_endpoint_setup_suggested", {
      source: LOG_SOURCE,
      userId: auth.admin.userId,
      metadata: {
        tenant_id: auth.admin.tenantId,
        local_part: suggestion.suggestedLocalPart,
        allowlist_count: suggestion.suggestedAllowlistPatterns.length,
      },
    });
    return { ok: true, suggestion };
  } catch (err) {
    captureException(err, {
      source: LOG_SOURCE,
      userId: auth.admin.userId,
      metadata: { action: "suggestSetup" },
    });
    if (err instanceof SetupSuggestionError) {
      return {
        ok: false,
        error: "Der Assistent konnte keinen verwertbaren Vorschlag erzeugen. Bitte formuliere es etwas konkreter.",
      };
    }
    return { ok: false, error: "Setup-Assistent ist momentan nicht erreichbar." };
  }
}

// ─── confirmDsgvoDisclaimer ─────────────────────────────────────────────────

export async function confirmDsgvoDisclaimer(
  endpointId: string,
  consentVersion: string,
): Promise<ActionResult> {
  const auth = await authorizeTenantAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (!consentVersion.trim()) {
    return { ok: false, error: "Consent-Version fehlt." };
  }

  const db = createAdminClient();
  const owned = await loadOwnedEndpoint(db, endpointId, auth.admin.tenantId);
  if (!owned) return { ok: false, error: "Endpoint nicht gefunden." };

  const { error } = await db
    .from("email_inbound_endpoint")
    .update({
      dsgvo_consent_text_version: consentVersion,
      dsgvo_consent_accepted_at: new Date().toISOString(),
      dsgvo_consent_user_id: auth.admin.userId,
      status: "active",
    })
    .eq("id", endpointId)
    .eq("tenant_id", auth.admin.tenantId);

  if (error) {
    captureException(error, {
      source: LOG_SOURCE,
      userId: auth.admin.userId,
      metadata: { action: "confirmDsgvoDisclaimer", endpoint_id: endpointId },
    });
    return { ok: false, error: "DSGVO-Bestaetigung konnte nicht gespeichert werden." };
  }

  // 7-Jahre-Audit-Trail (DEC-209): zusaetzlich zum Spalten-State unveraenderlich in error_log.
  captureInfo("email_inbound_endpoint_dsgvo_consent", {
    source: LOG_SOURCE,
    userId: auth.admin.userId,
    metadata: {
      endpoint_id: endpointId,
      tenant_id: auth.admin.tenantId,
      consent_version: consentVersion,
    },
  });
  revalidatePath(SETUP_PATH);
  return { ok: true };
}
