"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException, captureInfo } from "@/lib/logger";
import { pushLeadToBusinessSystem } from "@/lib/integrations/business-system/lead-intake";
import { buildNotesFromDiagnose } from "@/lib/integrations/business-system/build-notes";
import type {
  DiagnoseReportSummary,
  LeadIntakePayload,
} from "@/lib/integrations/business-system/types";

/**
 * V6 SLC-106 MT-5 — Server Action `requestLeadPush` (FEAT-046).
 *
 * Flow (1) Pflicht-Re-Validation Privacy-Checkbox (DEC-091) →
 *      (2) Auth + Profile-Lookup →
 *      (3) Validation capture_session + tenant (partner_client + parent_partner_tenant_id) →
 *      (4) Idempotenz-Check (UNIQUE idx_lead_push_consent_session +
 *          Pre-Read fuer 'already_pushed' Userland-Error) →
 *      (5) INSERT lead_push_consent →
 *      (6) INSERT lead_push_audit (status='pending') mit Compensating-Action
 *          fuer Partial-Failure (Pattern aus SLC-102 MT-1) →
 *      (7) Build Payload + Synchroner HTTP-Call →
 *      (8) UPDATE lead_push_audit success/failed →
 *      (9) Bei Fail: INSERT ai_jobs job_type='lead_push_retry' fuer Retry-Pfad MT-6.
 *
 * Atomarer-TX-Hinweis: Echte BEGIN/COMMIT-Transaktion ist via PostgREST
 * nicht moeglich (siehe RPT-214 / SLC-102 MT-1). Stattdessen 2-Phasen-INSERT
 * mit explizitem Cleanup-Pfad (Compensating Action) — funktional gleichwertig
 * fuer das "kein Orphan-Consent"-Invariant. UNIQUE-Index auf capture_session_id
 * bietet zusaetzliche Defense-in-Depth.
 */

type RequestLeadPushInput = {
  capture_session_id: string;
  consent_checkbox_value: boolean;
  consent_text_version: string;
  consent_ip?: string | null;
  consent_user_agent?: string | null;
};

type RequestLeadPushResult =
  | { ok: true; auditId: string }
  | { ok: false; error: string };

const UUID_REGEX = /^[0-9a-f-]{36}$/i;
const RETRY_BACKOFF_MS = 5 * 60 * 1000;
const UTM_CAMPAIGN = "partner_diagnostic_v1";
const UTM_MEDIUM = "referral";

function deriveNameFromUser(
  email: string | null,
  metadata: Record<string, unknown> | null,
): { first_name: string; last_name: string } {
  const meta = metadata ?? {};
  const first =
    (typeof meta.first_name === "string" && meta.first_name.trim()) ||
    (typeof meta.given_name === "string" && meta.given_name.trim()) ||
    null;
  const last =
    (typeof meta.last_name === "string" && meta.last_name.trim()) ||
    (typeof meta.family_name === "string" && meta.family_name.trim()) ||
    null;
  if (first || last) {
    return { first_name: first ?? "", last_name: last ?? "" };
  }
  // Fallback: full_name oder name als ein Stueck oder Email-Lokalteil
  const fullName =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    null;
  if (fullName) {
    const parts = fullName.split(/\s+/);
    if (parts.length === 1) return { first_name: parts[0], last_name: "" };
    return {
      first_name: parts[0],
      last_name: parts.slice(1).join(" "),
    };
  }
  const localPart = (email ?? "").split("@")[0] || "Mandant";
  return { first_name: localPart, last_name: "" };
}

