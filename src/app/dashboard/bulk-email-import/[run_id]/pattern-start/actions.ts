"use server";

// V9 SLC-167 MT-4 — Pre-Cost-Estimate + Pattern-Start Server-Actions (FEAT-073).
//
// Spec: slices/SLC-167-v9-pattern-curation-cost-cap.md (MT-4 Expected behavior)
// DECs: DEC-180 (Async-Worker), DEC-181 (USD->EUR-Approx), DEC-182 (Cost-Cap-Flow)
//
// Drei Aktionen:
//   - getPatternStartData(bulkRunId): Page-Load — bulk_run + redacted threads
//     fuer Cost-Estimate + Tenant-Monat-Stand. RLS via user-context.
//   - startPatternExtraction(bulkRunId, preApprovalGranted): GF-Gate-2.
//     Re-Check aller 3 Caps Server-Side (UI-Check ist Convenience, Server-Check
//     ist Sicherheit). Enqueue ai_jobs(job_type='email_bulk_pattern_extract')
//     + UPDATE status='pattern_extracting'.
//
// Pattern-Reuse:
//   - Auth-Gate (tenant_admin): filter-review/actions.ts authorizeReviewer
//   - User-Context-SELECT + admin-Client-INSERT-Trennung: filter-review/actions.ts
//     approvePreFilterAndStartThreadRedact
//   - Cost-Cap-Service + Pure-Functions: ../../../../lib/bulk-email/cost-cap.ts
//   - Cost-Estimate Pure-Function: ../../../../lib/bulk-email/cost-estimate.ts
//   - JOB_TYPE-Konstante: ../../../../workers/bulk-email/job-types.ts
//     (JOB_TYPE_EMAIL_BULK_PATTERN_EXTRACT = 'email_bulk_pattern_extract').
//
// Spec-Drift D-MT4-Job-Type-Name — DOKUMENTIERT + AKZEPTIERT:
//   Slice-Spec L40 + L158 + L172 nennt den Job-Type inkonsistent
//   'email_bulk_pattern_extraction'. job-types.ts MT-1 hat bereits
//   'email_bulk_pattern_extract' als Konstante. Wir nutzen den existierenden
//   Wert — kein Rename in MT-4 (Pattern-Reuse-Rule: keine Brand-Aenderungen
//   ohne triftigen Grund). Anti-Pattern: zwei Sources-of-Truth waeren
//   schlechter als Spec-Drift-Akzeptanz.

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  estimateBulkRunPatternCost,
  type BulkRunCostEstimate,
} from "@/lib/bulk-email/cost-estimate";
import {
  DEFAULT_PRE_APPROVAL_THRESHOLD_EUR,
  DEFAULT_RUN_CAP_EUR,
  DEFAULT_TENANT_MONTH_CAP_EUR,
  checkPreApprovalThreshold,
  checkRunCap,
  checkTenantMonthlyCap,
  createCostCapStoreFromSupabase,
} from "@/lib/bulk-email/cost-cap";
import { JOB_TYPE_EMAIL_BULK_PATTERN_EXTRACT } from "@/workers/bulk-email/job-types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface PatternStartData {
  run: {
    id: string;
    source_file_name: string;
    status: string;
    thread_count: number;
  };
  /** Pre-Cost-Estimate aus redacted_body der Threads. Threads ohne body zaehlen mit 0. */
  estimate: BulkRunCostEstimate;
  /** Caps wie sie zum Render-Zeitpunkt resolved sind (ENV oder Default). */
  caps: {
    runCapEur: number;
    tenantMonthCapEur: number;
    preApprovalThresholdEur: number;
  };
  /** Aktueller Tenant-Monatscost-Stand fuer UI-Anzeige (EUR). */
  tenantMonthSoFarEur: number;
}

