import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const KnowledgeUnitConfidenceSchema = z.enum(["low", "medium", "high"]);
export type KnowledgeUnitConfidence = z.infer<typeof KnowledgeUnitConfidenceSchema>;

export const KnowledgeUnitSourceSchema = z.enum([
  "questionnaire",
  "exception",
  "ai_draft",
  "meeting_final",
  "manual",
]);
export type KnowledgeUnitSource = z.infer<typeof KnowledgeUnitSourceSchema>;

export const KnowledgeUnitTypeSchema = z.enum([
  "finding",
  "risk",
  "action",
  "observation",
  "ai_draft",
]);
export type KnowledgeUnitType = z.infer<typeof KnowledgeUnitTypeSchema>;

export const KnowledgeUnitStatusSchema = z.enum([
  "proposed",
  "accepted",
  "edited",
  "rejected",
]);
export type KnowledgeUnitStatus = z.infer<typeof KnowledgeUnitStatusSchema>;

export const KnowledgeUnitRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  capture_session_id: z.string().uuid(),
  block_checkpoint_id: z.string().uuid(),
  block_key: z.string(),
  unit_type: KnowledgeUnitTypeSchema,
  source: KnowledgeUnitSourceSchema,
  title: z.string(),
  body: z.string(),
  confidence: KnowledgeUnitConfidenceSchema,
  evidence_refs: z.array(z.unknown()).default([]),
  status: KnowledgeUnitStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
  updated_by: z.string().uuid().nullable(),
});

export type KnowledgeUnitRow = z.infer<typeof KnowledgeUnitRowSchema>;

export async function listKnowledgeUnitsForBlock(
  client: SupabaseClient,
  captureSessionId: string,
  blockKey: string
): Promise<KnowledgeUnitRow[]> {
  const { data, error } = await client
    .from("knowledge_unit")
    .select("*")
    .eq("capture_session_id", captureSessionId)
    .eq("block_key", blockKey)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => KnowledgeUnitRowSchema.parse(row));
}

export async function listKnowledgeUnitsForCheckpoint(
  client: SupabaseClient,
  blockCheckpointId: string
): Promise<KnowledgeUnitRow[]> {
  const { data, error } = await client
    .from("knowledge_unit")
    .select("*")
    .eq("block_checkpoint_id", blockCheckpointId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => KnowledgeUnitRowSchema.parse(row));
}

export async function getKnowledgeUnit(
  client: SupabaseClient,
  id: string
): Promise<KnowledgeUnitRow | null> {
  const { data, error } = await client
    .from("knowledge_unit")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return KnowledgeUnitRowSchema.parse(data);
}