export async function requestLeadPush(
  input: RequestLeadPushInput,
): Promise<RequestLeadPushResult> {
  // 1. Pflicht-Re-Validation (DEC-091)
  if (!input.consent_checkbox_value) {
    return { ok: false, error: "privacy_checkbox_required" };
  }
  if (!input.capture_session_id || !UUID_REGEX.test(input.capture_session_id)) {
    return { ok: false, error: "invalid_capture_session_id" };
  }
  if (!input.consent_text_version || input.consent_text_version.length === 0) {
    return { ok: false, error: "invalid_consent_text_version" };
  }

  // 2. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const admin = createAdminClient();

  const { data: profileRow, error: profileErr } = await admin
    .from("profiles")
    .select("id, tenant_id, email")
    .eq("id", user.id)
    .single();
  if (profileErr || !profileRow?.tenant_id) {
    return { ok: false, error: "profile_not_found" };
  }

  // 3. Validation capture_session + tenant
  const { data: sessionRow, error: sessionErr } = await admin
    .from("capture_session")
    .select("id, tenant_id, status")
    .eq("id", input.capture_session_id)
    .maybeSingle();
  if (sessionErr) {
    captureException(new Error(sessionErr.message), {
      source: "diagnose/lead-push/requestLeadPush/capture_session",
      userId: user.id,
      metadata: { capture_session_id: input.capture_session_id },
    });
    return { ok: false, error: "capture_session_lookup_failed" };
  }
  if (!sessionRow) return { ok: false, error: "capture_session_not_found" };
  if (sessionRow.tenant_id !== profileRow.tenant_id) {
    return { ok: false, error: "forbidden" };
  }
  if (sessionRow.status !== "finalized") {
    return { ok: false, error: "not_finalized" };
  }

  const { data: tenantRow, error: tenantErr } = await admin
    .from("tenants")
    .select("id, tenant_kind, parent_partner_tenant_id")
    .eq("id", profileRow.tenant_id)
    .single();
  if (tenantErr || !tenantRow) {
    return { ok: false, error: "tenant_not_found" };
  }
  if (tenantRow.tenant_kind !== "partner_client") {
    return { ok: false, error: "not_partner_client" };
  }
  if (!tenantRow.parent_partner_tenant_id) {
    return { ok: false, error: "no_parent_partner" };
  }

  // 4. Idempotenz-Pre-Check (Defense-in-Depth zusaetzlich zur UNIQUE-Constraint)
  const { data: existingConsent } = await admin
    .from("lead_push_consent")
    .select("id")
    .eq("capture_session_id", input.capture_session_id)
    .maybeSingle();
  if (existingConsent) {
    return { ok: false, error: "already_pushed" };
  }

  // 5. INSERT lead_push_consent
  const { data: consentRow, error: consentErr } = await admin
    .from("lead_push_consent")
    .insert({
      capture_session_id: input.capture_session_id,
      mandant_user_id: user.id,
      mandant_tenant_id: profileRow.tenant_id,
      partner_tenant_id: tenantRow.parent_partner_tenant_id,
      consent_text_version: input.consent_text_version,
      consent_ip: input.consent_ip ?? null,
      consent_user_agent: input.consent_user_agent ?? null,
    })
    .select("id")
    .single();
  if (consentErr || !consentRow) {
    if ((consentErr as { code?: string } | null)?.code === "23505") {
      return { ok: false, error: "already_pushed" };
    }
    captureException(
      new Error(consentErr?.message ?? "consent insert returned no row"),
      {
        source: "diagnose/lead-push/requestLeadPush/consent_insert",
        userId: user.id,
        metadata: { capture_session_id: input.capture_session_id },
      },
    );
    return { ok: false, error: "consent_insert_failed" };
  }
  const consentId = consentRow.id;

  // 6. INSERT lead_push_audit (status='pending') mit Compensating Action
  const utmSource = `partner_${tenantRow.parent_partner_tenant_id}`;
  const { data: auditRow, error: auditErr } = await admin
    .from("lead_push_audit")
    .insert({
      consent_id: consentId,
      attempt_number: 1,
      status: "pending",
      attribution_utm_source: utmSource,
      attribution_utm_campaign: UTM_CAMPAIGN,
      attribution_utm_medium: UTM_MEDIUM,
    })
    .select("id")
    .single();
  if (auditErr || !auditRow) {
    // Compensating Action — Orphan-Consent entfernen (Atomar-Invariant)
    const { error: deleteErr } = await admin
      .from("lead_push_consent")
      .delete()
      .eq("id", consentId);
    if (deleteErr) {
      captureException(new Error(deleteErr.message), {
        source: "diagnose/lead-push/requestLeadPush/compensating_delete",
        userId: user.id,
        metadata: { consent_id: consentId },
      });
    }
    captureException(
      new Error(auditErr?.message ?? "audit insert returned no row"),
      {
        source: "diagnose/lead-push/requestLeadPush/audit_insert",
        userId: user.id,
        metadata: { consent_id: consentId },
      },
    );
    return { ok: false, error: "audit_insert_failed" };
  }
  const auditId = auditRow.id;

  captureInfo(
    `Lead-Push Consent gegeben fuer capture ${input.capture_session_id}`,
    {
      source: "diagnose/lead-push/requestLeadPush",
      userId: user.id,
      metadata: {
        category: "lead_push_consent_given",
        consent_id: consentId,
        audit_id: auditId,
        capture_session_id: input.capture_session_id,
        partner_tenant_id: tenantRow.parent_partner_tenant_id,
      },
    },
  );

  // 7. Build Payload + Synchroner HTTP-Call
  const { data: partnerOrgRow } = await admin
    .from("partner_organization")
    .select("display_name")
    .eq("tenant_id", tenantRow.parent_partner_tenant_id)
    .maybeSingle();
  const partnerOrgName = partnerOrgRow?.display_name || "Ihrem Strategaize-Partner";

  const diagnoseSummary = await loadDiagnoseReportSummary(
    admin,
    input.capture_session_id,
    partnerOrgName,
  );

  const userMetadata =
    typeof user.user_metadata === "object" && user.user_metadata !== null
      ? (user.user_metadata as Record<string, unknown>)
      : null;
  const userEmail = profileRow.email ?? user.email ?? "";
  const { first_name, last_name } = deriveNameFromUser(userEmail, userMetadata);

  const payload: LeadIntakePayload = {
    first_name,
    last_name,
    email: userEmail,
    notes: buildNotesFromDiagnose(diagnoseSummary),
    utm_source: utmSource,
    utm_campaign: UTM_CAMPAIGN,
    utm_medium: UTM_MEDIUM,
  };

  let pushResult: Awaited<ReturnType<typeof pushLeadToBusinessSystem>>;
  try {
    pushResult = await pushLeadToBusinessSystem(payload);
  } catch (e) {
    // ENV nicht gesetzt o.ae. — Adapter wirft, hier als failed behandeln.
    pushResult = { ok: false, error: (e as Error).message };
  }

  captureInfo(
    `Lead-Push attempt 1 → ${pushResult.ok ? "success" : "failed"}`,
    {
      source: "diagnose/lead-push/requestLeadPush",
      userId: user.id,
      metadata: {
        category: "lead_push_attempt",
        audit_id: auditId,
        attempt: 1,
        status: pushResult.ok ? "success" : "failed",
        ...(pushResult.ok
          ? {
              contact_id: pushResult.contact_id,
              was_new: pushResult.was_new,
            }
          : { error: pushResult.error }),
      },
    },
  );

  // 8. UPDATE lead_push_audit
  if (pushResult.ok) {
    const { error: upErr } = await admin
      .from("lead_push_audit")
      .update({
        status: "success",
        business_system_response_status: 200,
        business_system_contact_id: pushResult.contact_id,
        business_system_was_new: pushResult.was_new,
      })
      .eq("id", auditId);
    if (upErr) {
      captureException(new Error(upErr.message), {
        source: "diagnose/lead-push/requestLeadPush/audit_update_success",
        userId: user.id,
        metadata: { audit_id: auditId },
      });
    }
    return { ok: true, auditId };
  }

  // 9. Bei Fail: UPDATE audit failed + Retry-Job
  const { error: upFailErr } = await admin
    .from("lead_push_audit")
    .update({
      status: "failed",
      error_message: pushResult.error.slice(0, 1000),
    })
    .eq("id", auditId);
  if (upFailErr) {
    captureException(new Error(upFailErr.message), {
      source: "diagnose/lead-push/requestLeadPush/audit_update_failed",
      userId: user.id,
      metadata: { audit_id: auditId },
    });
  }

  // Retry-Job in ai_jobs (Worker MT-6 picked das auf, prueft scheduled_at-Payload)
  const scheduledAt = new Date(Date.now() + RETRY_BACKOFF_MS).toISOString();
  const { error: enqueueErr } = await admin.from("ai_jobs").insert({
    tenant_id: profileRow.tenant_id,
    job_type: "lead_push_retry",
    payload: {
      audit_id: auditId,
      attempt: 2,
      scheduled_at: scheduledAt,
    },
    status: "pending",
  });
  if (enqueueErr) {
    captureException(new Error(enqueueErr.message), {
      source: "diagnose/lead-push/requestLeadPush/retry_enqueue",
      userId: user.id,
      metadata: { audit_id: auditId },
    });
    // Trotz Enqueue-Fail liefern wir ok=true zurueck — UI zeigt generisch.
    // strategaize_admin sieht Fehler im error_log und kann Retry-Job manuell anlegen.
  }

  // UI bekommt ok=true (Slice-Spec Zeile 179): generischer "Anfrage gesendet"-Hinweis,
  // Status-Karte zeigt spaeter den tatsaechlichen Audit-Status.
  return { ok: true, auditId };
}

