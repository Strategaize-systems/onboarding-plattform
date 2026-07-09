import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { captureWarning } from "@/lib/logger";

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

export const OwnerFieldSchema = z.object({
  key: z.string(),
  label: z.union([z.string(), z.record(z.string(), z.string())]),
  type: z.enum(["text", "number"]).default("text"),
  required: z.boolean().default(false),
});

export type OwnerField = z.infer<typeof OwnerFieldSchema>;

export const TemplateRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string().nullable(),
  blocks: z.array(TemplateBlockSchema),
  owner_fields: z.array(OwnerFieldSchema).nullable().default(null),
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

  // ISSUE-119: Eine einzelne nicht-schema-konforme Row (z.B. Legacy-Templates
  // partner_diagnostic / exit-readiness-teaser-v1 mit title als String statt
  // i18n-Record + fehlenden IDs) darf den gesamten Erhebungs-Picker nicht
  // crashen. Per-Row safeParse: ungueltige Rows werden uebersprungen + geloggt.
  const valid: TemplateRow[] = [];
  for (const row of data ?? []) {
    const parsed = TemplateRowSchema.safeParse(row);
    if (!parsed.success) {
      const slug = (row as { slug?: unknown })?.slug ?? null;
      captureWarning("Template row skipped: schema validation failed", {
        source: "template-queries.listTemplates",
        metadata: { slug, issues: parsed.error.issues.slice(0, 5) },
      });
      continue;
    }
    // StB-Vertikale ist ein eigenes Produkt mit eigenem Flow (`/dashboard/stb/*`,
    // Env-Flag-gated) — StB-Modul-/Blueprint-Templates (slug `stb_*`) duerfen NIE
    // im generischen Erhebungs-Picker (/capture/new) eines Direkt-Client-GF
    // erscheinen (Founder 2026-07-09). Absichtlicher Ausschluss, kein Fehler → kein Log.
    if (parsed.data.slug.startsWith("stb_")) continue;
    valid.push(parsed.data);
  }
  return valid;
}
