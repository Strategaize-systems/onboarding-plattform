"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  buildCleanEditedPayload,
  validateApproveInput,
  validateRejectInput,
  validateTriggerInput,
  type EditedProposalPayload,
} from "./action-helpers";

/**
 * SLC-036 MT-5 — tenant_admin Server-Actions fuer Bridge-Engine UI.
 *
 * triggerBridgeRun:
 *   - Auth + tenant_admin/strategaize_admin Check.
 *   - rpc_trigger_bridge_run(p_capture_session_id) -> {bridge_run_id}
 *
 * approveBridgeProposal:
 *   - rpc_approve_bridge_proposal(p_proposal_id, p_edited_payload jsonb)
 *   - Returns {captureSessionId} fuer optionale "Zur Aufgabe springen"-Logik.
 *
 * rejectBridgeProposal:
 *   - rpc_reject_bridge_proposal(p_proposal_id, p_reason).
 *
 * Validierungs- und Whitelist-Logik liegt in action-helpers.ts (testbar ohne Supabase).
 *
 * EditedProposalPayload-Type wird DIREKT aus action-helpers importiert, nicht
 * von hier re-exportiert: Next.js "use server"-Files duerfen nur async-function-
 * Exports haben, type-Re-Exports brechen die Server-Action-Compilation
 * (ReferenceError: ... is not defined zur Laufzeit).
 */

type ActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

type AdminAuthResult =
  | { ok: false; error: "unauthenticated" | "forbidden" }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      profile: { role: string; tenant_id: string };
      user: { id: string };
    };

async function requireAdminClient(): Promise<AdminAuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["tenant_admin", "strategaize_admin"].includes(profile.role)) {
    return { ok: false, error: "forbidden" };
  }

  return { ok: true, supabase, profile, user };
}

export async function triggerBridgeRun(
  captureSessionId: string
): Promise<ActionResult<{ bridgeRunId: string }>> {
  const validationError = validateTriggerInput(captureSessionId);
  if (validationError) return { ok: false, error: validationError };

  const auth = await requireAdminClient();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data, error } = await auth.supabase.rpc("rpc_trigger_bridge_run", {
    p_capture_session_id: captureSessionId,
  });

  if (error) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(error.message), { source: "admin/bridge/triggerBridgeRun" });
    return { ok: false, error: "rpc_failed" };
  }

  const result = data as Record<string, unknown> | null;
  if (!result || typeof result.error === "string") {
    return { ok: false, error: (result?.error as string) ?? "unknown_error" };
  }

  const bridgeRunId = result.bridge_run_id;
  if (typeof bridgeRunId !== "string") {
    return { ok: false, error: "rpc_invalid_response" };
  }

  revalidatePath("/admin/bridge");
  return { ok: true, bridgeRunId };
}

export async function approveBridgeProposal(
  proposalId: string,
  editedPayload?: EditedProposalPayload
): Promise<ActionResult<{ captureSessionId: string; already?: boolean }>> {
  const validationError = validateApproveInput(proposalId, editedPayload);
  if (validationError) return { ok: false, error: validationError };

  const auth = await requireAdminClient();
  if (!auth.ok) return { ok: false, error: auth.error };

  const cleanPayload = buildCleanEditedPayload(editedPayload);

  const { data, error } = await auth.supabase.rpc("rpc_approve_bridge_proposal", {
    p_proposal_id: proposalId,
    p_edited_payload: cleanPayload,
  });

  if (error) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(error.message), { source: "admin/bridge/approveBridgeProposal" });
    return { ok: false, error: "rpc_failed" };
  }

  const result = data as Record<string, unknown> | null;
  if (!result || typeof result.error === "string") {
    return { ok: false, error: (result?.error as string) ?? "unknown_error" };
  }

  const captureSessionId = result.capture_session_id;
  if (typeof captureSessionId !== "string") {
    return { ok: false, error: "rpc_invalid_response" };
  }

  revalidatePath("/admin/bridge");
  revalidatePath("/dashboard");
  return {
    ok: true,
    captureSessionId,
    already: result.already === true,
  };
}

export async function rejectBridgeProposal(
  proposalId: string,
  reason: string
): Promise<ActionResult> {
  const validation = validateRejectInput(proposalId, reason);
  if ("error" in validation) return { ok: false, error: validation.error };

  const auth = await requireAdminClient();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data, error } = await auth.supabase.rpc("rpc_reject_bridge_proposal", {
    p_proposal_id: proposalId,
    p_reason: validation.reason,
  });

  if (error) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(error.message), { source: "admin/bridge/rejectBridgeProposal" });
    return { ok: false, error: "rpc_failed" };
  }

  const result = data as Record<string, unknown> | null;
  if (!result || typeof result.error === "string") {
    return { ok: false, error: (result?.error as string) ?? "unknown_error" };
  }

  if (result.rejected !== true) {
    return { ok: false, error: "rpc_invalid_response" };
  }

  revalidatePath("/admin/bridge");
  return { ok: true };
}