export type StartPatternExtractionResult =
  | { ok: true; jobId: string }
  | {
      ok: false;
      reason:
        | "auth"
        | "uuid"
        | "not_found"
        | "wrong_status"
        | "no_threads"
        | "run_cap_exceeded"
        | "tenant_month_cap_exceeded"
        | "pre_approval_required"
        | "db_error";
      message: string;
    };

// ──────────────────────────────────────────────────────────────────────────────
// ENV-Resolution
// ──────────────────────────────────────────────────────────────────────────────

function resolveEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function resolveCaps() {
  return {
    runCapEur: resolveEnvNumber("V9_BULK_EMAIL_RUN_CAP_EUR", DEFAULT_RUN_CAP_EUR),
    tenantMonthCapEur: resolveEnvNumber(
      "V9_BULK_EMAIL_TENANT_MONTH_CAP_EUR",
      DEFAULT_TENANT_MONTH_CAP_EUR,
    ),
    preApprovalThresholdEur: resolveEnvNumber(
      "V9_BULK_EMAIL_PRE_APPROVAL_THRESHOLD_EUR",
      DEFAULT_PRE_APPROVAL_THRESHOLD_EUR,
    ),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Auth-Gate
// ──────────────────────────────────────────────────────────────────────────────

interface AuthorizedActor {
  userId: string;
  tenantId: string;
}

async function authorizeActor(): Promise<
  { actor: AuthorizedActor } | { error: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Nicht authentifiziert" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return { error: "Profil nicht gefunden" };
  }
  if (profile.role !== "tenant_admin") {
    return {
      error: "Nur Tenant-Admins koennen die Pattern-Extraktion starten",
    };
  }
  if (!profile.tenant_id) {
    return { error: "Kein Tenant zugeordnet" };
  }

  return {
    actor: { userId: user.id, tenantId: profile.tenant_id as string },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// getPatternStartData — Page-Load
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Lade Bulk-Run-Header + redacted Threads + Pre-Cost-Estimate + Tenant-Monatscost.
 *
 * Sicherheit: User-Context-Client. RLS filtert nach Tenant. Tenant-Monatscost-
 * Lookup via admin-Client (BYPASSRLS, explizit gefiltert nach Tenant-ID).
 *
 * Returns null bei nicht-existent ODER kein-Lese-Zugriff (RLS-Miss):
 *   - notFound() in der Page (kein Cross-Tenant-Existenz-Leak)
 */
export async function getPatternStartData(
  bulkRunId: string,
): Promise<PatternStartData | null> {
  if (!UUID_REGEX.test(bulkRunId)) return null;

  const auth = await authorizeActor();
  if ("error" in auth) return null;

  const supabase = await createClient();

  const { data: runRow, error: runError } = await supabase
    .from("email_bulk_run")
    .select("id, source_file_name, status, thread_count")
    .eq("id", bulkRunId)
    .maybeSingle();
  if (runError || !runRow) return null;

  const { data: threadRows, error: threadsError } = await supabase
    .from("email_thread")
    .select("redacted_body")
    .eq("bulk_run_id", bulkRunId)
    .eq("thread_status", "redacted");
  if (threadsError) return null;

  const threadsForEstimate = (threadRows ?? []).map((t) => ({
    redactedBody: ((t as { redacted_body: string | null }).redacted_body ?? "") as string,
  }));

  const estimate = estimateBulkRunPatternCost(threadsForEstimate);
  const caps = resolveCaps();

  // Tenant-Monatscost-Lookup via admin-Client (BYPASSRLS) + expliziter
  // Tenant-Filter im Store. User-Context-RLS auf vw_bulk_email_cost_monthly
  // wuerde auch funktionieren, aber consistent mit Server-Action-Pfad.
  const adminClient = createAdminClient();
  const store = createCostCapStoreFromSupabase(adminClient);
  const tenantMonthSoFarEur = await store
    .getTenantMonthCostEur(auth.actor.tenantId)
    .catch(() => 0);

  return {
    run: {
      id: runRow.id as string,
      source_file_name: runRow.source_file_name as string,
      status: runRow.status as string,
      thread_count: Number(runRow.thread_count ?? threadsForEstimate.length),
    },
    estimate,
    caps,
    tenantMonthSoFarEur,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// startPatternExtraction — GF-Gate-2 Server-Action
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Server-Action: GF-Gate-2 Pattern-Extraktion starten.
 *
 * Flow:
 *   1. Auth-Gate (tenant_admin).
 *   2. UUID-Validation.
 *   3. User-Context-SELECT bulk_run.status — Pre-Check 'thread_redacted'.
 *   4. Re-Estimate aus aktuellem Thread-Stand (UI-Estimate ist Convenience —
 *      Server-Estimate ist Sicherheit. Race-Conditions zwischen Page-Render
 *      und Action-Submit werden hier abgefangen).
 *   5. Re-Check aller 3 Caps Server-Side:
 *      - checkRunCap → bei Block: 'run_cap_exceeded'
 *      - checkTenantMonthlyCap → bei Block: 'tenant_month_cap_exceeded'
 *      - checkPreApprovalThreshold + !preApprovalGranted → 'pre_approval_required'
 *   6. admin-Client INSERT ai_jobs(job_type=JOB_TYPE_EMAIL_BULK_PATTERN_EXTRACT).
 *   7. UPDATE email_bulk_run.status='pattern_extracting'. Failure-Reason wird
 *      durch Worker bei Crash gesetzt (siehe handle-pattern-extraction-job.ts).
 *   8. revalidatePath fuer Page + Detail.
 *
 * Idempotenz: Re-Run nach Crash ist ueber Worker-Idempotency-Filter (email_pattern.
 * thread_id NOT IN existing) abgedeckt. Action selbst ist nicht idempotent —
 * zweiter Call bei status='pattern_extracting' wuerde mit 'wrong_status' rejecten.
 */
export async function startPatternExtraction(
  bulkRunId: string,
  preApprovalGranted: boolean,
): Promise<StartPatternExtractionResult> {
  // 1. Auth
  const auth = await authorizeActor();
  if ("error" in auth) {
    return { ok: false, reason: "auth", message: auth.error };
  }
  const { actor } = auth;

  // 2. UUID
  if (!UUID_REGEX.test(bulkRunId)) {
    return {
      ok: false,
      reason: "uuid",
      message: "Ungueltige bulk_run_id",
    };
  }

  // 3. Status-Pre-Check via user-context (RLS-Filter sorgt fuer Tenant-Iso)
  const supabase = await createClient();
  const { data: runRow, error: runError } = await supabase
    .from("email_bulk_run")
    .select("id, status")
    .eq("id", bulkRunId)
    .maybeSingle();
  if (runError) {
    return {
      ok: false,
      reason: "db_error",
      message: `Bulk-Run-Lookup fehlgeschlagen: ${runError.message}`,
    };
  }
  if (!runRow) {
    return {
      ok: false,
      reason: "not_found",
      message: "Bulk-Run nicht gefunden",
    };
  }
  if (runRow.status !== "thread_redacted") {
    return {
      ok: false,
      reason: "wrong_status",
      message: `Start nicht moeglich — Status ist '${runRow.status}', erwartet 'thread_redacted'`,
    };
  }

  // 4. Re-Estimate aus aktuellem Thread-Stand (defensiv gegen UI-Race)
  const { data: threadRows, error: threadsError } = await supabase
    .from("email_thread")
    .select("redacted_body")
    .eq("bulk_run_id", bulkRunId)
    .eq("thread_status", "redacted");
  if (threadsError) {
    return {
      ok: false,
      reason: "db_error",
      message: `Threads-Lookup fehlgeschlagen: ${threadsError.message}`,
    };
  }
  const threadsForEstimate = (threadRows ?? []).map((t) => ({
    redactedBody: ((t as { redacted_body: string | null }).redacted_body ?? "") as string,
  }));
  if (threadsForEstimate.length === 0) {
    return {
      ok: false,
      reason: "no_threads",
      message:
        "Keine redacted Threads gefunden — Pattern-Extraktion ist ohne Threads sinnlos",
    };
  }
  const estimate = estimateBulkRunPatternCost(threadsForEstimate);

  // 5. Cap-Re-Checks Server-Side
  const caps = resolveCaps();

  // 5a. Run-Cap (hard block)
  if (!checkRunCap(estimate.costEur, caps.runCapEur)) {
    return {
      ok: false,
      reason: "run_cap_exceeded",
      message: `Run-Limit ueberschritten (${estimate.costEur.toFixed(
        2,
      )} EUR > ${caps.runCapEur} EUR). Konfigurierbar via V9_BULK_EMAIL_RUN_CAP_EUR.`,
    };
  }

  // 5b. Tenant-Monatscap (hard block)
  const adminClient = createAdminClient();
  const store = createCostCapStoreFromSupabase(adminClient);
  const tenantCheck = await checkTenantMonthlyCap(
    actor.tenantId,
    estimate.costEur,
    caps.tenantMonthCapEur,
    store,
  );
  if (!tenantCheck.allowed) {
    return {
      ok: false,
      reason: "tenant_month_cap_exceeded",
      message: `Tenant-Monatslimit ueberschritten (bereits ${tenantCheck.currentMonthEur.toFixed(
        2,
      )} EUR von ${caps.tenantMonthCapEur} EUR verbraucht, neuer Run ${estimate.costEur.toFixed(
        2,
      )} EUR). Verbleibend: ${tenantCheck.remainingEur.toFixed(2)} EUR.`,
    };
  }

  // 5c. Pre-Approval-Schwelle (Soft-Block bis preApprovalGranted=true)
  if (
    checkPreApprovalThreshold(estimate.costEur, caps.preApprovalThresholdEur) &&
    !preApprovalGranted
  ) {
    return {
      ok: false,
      reason: "pre_approval_required",
      message: `Erwartete Kosten ${estimate.costEur.toFixed(
        2,
      )} EUR ueberschreiten die Pre-Approval-Schwelle ${caps.preApprovalThresholdEur} EUR. Bitte aktiv bestaetigen.`,
    };
  }

  // 6. Enqueue ai_jobs via admin-Client (service_role, weil ai_jobs keine
  //    tenant-scoped Policy haben — Pattern aus uploadBulkEmailRun L261-266
  //    und approvePreFilterAndStartThreadRedact L286-302).
  const { data: jobRow, error: jobError } = await adminClient
    .from("ai_jobs")
    .insert({
      tenant_id: actor.tenantId,
      job_type: JOB_TYPE_EMAIL_BULK_PATTERN_EXTRACT,
      status: "pending",
      payload: { bulk_run_id: bulkRunId },
    })
    .select("id")
    .single();
  if (jobError || !jobRow) {
    return {
      ok: false,
      reason: "db_error",
      message: `Worker-Job-Enqueue fehlgeschlagen: ${
        jobError?.message ?? "unknown"
      }`,
    };
  }

  // 7. UPDATE Status — User-Context-Client, weil RLS-Policy email_bulk_run_tenant_update
  //    nur tenant_admin im eigenen Tenant erlaubt (Pattern wie handle-pre-filter
  //    aber Status-Flip-Pattern hier vor Worker-Start, weil Worker async ist).
  const { error: updateError } = await supabase
    .from("email_bulk_run")
    .update({
      status: "pattern_extracting",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bulkRunId);
  if (updateError) {
    return {
      ok: false,
      reason: "db_error",
      message: `Status-UPDATE fehlgeschlagen: ${updateError.message}`,
    };
  }

  // 8. revalidatePath fuer Page + Detail.
  revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}/pattern-start`);
  revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}`);

  return { ok: true, jobId: jobRow.id as string };
}