/**
 * V6 minimal: aggregiert partner_org_name plus null/null fuer score/block.
 * Real-Aggregation der Reifegrad-Scores aus block_diagnosis kommt in V6.1
 * sobald diagnosis_schema-Felder ueber Templates stabilisiert sind. Die
 * buildNotesFromDiagnose-Helper behandelt null-Werte deterministisch.
 */
async function loadDiagnoseReportSummary(
  admin: ReturnType<typeof createAdminClient>,
  captureSessionId: string,
  partnerOrgName: string,
): Promise<DiagnoseReportSummary> {
  // Best-effort score/block aus block_diagnosis.content.subtopics[*].fields.reifegrad
  const { data: blocks } = await admin
    .from("block_diagnosis")
    .select("content")
    .eq("capture_session_id", captureSessionId);

  if (!blocks || blocks.length === 0) {
    return {
      partner_org_name: partnerOrgName,
      average_score: null,
      weakest_block_title: null,
    };
  }

  let totalSum = 0;
  let totalCount = 0;
  let weakestTitle: string | null = null;
  let weakestAvg = Number.POSITIVE_INFINITY;

  for (const row of blocks) {
    const content = row.content as
      | { block_title?: unknown; subtopics?: unknown }
      | null;
    if (!content || !Array.isArray(content.subtopics)) continue;
    let blockSum = 0;
    let blockCount = 0;
    for (const st of content.subtopics) {
      const fields = (st as { fields?: unknown })?.fields;
      if (!fields || typeof fields !== "object") continue;
      const raw = (fields as Record<string, unknown>).reifegrad;
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(value)) continue;
      blockSum += value;
      blockCount += 1;
      totalSum += value;
      totalCount += 1;
    }
    if (blockCount > 0) {
      const blockAvg = blockSum / blockCount;
      if (blockAvg < weakestAvg) {
        weakestAvg = blockAvg;
        weakestTitle =
          typeof content.block_title === "string" ? content.block_title : null;
      }
    }
  }

  return {
    partner_org_name: partnerOrgName,
    average_score: totalCount > 0 ? totalSum / totalCount : null,
    weakest_block_title: weakestTitle,
  };
}
