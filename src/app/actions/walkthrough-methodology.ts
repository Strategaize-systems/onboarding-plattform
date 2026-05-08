"use server";

// V5 Option 2 Stufe 4 — Methodik-Review-UI Server Actions (SLC-079 MT-1, FEAT-040).
//
// Berater (strategaize_admin oder tenant_admin im eigenen Tenant) korrigieren das
// Auto-Mapping aus Stufe 3, editieren walkthrough_step bei Bedarf, soft-deleten
// abwegige Schritte, approven/rejecten den Methodik-Output und loggen Roh-Transkript-
// Aktivierung als Audit-Trail.
//
// Auth-Pattern: User-Client (createClient) fuer Auth + RLS-Vorpruefung,
// Admin-Client (createAdminClient/service_role) fuer kreuzende Updates auf
// walkthrough_review_mapping + walkthrough_step + error_log (RLS-bypass mit
// expliziter Tenant-Validierung im Code).
//
// Audit-Trail: error_log INSERT mit source='walkthrough_methodology' und
// metadata.category. Onboarding-Plattform error_log-Schema hat KEIN category-
// Feld auf Top-Level (verifiziert in /backend SLC-078) — category lebt in
// metadata JSONB.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

const REVIEWER_ROLES = new Set(["strategaize_admin", "tenant_admin"]);

interface ReviewerContext {
  userId: string;
  role: "strategaize_admin" | "tenant_admin";
  tenantId: string | null;
}

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Liest authenticated User + Profile-Rolle. Wirft ueber Result-Pattern wenn
 * nicht-Reviewer-Rolle oder kein Auth.
 */
async function requireReviewer(): Promise<
  { ok: true; reviewer: ReviewerContext } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return { ok: false, error: "profile_missing" };
  }
  if (!REVIEWER_ROLES.has(profile.role as string)) {
    return { ok: false, error: "forbidden" };
  }

  return {
    ok: true,
    reviewer: {
      userId: user.id,
      role: profile.role as ReviewerContext["role"],
      tenantId: (profile.tenant_id as string | null) ?? null,
    },
  };
}

/**
 * Prueft, ob der Reviewer auf den Tenant der Session zugreifen darf.
 * strategaize_admin darf cross-tenant; tenant_admin nur eigenen Tenant.
 */
function isTenantAccessible(
  reviewer: ReviewerContext,
  sessionTenantId: string,
): boolean {
  if (reviewer.role === "strategaize_admin") return true;
  return reviewer.tenantId === sessionTenantId;
}

