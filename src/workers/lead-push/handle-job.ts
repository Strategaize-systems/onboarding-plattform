// V6 SLC-106 MT-6 — Worker-Job-Handler `lead_push_retry` (FEAT-046).
//
// Verarbeitet einen einzelnen Retry-Versuch fuer einen fehlgeschlagenen Lead-
// Push an das Business-System. Der Initial-Push (Attempt 1) laeuft synchron in
// der Server-Action `requestLeadPush` (MT-5). Bei Fail enqueued MT-5 einen
// ai_jobs-Eintrag mit job_type='lead_push_retry' + payload.attempt=2 +
// payload.scheduled_at=now()+5min. Migration 092a sorgt dafuer, dass die
// Claim-RPC `payload.scheduled_at` respektiert — der Worker zieht den Job erst
// wenn die Faelligkeit erreicht ist.
//
// Backoff-Schedule (DEC-112):
//   Attempt 1 (sync, MT-5) fails → enqueue attempt=2 mit  5min Backoff
//   Attempt 2 (worker)    fails → enqueue attempt=3 mit 30min Backoff
//   Attempt 3 (worker)    fails → markAuditFailed final, KEIN neuer Job
//
// Audit-Modell (Slice-Spec, AC-6+AC-9):
//   - EINE lead_push_audit-Row pro consent (UNIQUE via consent_id).
//   - attempt_number wird mit jedem Versuch hochgezaehlt (CHECK 1..3).
//   - status: pending → success | failed; bleibt mutable ueber Retry-Kette.
//
// Idempotenz: wenn audit.status='success' bereits gesetzt ist (z.B. Race
// zwischen erstem Retry und einem manuellen Admin-Re-Push), schreibt der Worker
// nichts neu und schliesst den Job sauber ab.
//
// Dependency-Injection (deps): erlaubt sauberes Mocking in den 5 Vitest. Der
// duenne Wrapper `handleLeadPushRetryJob` injiziert Production-Defaults. Tests
// rufen direkt `executeLeadPushRetry(job, deps)` mit `pushFn` und
// `loadDiagnoseSummary` als Mocks.

import { createAdminClient } from "../../lib/supabase/admin";
import { captureException, captureInfo, captureWarning } from "../../lib/logger";
import { pushLeadToBusinessSystem } from "../../lib/integrations/business-system/lead-intake";
import { buildNotesFromDiagnose } from "../../lib/integrations/business-system/build-notes";
import type {
  DiagnoseReportSummary,
  LeadIntakePayload,
  LeadIntakeResponse,
} from "../../lib/integrations/business-system/types";
import type { ClaimedJob } from "../condensation/claim-loop";

const UUID_REGEX = /^[0-9a-f-]{36}$/i;

// Backoff-Schedule (DEC-112). Worker faengt nach dem ersten MT-5-Fail an, d.h.
// der erste Worker-Lauf ist Attempt 2 → Backoff vor Attempt 3 ist 30 min. Falls
// (theoretisch) ein Attempt-1-Job direkt enqueued waere, beruecksichtigt die
// `attempt === 1`-Branch das.
const BACKOFF_MS_AFTER_ATTEMPT_1 = 5 * 60 * 1000;
const BACKOFF_MS_AFTER_ATTEMPT_2 = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const UTM_CAMPAIGN = "partner_diagnostic_v1";
const UTM_MEDIUM = "referral";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface HandleLeadPushRetryDeps {
  adminClient: AdminClient;
  pushFn: (payload: LeadIntakePayload) => Promise<LeadIntakeResponse>;
  /** Allows fixed clocks in tests for Backoff-Schedule-Verify. */
  now?: () => number;
}

interface ConsentRow {
  id: string;
  capture_session_id: string;
  mandant_user_id: string;
  mandant_tenant_id: string;
  partner_tenant_id: string;
}

interface AuditRow {
  id: string;
  consent_id: string;
  status: string;
}

/** Pure helper — exported fuer Backoff-Schedule-Verify-Test (Test 5). */
export function nextBackoffMs(attempt: number): number {
  if (attempt === 1) return BACKOFF_MS_AFTER_ATTEMPT_1;
  return BACKOFF_MS_AFTER_ATTEMPT_2;
}

