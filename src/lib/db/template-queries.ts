import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const TemplateQuestionSchema = z.object({
  id: z.string(),
  frage_id: z.string(),
  text: z.string(),
  ebene: z.string(),
  unterbereich: z.string(),
  position: z.number().int(),
  owner_dependency: z.boolean().optional().default(false),
  deal_blocker: z.boolean().optional().default(false),
  sop_trigger: z.boolean().optional().default(false),
  ko_hart: z.boolean().optional().default(false),
  ko_soft: z.boolean().optional().default(false),
});

export type TemplateQuestion = z.infer<typeof TemplateQuestionSchema>;

export const TemplateBlockSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.record(z.string(), z.string()),
  description: z.string().optional().nullable(),
  order: z.number().int(),
  required: z.boolean().optional().default(false),
  weight: z.number().optional().default(1.0),
  questions: z.array(TemplateQuestionSchema).default([]),
});

export type TemplateBlock = z.infer<typeof TemplateBlockSchema>;

export const TemplateRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string().nullable(),
  blocks: z.array(TemplateBlockSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TemplateRow = z.infer<typeof TemplateRowSchema>;

export async function getTemplateBySlug(
  client: SupabaseClient,
  slug: string
): Promise<TemplateRow | null> {
  const { data, error } = await client
    .from("template")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return TemplateRowSchema.parse(data);
}

export async function getTemplateById(
  client: SupabaseClient,
  id: string
): Promise<TemplateRow | null> {
  const { data, error } = await client
    .from("template")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return TemplateRowSchema.parse(data);
}

export async function listTemplates(
  client: SupabaseClient
): Promise<TemplateRow[]> {
  const { data, error } = await client
    .from("template")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => TemplateRowSchema.parse(row));
}