async function logAudit(input: {
  category: string;
  message: string;
  userId: string;
  walkthroughSessionId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("error_log").insert({
    level: "info",
    source: "walkthrough_methodology",
    message: input.message,
    user_id: input.userId,
    metadata: {
      category: input.category,
      walkthrough_session_id: input.walkthroughSessionId,
      ...input.metadata,
    },
  });
  if (error) {
    // Audit-Log darf den User-Flow nicht brechen (best-effort).
    const { captureException } = await import("@/lib/logger");
    captureException(error, {
      source: "walkthrough-methodology",
      metadata: { category: input.category },
    });
  }
}

// =============================================================================
// 1. moveWalkthroughStepMapping — Berater verschiebt einen Schritt zu einem
//    anderen Subtopic (oder ins Unmapped-Bucket via newSubtopicId=null).
// =============================================================================

export interface MoveWalkthroughStepMappingInput {
  walkthroughStepId: string;
  newSubtopicId: string | null;
}

export async function moveWalkthroughStepMapping(
  input: MoveWalkthroughStepMappingInput,
): Promise<ActionResult> {
  if (!isUuid(input.walkthroughStepId)) {
    return { ok: false, error: "step_id_invalid" };
  }
  if (
    input.newSubtopicId !== null &&
    (typeof input.newSubtopicId !== "string" || input.newSubtopicId.length === 0)
  ) {
    return { ok: false, error: "subtopic_id_invalid" };
  }

  const auth = await requireReviewer();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  // Step + Tenant lesen fuer Tenant-Isolation
  const { data: stepRow, error: stepError } = await admin
    .from("walkthrough_step")
    .select("id, tenant_id, walkthrough_session_id")
    .eq("id", input.walkthroughStepId)
    .single();
  if (stepError || !stepRow) {
    return { ok: false, error: "step_not_found" };
  }

  if (!isTenantAccessible(auth.reviewer, stepRow.tenant_id as string)) {
    return { ok: false, error: "forbidden_tenant" };
  }

  // UPDATE walkthrough_review_mapping. confidence_band wird via GENERATED-Column
  // automatisch neu berechnet (DB-side).
  const { error: updateError } = await admin
    .from("walkthrough_review_mapping")
    .update({
      subtopic_id: input.newSubtopicId,
      reviewer_corrected: true,
      reviewer_user_id: auth.reviewer.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("walkthrough_step_id", input.walkthroughStepId);
  if (updateError) {
    return { ok: false, error: "update_failed" };
  }

  await logAudit({
    category: "walkthrough_step_moved",
    message: `Schritt ${input.walkthroughStepId} verschoben zu ${input.newSubtopicId ?? "Unmapped"}`,
    userId: auth.reviewer.userId,
    walkthroughSessionId: stepRow.walkthrough_session_id as string,
    metadata: { newSubtopicId: input.newSubtopicId },
  });

  revalidatePath(
    `/admin/walkthroughs/${stepRow.walkthrough_session_id as string}`,
  );
  return { ok: true };
}

// =============================================================================
// 2. editWalkthroughStep — Berater korrigiert action / responsible / etc.
// =============================================================================

export interface EditWalkthroughStepInput {
  walkthroughStepId: string;
  patches: {
    action?: string;
    responsible?: string | null;
    timeframe?: string | null;
    success_criterion?: string | null;
    dependencies?: string | null;
  };
}

const EDITABLE_FIELDS = new Set([
  "action",
  "responsible",
  "timeframe",
  "success_criterion",
  "dependencies",
]);

export async function editWalkthroughStep(
  input: EditWalkthroughStepInput,
): Promise<ActionResult> {
  if (!isUuid(input.walkthroughStepId)) {
    return { ok: false, error: "step_id_invalid" };
  }
  if (!input.patches || typeof input.patches !== "object") {
    return { ok: false, error: "patches_missing" };
  }

  const cleanPatches: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.patches)) {
    if (!EDITABLE_FIELDS.has(key)) continue;
    if (key === "action") {
      if (typeof value !== "string" || value.trim().length === 0) {
        return { ok: false, error: "action_required" };
      }
      cleanPatches.action = value.trim();
    } else {
      cleanPatches[key] =
        typeof value === "string" ? (value.trim() || null) : value;
    }
  }

  if (Object.keys(cleanPatches).length === 0) {
    return { ok: false, error: "no_patches" };
  }

  const auth = await requireReviewer();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: stepRow, error: stepError } = await admin
    .from("walkthrough_step")
    .select("id, tenant_id, walkthrough_session_id")
    .eq("id", input.walkthroughStepId)
    .single();
  if (stepError || !stepRow) return { ok: false, error: "step_not_found" };
  if (!isTenantAccessible(auth.reviewer, stepRow.tenant_id as string)) {
    return { ok: false, error: "forbidden_tenant" };
  }

  cleanPatches.edited_by_user_id = auth.reviewer.userId;
  cleanPatches.edited_at = new Date().toISOString();

  const { error: updateError } = await admin
    .from("walkthrough_step")
    .update(cleanPatches)
    .eq("id", input.walkthroughStepId);
  if (updateError) {
    return { ok: false, error: "update_failed" };
  }

  await logAudit({
    category: "walkthrough_step_edited",
    message: `Schritt ${input.walkthroughStepId} editiert (${Object.keys(cleanPatches).filter((k) => k !== "edited_by_user_id" && k !== "edited_at").join(", ")})`,
    userId: auth.reviewer.userId,
    walkthroughSessionId: stepRow.walkthrough_session_id as string,
  });

  revalidatePath(
    `/admin/walkthroughs/${stepRow.walkthrough_session_id as string}`,
  );
  return { ok: true };
}

// =============================================================================
// 3. softDeleteWalkthroughStep — Berater markiert Schritt als geloescht.
// =============================================================================

export interface SoftDeleteWalkthroughStepInput {
  walkthroughStepId: string;
}

export async function softDeleteWalkthroughStep(
  input: SoftDeleteWalkthroughStepInput,
): Promise<ActionResult> {
  if (!isUuid(input.walkthroughStepId)) {
    return { ok: false, error: "step_id_invalid" };
  }

  const auth = await requireReviewer();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: stepRow, error: stepError } = await admin
    .from("walkthrough_step")
    .select("id, tenant_id, walkthrough_session_id, deleted_at")
    .eq("id", input.walkthroughStepId)
    .single();
  if (stepError || !stepRow) return { ok: false, error: "step_not_found" };
  if (!isTenantAccessible(auth.reviewer, stepRow.tenant_id as string)) {
    return { ok: false, error: "forbidden_tenant" };
  }
  if (stepRow.deleted_at) return { ok: false, error: "already_deleted" };

  const { error: updateError } = await admin
    .from("walkthrough_step")
    .update({
      deleted_at: new Date().toISOString(),
      edited_by_user_id: auth.reviewer.userId,
      edited_at: new Date().toISOString(),
    })
    .eq("id", input.walkthroughStepId);
  if (updateError) return { ok: false, error: "update_failed" };

  await logAudit({
    category: "walkthrough_step_deleted",
    message: `Schritt ${input.walkthroughStepId} soft-deleted`,
    userId: auth.reviewer.userId,
    walkthroughSessionId: stepRow.walkthrough_session_id as string,
  });

  revalidatePath(
    `/admin/walkthroughs/${stepRow.walkthrough_session_id as string}`,
  );
  return { ok: true };
}