export async function executeLeadPushRetry(
  job: ClaimedJob,
  deps: HandleLeadPushRetryDeps,
): Promise<void> {
  const { adminClient, pushFn } = deps;
  const now = deps.now ?? Date.now;

  const payload = job.payload as {
    audit_id?: unknown;
    attempt?: unknown;
    scheduled_at?: unknown;
  };

  const auditId =
    typeof payload.audit_id === "string" && UUID_REGEX.test(payload.audit_id)
      ? payload.audit_id
      : null;
  const attempt =
    typeof payload.attempt === "number" && Number.isInteger(payload.attempt)
      ? payload.attempt
      : null;

  if (!auditId || attempt === null) {
    throw new Error(
      `lead_push_retry: invalid payload (audit_id=${String(payload.audit_id)}, attempt=${String(payload.attempt)})`,
    );
  }

  // Safety-Branch: attempt > MAX_ATTEMPTS sollte nicht passieren (MT-5 enqueued
  // nur attempt=2; Worker enqueued nur bis attempt=3). Falls doch: kein Push,
  // direkt finalen Fail markieren und Job sauber abschliessen.
  if (attempt > MAX_ATTEMPTS) {
    await markAuditFailed(
      adminClient,
      auditId,
      MAX_ATTEMPTS,
      "max_attempts_exceeded",
    );
    captureWarning(
      `Lead-Push retry attempt ${attempt} exceeds MAX_ATTEMPTS — final fail`,
      {
        source: "workers/lead-push/handle-job",
        metadata: {
          category: "lead_push_failure",
          audit_id: auditId,
          attempt,
          reason: "max_attempts_exceeded",
        },
      },
    );
    await completeAiJob(adminClient, job.id);
    return;
  }

  // Audit laden
  const { data: auditRow, error: auditErr } = await adminClient
    .from("lead_push_audit")
    .select("id, consent_id, status")
    .eq("id", auditId)
    .single<AuditRow>();
  if (auditErr || !auditRow) {
    captureWarning(
      `Lead-Push retry: audit ${auditId} not found — completing job`,
      {
        source: "workers/lead-push/handle-job",
        metadata: { audit_id: auditId, error: auditErr?.message },
      },
    );
    await completeAiJob(adminClient, job.id);
    return;
  }

  // Idempotenz: wurde der Push zwischenzeitlich erfolgreich? Dann nichts tun.
  if (auditRow.status === "success") {
    captureInfo(
      `Lead-Push retry: audit ${auditId} already success — skipping`,
      {
        source: "workers/lead-push/handle-job",
        metadata: { audit_id: auditId, attempt },
      },
    );
    await completeAiJob(adminClient, job.id);
    return;
  }

  // Consent laden
  const { data: consentRow, error: consentErr } = await adminClient
    .from("lead_push_consent")
    .select(
      "id, capture_session_id, mandant_user_id, mandant_tenant_id, partner_tenant_id",
    )
    .eq("id", auditRow.consent_id)
    .single<ConsentRow>();
  if (consentErr || !consentRow) {
    throw new Error(
      `lead_push_retry: consent ${auditRow.consent_id} not found: ${consentErr?.message ?? "no row"}`,
    );
  }

  // Lead-Payload aus Consent + Mandant-Profil + Partner-Org + Diagnose-Summary
  const leadPayload = await buildPayloadFromConsent(adminClient, consentRow);

  // Push
  const start = now();
  let pushResult: LeadIntakeResponse;
  try {
    pushResult = await pushFn(leadPayload);
  } catch (e) {
    pushResult = { ok: false, error: (e as Error).message };
  }
  const latencyMs = now() - start;

  captureInfo(
    `Lead-Push attempt ${attempt} → ${pushResult.ok ? "success" : "failed"}`,
    {
      source: "workers/lead-push/handle-job",
      metadata: {
        category: "lead_push_attempt",
        audit_id: auditId,
        attempt,
        status: pushResult.ok ? "success" : "failed",
        latency_ms: latencyMs,
        ...(pushResult.ok
          ? {
              contact_id: pushResult.contact_id,
              was_new: pushResult.was_new,
            }
          : { error: pushResult.error }),
      },
    },
  );

  if (pushResult.ok) {
    await markAuditSuccess(adminClient, auditId, attempt, pushResult);
    await completeAiJob(adminClient, job.id);
    return;
  }

  // Push fehlgeschlagen — Audit-Status aktualisieren
  await markAuditFailed(adminClient, auditId, attempt, pushResult.error);

  if (attempt < MAX_ATTEMPTS) {
    const backoffMs = nextBackoffMs(attempt);
    const scheduledAt = new Date(now() + backoffMs).toISOString();
    const { error: enqueueErr } = await adminClient.from("ai_jobs").insert({
      tenant_id: consentRow.mandant_tenant_id,
      job_type: "lead_push_retry",
      payload: {
        audit_id: auditId,
        attempt: attempt + 1,
        scheduled_at: scheduledAt,
      },
      status: "pending",
    });
    if (enqueueErr) {
      // Enqueue-Fail blockiert nicht den aktuellen Job — wir loggen und schliessen ab.
      captureException(new Error(enqueueErr.message), {
        source: "workers/lead-push/handle-job",
        metadata: {
          audit_id: auditId,
          attempt: attempt + 1,
          action: "retry_enqueue",
        },
      });
    }
  } else {
    // Final fail nach 3 Versuchen — KEIN neuer Job, finales Audit-Log
    captureWarning(
      `Lead-Push final failure for audit ${auditId} after ${attempt} attempts`,
      {
        source: "workers/lead-push/handle-job",
        metadata: {
          category: "lead_push_failure",
          audit_id: auditId,
          consent_id: auditRow.consent_id,
          final_error: pushResult.error,
          attempt,
        },
      },
    );
  }

  await completeAiJob(adminClient, job.id);
}

