// SLC-139 MT-5/MT-6 (FEAT-058) — Data-Fetching fuer Funnel-Analytics-Page.
//
// Trennt I/O (Supabase-Admin-Client) von der reinen Aggregations-Logik in
// `src/lib/diagnose-analytics/aggregations.ts`. Erlaubt der page.tsx, ein
// schmales async-Interface zu konsumieren und der MT-6-Erweiterung
// (30min-Abandoned), in `computeAnalytics({ nowIso })` gleichzeitig
// einzufliessen.
//
// NICHT als Server-Action markiert: wir rufen die Funktionen vom Server
// Component-Tree, kein `"use server"` noetig.

import { createAdminClient } from "@/lib/supabase/admin";
import type { RawDiagnoseEvent } from "@/lib/diagnose-analytics/aggregations";
import type { TemplateBlock } from "@/workers/condensation/light-pipeline";

export type DateRangeDays = 7 | 30 | 90;

export interface LoadEventsInput {
  rangeDays: DateRangeDays;
  includeTest: boolean;
  partnerOrgId: string | null;
  nowIso?: string;
}

export interface LoadEventsResult {
  events: RawDiagnoseEvent[];
  truncated: boolean;
}

const ROW_LIMIT = 50_000;

export async function loadDiagnoseEvents(
  input: LoadEventsInput,
): Promise<LoadEventsResult> {
  const admin = createAdminClient();
  const now = input.nowIso ? new Date(input.nowIso) : new Date();
  const fromIso = new Date(now.getTime() - input.rangeDays * 24 * 60 * 60 * 1000).toISOString();

  let query = admin
    .from("diagnose_event")
    .select(
      "capture_session_id, event_type, question_key, created_at, partner_org_id, is_test",
    )
    .gte("created_at", fromIso)
    .order("created_at", { ascending: true })
    .limit(ROW_LIMIT + 1);

  if (!input.includeTest) {
    query = query.eq("is_test", false);
  }
  if (input.partnerOrgId) {
    query = query.eq("partner_org_id", input.partnerOrgId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as RawDiagnoseEvent[];
  if (rows.length > ROW_LIMIT) {
    return { events: rows.slice(0, ROW_LIMIT), truncated: true };
  }
  return { events: rows, truncated: false };
}

export async function loadPartnerDiagnosticQuestionKeys(): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("template")
    .select("blocks")
    .eq("slug", "partner_diagnostic")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) return [];

  const blocks = (data.blocks ?? []) as TemplateBlock[];
  const keys: string[] = [];
  for (const block of blocks) {
    for (const question of block.questions ?? []) {
      keys.push(question.key);
    }
  }
  return keys;
}

export interface PartnerOption {
  id: string;
  label: string;
}

export async function loadPartnerOptions(): Promise<PartnerOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("partner_organization")
    .select("tenant_id, display_name, legal_name")
    .order("display_name", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.tenant_id as string,
    label: (row.display_name as string) || (row.legal_name as string),
  }));
}
