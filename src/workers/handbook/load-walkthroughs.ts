// SLC-091 MT-2 — Loader fuer approved Walkthroughs (FEAT-038, V5.1).
//
// Lae dt pro Tenant alle walkthrough_session.status='approved' inkl. zugehoerige
// walkthrough_step (deleted_at IS NULL) + walkthrough_review_mapping. Recorder-
// Email kommt via JOIN auf profiles (LEFT JOIN; falls user fehlt -> "Unbekannter
// Mitarbeiter"). Aggregierte WalkthroughRow[]-Ausgabe ist Renderer-Input fuer
// renderWalkthroughsSection.
//
// Pattern: 3 separate Queries + JS-side aggregieren (RLS-friendly, weil
// service_role BYPASSRLS hat aber wir haben Tenant-Check explizit; einfacher
// als JOIN-Query mit pgrst-Selectable-Embedding).

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WalkthroughMappingRow,
  WalkthroughRow,
  WalkthroughStepRow,
} from "./types";

interface SessionDbRow {
  id: string;
  tenant_id: string;
  recorded_by_user_id: string;
  storage_path: string | null;
  duration_sec: number | null;
  reviewed_at: string | null;
  created_at: string;
}

interface StepDbRow {
  id: string;
  walkthrough_session_id: string;
  step_number: number;
  action: string;
  responsible: string | null;
  timeframe: string | null;
  success_criterion: string | null;
  dependencies: string | null;
  transcript_snippet: string | null;
}

interface MappingDbRow {
  walkthrough_step_id: string;
  subtopic_id: string | null;
  confidence_band: "green" | "yellow" | "red";
  reviewer_corrected: boolean;
}

interface ProfileDbRow {
  id: string;
  email: string | null;
}

const FALLBACK_RECORDER_NAME = "Unbekannter Mitarbeiter";

/**
 * Liefert pro Tenant alle approved Walkthrough-Sessions inkl. Steps + Mappings.
 * Sessions ohne Steps werden NICHT zurueckgegeben — eine approved Session ohne
 * Steps haetten der Renderer als leere Section rendern koennen, aber ein
 * Berater kann nicht ohne Steps approven (FEAT-040 fordert mind. 1 Schritt).
 */
export async function loadApprovedWalkthroughs(
  adminClient: SupabaseClient,
  tenantId: string,
): Promise<WalkthroughRow[]> {
  // 1. Sessions
  const { data: sessionsRaw, error: sessionsErr } = await adminClient
    .from("walkthrough_session")
    .select(
      "id, tenant_id, recorded_by_user_id, storage_path, duration_sec, reviewed_at, created_at",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (sessionsErr) {
    throw new Error(
      `loadApprovedWalkthroughs: failed to load walkthrough_session for tenant ${tenantId}: ${sessionsErr.message}`,
    );
  }

  const sessions = (sessionsRaw ?? []) as SessionDbRow[];
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const recorderIds = Array.from(new Set(sessions.map((s) => s.recorded_by_user_id)));

  // 2. Steps (deleted_at IS NULL) parallel mit 3+4
  const [stepsRes, recordersRes] = await Promise.all([
    adminClient
      .from("walkthrough_step")
      .select(
        "id, walkthrough_session_id, step_number, action, responsible, timeframe, success_criterion, dependencies, transcript_snippet",
      )
      .in("walkthrough_session_id", sessionIds)
      .is("deleted_at", null)
      .order("step_number", { ascending: true }),
    adminClient
      .from("profiles")
      .select("id, email")
      .in("id", recorderIds),
  ]);

  if (stepsRes.error) {
    throw new Error(
      `loadApprovedWalkthroughs: failed to load walkthrough_step: ${stepsRes.error.message}`,
    );
  }
  if (recordersRes.error) {
    throw new Error(
      `loadApprovedWalkthroughs: failed to load profiles: ${recordersRes.error.message}`,
    );
  }

  const steps = (stepsRes.data ?? []) as StepDbRow[];
  const recorders = (recordersRes.data ?? []) as ProfileDbRow[];

  // 3. Mappings (nur fuer geladene Steps)
  const stepIds = steps.map((s) => s.id);
  let mappings: MappingDbRow[] = [];
  if (stepIds.length > 0) {
    const { data: mappingsRaw, error: mappingsErr } = await adminClient
      .from("walkthrough_review_mapping")
      .select("walkthrough_step_id, subtopic_id, confidence_band, reviewer_corrected")
      .in("walkthrough_step_id", stepIds);
    if (mappingsErr) {
      throw new Error(
        `loadApprovedWalkthroughs: failed to load walkthrough_review_mapping: ${mappingsErr.message}`,
      );
    }
    mappings = (mappingsRaw ?? []) as MappingDbRow[];
  }

  // 4. Aggregieren
  const recorderEmailById = new Map(recorders.map((r) => [r.id, r.email]));
  const stepsBySession = new Map<string, StepDbRow[]>();
  for (const step of steps) {
    const arr = stepsBySession.get(step.walkthrough_session_id) ?? [];
    arr.push(step);
    stepsBySession.set(step.walkthrough_session_id, arr);
  }
  const mappingsByStep = new Map<string, MappingDbRow>();
  for (const m of mappings) {
    mappingsByStep.set(m.walkthrough_step_id, m);
  }

  const result: WalkthroughRow[] = [];
  for (const session of sessions) {
    const sessionSteps = stepsBySession.get(session.id) ?? [];
    if (sessionSteps.length === 0) continue; // skip sessions ohne Steps

    const stepRows: WalkthroughStepRow[] = sessionSteps.map((s) => ({
      id: s.id,
      step_number: s.step_number,
      action: s.action,
      responsible: s.responsible,
      timeframe: s.timeframe,
      success_criterion: s.success_criterion,
      dependencies: s.dependencies,
      transcript_snippet: s.transcript_snippet,
    }));

    const mappingRows: WalkthroughMappingRow[] = sessionSteps
      .map((s) => mappingsByStep.get(s.id))
      .filter((m): m is MappingDbRow => m !== undefined)
      .map((m) => ({
        walkthrough_step_id: m.walkthrough_step_id,
        subtopic_id: m.subtopic_id,
        confidence_band: m.confidence_band,
        reviewer_corrected: m.reviewer_corrected,
      }));

    const email = recorderEmailById.get(session.recorded_by_user_id);
    const recorderDisplayName = displayNameFromEmail(email) ?? FALLBACK_RECORDER_NAME;

    result.push({
      id: session.id,
      tenant_id: session.tenant_id,
      recorded_by_user_id: session.recorded_by_user_id,
      recorder_display_name: recorderDisplayName,
      created_at: session.created_at,
      reviewed_at: session.reviewed_at,
      duration_sec: session.duration_sec,
      steps: stepRows,
      mappings: mappingRows,
    });
  }

  return result;
}

function displayNameFromEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return email.slice(0, at);
}