/** Production-Wrapper mit Default-Dependencies. Vom Worker-Dispatcher genutzt. */
export async function handleLeadPushRetryJob(job: ClaimedJob): Promise<void> {
  await executeLeadPushRetry(job, {
    adminClient: createAdminClient(),
    pushFn: pushLeadToBusinessSystem,
  });
}

// -------------------- internal helpers --------------------

async function buildPayloadFromConsent(
  admin: AdminClient,
  consent: ConsentRow,
): Promise<LeadIntakePayload> {
  // Mandant-Profil
  const { data: profileRow } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", consent.mandant_user_id)
    .single<{ id: string; email: string | null }>();

  // Auth-User (fuer user_metadata)
  const { data: authUserData } = await admin.auth.admin.getUserById(
    consent.mandant_user_id,
  );
  const userEmail = profileRow?.email ?? authUserData?.user?.email ?? "";
  const userMetadata =
    authUserData?.user?.user_metadata &&
    typeof authUserData.user.user_metadata === "object"
      ? (authUserData.user.user_metadata as Record<string, unknown>)
      : null;
  const { first_name, last_name } = deriveNameFromUser(userEmail, userMetadata);

  // Partner-Organisation (fuer Strukturtext)
  const { data: partnerOrgRow } = await admin
    .from("partner_organization")
    .select("display_name")
    .eq("tenant_id", consent.partner_tenant_id)
    .maybeSingle<{ display_name: string | null }>();
  const partnerOrgName =
    partnerOrgRow?.display_name ?? "Ihrem Strategaize-Partner";

  // Diagnose-Summary (best-effort, gleich wie MT-5 loadDiagnoseReportSummary)
  const summary = await loadDiagnoseSummary(
    admin,
    consent.capture_session_id,
    partnerOrgName,
  );

  return {
    first_name,
    last_name,
    email: userEmail,
    notes: buildNotesFromDiagnose(summary),
    utm_source: `partner_${consent.partner_tenant_id}`,
    utm_campaign: UTM_CAMPAIGN,
    utm_medium: UTM_MEDIUM,
  };
}

function deriveNameFromUser(
  email: string,
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
  const localPart = email.split("@")[0] || "Mandant";
  return { first_name: localPart, last_name: "" };
}

async function loadDiagnoseSummary(
  admin: AdminClient,
  captureSessionId: string,
  partnerOrgName: string,
): Promise<DiagnoseReportSummary> {
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
    const content = (row as { content: unknown }).content as
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

async function markAuditSuccess(
  admin: AdminClient,
  auditId: string,
  attempt: number,
  response: Extract<LeadIntakeResponse, { ok: true }>,
): Promise<void> {
  const { error } = await admin
    .from("lead_push_audit")
    .update({
      status: "success",
      attempt_number: Math.min(attempt, MAX_ATTEMPTS),
      business_system_response_status: 200,
      business_system_contact_id: response.contact_id,
      business_system_was_new: response.was_new,
      error_message: null,
    })
    .eq("id", auditId);
  if (error) {
    captureException(new Error(error.message), {
      source: "workers/lead-push/handle-job",
      metadata: { audit_id: auditId, action: "mark_success" },
    });
    throw new Error(`mark_audit_success_failed: ${error.message}`);
  }
}

async function markAuditFailed(
  admin: AdminClient,
  auditId: string,
  attempt: number,
  errorMessage: string,
): Promise<void> {
  const { error } = await admin
    .from("lead_push_audit")
    .update({
      status: "failed",
      attempt_number: Math.min(attempt, MAX_ATTEMPTS),
      error_message: errorMessage.slice(0, 1000),
    })
    .eq("id", auditId);
  if (error) {
    captureException(new Error(error.message), {
      source: "workers/lead-push/handle-job",
      metadata: { audit_id: auditId, action: "mark_failed" },
    });
    throw new Error(`mark_audit_failed_failed: ${error.message}`);
  }
}

async function completeAiJob(admin: AdminClient, jobId: string): Promise<void> {
  const { error } = await admin.rpc("rpc_complete_ai_job", { p_job_id: jobId });
  if (error) {
    // Non-fatal — Worker hat seine fachliche Arbeit erledigt. claim-loop
    // wuerde diesen Job sonst in failed-Zustand kippen, was er hier ist nicht.
    captureException(new Error(error.message), {
      source: "workers/lead-push/handle-job",
      metadata: { job_id: jobId, action: "rpc_complete_ai_job" },
    });
    // Wir werfen NICHT, damit claim-loop nicht rpc_fail_ai_job zusaetzlich aufruft.
  }
}