// =============================================================================
// 4. approveOrRejectWalkthroughMethodology — Pflicht-Privacy-Checkbox bei
//    Approve, Reject mit optionalem Reason.
// =============================================================================

export interface ApproveOrRejectWalkthroughMethodologyInput {
  walkthroughSessionId: string;
  decision: "approved" | "rejected";
  privacyCheckboxConfirmed: boolean;
  reviewerNote?: string | null;
  rejectionReason?: string | null;
}

export async function approveOrRejectWalkthroughMethodology(
  input: ApproveOrRejectWalkthroughMethodologyInput,
): Promise<ActionResult> {
  if (!isUuid(input.walkthroughSessionId)) {
    return { ok: false, error: "session_id_invalid" };
  }
  if (input.decision !== "approved" && input.decision !== "rejected") {
    return { ok: false, error: "decision_invalid" };
  }
  if (input.decision === "approved" && !input.privacyCheckboxConfirmed) {
    return { ok: false, error: "privacy_checkbox_required" };
  }

  const auth = await requireReviewer();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: sessionRow, error: sessionError } = await admin
    .from("walkthrough_session")
    .select("id, tenant_id, status")
    .eq("id", input.walkthroughSessionId)
    .single();
  if (sessionError || !sessionRow) return { ok: false, error: "session_not_found" };
  if (!isTenantAccessible(auth.reviewer, sessionRow.tenant_id as string)) {
    return { ok: false, error: "forbidden_tenant" };
  }
  if (sessionRow.status !== "pending_review") {
    return { ok: false, error: "wrong_status" };
  }

  const updatePatch: Record<string, unknown> = {
    status: input.decision,
    reviewer_user_id: auth.reviewer.userId,
    reviewed_at: new Date().toISOString(),
  };

  if (input.decision === "approved") {
    updatePatch.privacy_checkbox_confirmed = true;
    if (input.reviewerNote !== undefined && input.reviewerNote !== null) {
      const trimmed = input.reviewerNote.trim();
      if (trimmed.length > 0) updatePatch.reviewer_note = trimmed;
    }
  } else {
    if (input.rejectionReason !== undefined && input.rejectionReason !== null) {
      const trimmed = input.rejectionReason.trim();
      if (trimmed.length > 0) updatePatch.rejection_reason = trimmed;
    }
  }

  const { error: updateError } = await admin
    .from("walkthrough_session")
    .update(updatePatch)
    .eq("id", input.walkthroughSessionId);
  if (updateError) return { ok: false, error: "update_failed" };

  await logAudit({
    category: "walkthrough_methodology_review",
    message: `Walkthrough ${input.walkthroughSessionId} ${input.decision}`,
    userId: auth.reviewer.userId,
    walkthroughSessionId: input.walkthroughSessionId,
    metadata: {
      decision: input.decision,
      hasNote: Boolean(input.reviewerNote?.trim()),
      hasReason: Boolean(input.rejectionReason?.trim()),
    },
  });

  revalidatePath(`/admin/walkthroughs/${input.walkthroughSessionId}`);
  revalidatePath("/admin/walkthroughs");
  return { ok: true };
}

// =============================================================================
// 5. logRawTranscriptView — DEC-088: 1 Audit-Eintrag pro Toggle-Aktivierung.
// =============================================================================

export interface LogRawTranscriptViewInput {
  walkthroughSessionId: string;
}

export async function logRawTranscriptView(
  input: LogRawTranscriptViewInput,
): Promise<ActionResult> {
  if (!isUuid(input.walkthroughSessionId)) {
    return { ok: false, error: "session_id_invalid" };
  }

  const auth = await requireReviewer();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: sessionRow, error: sessionError } = await admin
    .from("walkthrough_session")
    .select("id, tenant_id")
    .eq("id", input.walkthroughSessionId)
    .single();
  if (sessionError || !sessionRow) return { ok: false, error: "session_not_found" };
  if (!isTenantAccessible(auth.reviewer, sessionRow.tenant_id as string)) {
    return { ok: false, error: "forbidden_tenant" };
  }

  await logAudit({
    category: "walkthrough_raw_transcript_view",
    message: "Roh-Transkript aktiviert",
    userId: auth.reviewer.userId,
    walkthroughSessionId: input.walkthroughSessionId,
  });

  return { ok: true };
}
