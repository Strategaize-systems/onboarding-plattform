import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const CaptureSessionStatusSchema = z.enum([
  "open",
  "in_progress",
  "submitted",
  "reviewed",
  "finalized",
]);

export type CaptureSessionStatus = z.infer<typeof CaptureSessionStatusSchema>;

// Note: z.string() instead of z.string().uuid() — Zod 4 strict UUID validation
// rejects the demo tenant UUID (00000000-0000-0000-0000-0000000000de) because
// the version nibble is 0, not 1-8. DB enforces uuid type already.
export const CaptureSessionRowSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  template_id: z.string(),
  template_version: z.string(),
  owner_user_id: z.string(),
  status: CaptureSessionStatusSchema,
  answers: z.record(z.string(), z.string()).default({}),
  started_at: z.string(),
  updated_at: z.string(),
  capture_mode: z.string().nullable().optional(),
});

export type CaptureSessionRow = z.infer<typeof CaptureSessionRowSchema>;

export async function getCaptureSession(
  client: SupabaseClient,
  id: string
): Promise<CaptureSessionRow | null> {
  const { data, error } = await client
    .from("capture_session")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return CaptureSessionRowSchema.parse(data);
}

export async function listCaptureSessionsForTenant(
  client: SupabaseClient,
  tenantId: string
): Promise<CaptureSessionRow[]> {
  const { data, error } = await client
    .from("capture_session")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => CaptureSessionRowSchema.parse(row));
}

export async function createCaptureSession(
  client: SupabaseClient,
  input: {
    tenant_id: string;
    template_id: string;
    template_version: string;
    owner_user_id: string;
    capture_mode?: string;
  }
): Promise<CaptureSessionRow> {
  const { data, error } = await client
    .from("capture_session")
    .insert(input)
    .select("*")
    .single();

  if (error) throw error;
  return CaptureSessionRowSchema.parse(data);
}

export async function updateCaptureSessionStatus(
  client: SupabaseClient,
  id: string,
  status: CaptureSessionStatus
): Promise<CaptureSessionRow> {
  const { data, error } = await client
    .from("capture_session")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return CaptureSessionRowSchema.parse(data);
}
