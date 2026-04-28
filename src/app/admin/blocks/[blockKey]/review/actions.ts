"use server";

// SLC-041 MT-3 — Approve/Reject Server-Actions fuer Berater-Review-Workflow.
//
// strategaize_admin-only (DEC-044 Approval-Hoheit). tenant_admin kann reviews lesen
// (RLS-Policy block_review_tenant_admin_select), aber nicht aendern.
//
// Beide Actions upserten die block_review-Row mit reviewed_by=auth.uid() + reviewed_at=now().
// Optional: note (z.B. Reject-Begruendung).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { captureException } from "@/lib/logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLOCK_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NOTE_MAX_LENGTH = 2000;

export interface BlockReviewActionInput {
  tenantId: string;
  sessionId: string;
  blockKey: string;
  note?: string | null;
}

type ActionResult = { ok: true } | { ok: false; error: string };

function validateInput(input: BlockReviewActionInput): string | null {
  if (!input.tenantId || !UUID_RE.test(input.tenantId)) return "tenant_id_invalid";
  if (!input.sessionId || !UUID_RE.test(input.sessionId)) return "session_id_invalid";
  if (!input.blockKey || !BLOCK_KEY_RE.test(input.blockKey)) return "block_key_invalid";
  if (input.note && input.note.length > NOTE_MAX_LENGTH) return "note_too_long";
  return null;
}

async function upsertBlockReview(
  input: BlockReviewActionInput,
  status: "approved" | "rejected",
  source: string,
): Promise<ActionResult> {
  const validation = validateInput(input);
  if (validation) return { ok: false, error: validation };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") {
    return { ok: false, error: "forbidden" };
  }

  const reviewedAt = new Date().toISOString();
  const { error } = await supabase
    .from("block_review")
    .upsert(
      {
        tenant_id: input.tenantId,
        capture_session_id: input.sessionId,
        block_key: input.blockKey,
        status,
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
        note: input.note ?? null,
        updated_at: reviewedAt,
      },
      { onConflict: "tenant_id,capture_session_id,block_key" },
    );

  if (error) {
    captureException(new Error(error.message), {
      source,
      metadata: {
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        blockKey: input.blockKey,
        status,
      },
    });
    return { ok: false, error: "upsert_failed" };
  }

  revalidatePath(`/admin/blocks/${input.blockKey}/review`);
  revalidatePath("/admin/reviews");
  revalidatePath(`/admin/tenants/${input.tenantId}/reviews`);
  revalidatePath("/dashboard");

  return { ok: true };
}

export async function approveBlockReview(
  input: BlockReviewActionInput,
): Promise<ActionResult> {
  return upsertBlockReview(input, "approved", "admin/blocks/review/approveBlockReview");
}

export async function rejectBlockReview(
  input: BlockReviewActionInput,
): Promise<ActionResult> {
  return upsertBlockReview(input, "rejected", "admin/blocks/review/rejectBlockReview");
}
