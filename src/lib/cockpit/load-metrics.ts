import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BridgeRunSummary,
  CockpitMetrics,
  CockpitRunStatus,
  CockpitSnapshotStatus,
  HandbookSnapshotSummary,
} from "./types";

/**
 * SLC-040 MT-3 — Cockpit-Metrik-Loader.
 *
 * Sucht die GF-Session des Admins (capture_mode IS NULL oder != 'employee_questionnaire')
 * und laedt parallel:
 *   - blocksTotal aus template.blocks
 *   - blocksSubmitted (distinct block_keys mit checkpoint_type='questionnaire_submit')
 *   - employeesInvited (profiles.role='employee' im Tenant)
 *   - employeeTasksOpen / employeeTasksDone (capture_mode='employee_questionnaire')
 *   - lastBridgeRun, lastHandbookSnapshot
 *
 * Wenn keine GF-Session existiert, sind alle Counts 0 und captureSessionId=null.
 *
 * Der Aufrufer (Dashboard-Server-Component) hat bereits Auth + tenant-Scope
 * geprueft; RLS schuetzt zusaetzlich auf DB-Ebene.
 */

interface LoadMetricsInput {
  supabase: SupabaseClient;
  tenantId: string;
  userId: string;
}

const RUN_STATUSES = new Set<CockpitRunStatus>(["running", "completed", "failed", "stale"]);
const SNAPSHOT_STATUSES = new Set<CockpitSnapshotStatus>(["generating", "ready", "failed"]);

export async function loadCockpitMetrics({
  supabase,
  tenantId,
  userId,
}: LoadMetricsInput): Promise<CockpitMetrics> {
  // GF-Session des Admins (juengste mit Inhalten bevorzugt; Fallback juengste).
  const { data: ownSessionsRaw } = await supabase
    .from("capture_session")
    .select("id, template_id, started_at")
    .eq("tenant_id", tenantId)
    .eq("owner_user_id", userId)
    .or("capture_mode.is.null,capture_mode.neq.employee_questionnaire")
    .order("started_at", { ascending: false });

  const ownSessions = (ownSessionsRaw ?? []) as Array<{
    id: string;
    template_id: string;
    started_at: string;
  }>;

  if (ownSessions.length === 0) {
    return emptyMetrics(null);
  }

  // GF-Session-Auswahl: bevorzugt die mit dem juengsten bridge_run oder handbook_snapshot;
  // sonst juengste eigene Session.
  const ownIds = ownSessions.map((s) => s.id);
  const [{ data: priorBridge }, { data: priorHandbook }] = await Promise.all([
    supabase
      .from("bridge_run")
      .select("capture_session_id")
      .in("capture_session_id", ownIds)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("handbook_snapshot")
      .select("capture_session_id")
      .in("capture_session_id", ownIds)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const priorSessionId =
    priorBridge?.[0]?.capture_session_id ?? priorHandbook?.[0]?.capture_session_id ?? null;
  const session = priorSessionId
    ? ownSessions.find((s) => s.id === priorSessionId) ?? ownSessions[0]
    : ownSessions[0];
  const captureSessionId = session.id;

  // Parallel-Loads
  const [
    templateRes,
    checkpointsRes,
    employeesRes,
    employeeSessionsRes,
    bridgeRunRes,
    handbookSnapshotRes,
  ] = await Promise.all([
    supabase.from("template").select("blocks").eq("id", session.template_id).maybeSingle(),
    supabase
      .from("block_checkpoint")
      .select("block_key, checkpoint_type")
      .eq("capture_session_id", captureSessionId)
      .eq("checkpoint_type", "questionnaire_submit"),
    supabase
      .from("profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("role", "employee"),
    supabase
      .from("capture_session")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("capture_mode", "employee_questionnaire"),
    supabase
      .from("bridge_run")
      .select("id, status, proposal_count, created_at")
      .eq("capture_session_id", captureSessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("handbook_snapshot")
      .select("id, status, created_at")
      .eq("capture_session_id", captureSessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const blocks = (templateRes.data?.blocks ?? []) as Array<unknown>;
  const blocksTotal = Array.isArray(blocks) ? blocks.length : 0;

  // Distinct block_keys (mehrfache Submits desselben Blocks zaehlen einmal).
  const submittedBlockKeys = new Set<string>();
  for (const cp of checkpointsRes.data ?? []) {
    if (typeof cp.block_key === "string") submittedBlockKeys.add(cp.block_key);
  }
  const blocksSubmitted = submittedBlockKeys.size;

  const employeesInvited = (employeesRes.data ?? []).length;

  let employeeTasksOpen = 0;
  let employeeTasksDone = 0;
  for (const s of employeeSessionsRes.data ?? []) {
    const status = String(s.status ?? "");
    if (status === "open" || status === "in_progress") employeeTasksOpen++;
    else if (status === "submitted" || status === "finalized") employeeTasksDone++;
  }

  const lastBridgeRun = bridgeRunRes.data
    ? toBridgeRunSummary(bridgeRunRes.data as Record<string, unknown>)
    : null;
  const lastHandbookSnapshot = handbookSnapshotRes.data
    ? toHandbookSnapshotSummary(handbookSnapshotRes.data as Record<string, unknown>)
    : null;

  return {
    captureSessionId,
    blocksTotal,
    blocksSubmitted,
    employeesInvited,
    employeeTasksOpen,
    employeeTasksDone,
    lastBridgeRun,
    lastHandbookSnapshot,
  };
}

function emptyMetrics(captureSessionId: string | null): CockpitMetrics {
  return {
    captureSessionId,
    blocksTotal: 0,
    blocksSubmitted: 0,
    employeesInvited: 0,
    employeeTasksOpen: 0,
    employeeTasksDone: 0,
    lastBridgeRun: null,
    lastHandbookSnapshot: null,
  };
}

function toBridgeRunSummary(row: Record<string, unknown>): BridgeRunSummary | null {
  const status = String(row.status ?? "") as CockpitRunStatus;
  if (!RUN_STATUSES.has(status)) return null;
  return {
    id: String(row.id ?? ""),
    status,
    proposal_count: Number(row.proposal_count ?? 0),
    created_at: String(row.created_at ?? ""),
  };
}

function toHandbookSnapshotSummary(row: Record<string, unknown>): HandbookSnapshotSummary | null {
  const status = String(row.status ?? "") as CockpitSnapshotStatus;
  if (!SNAPSHOT_STATUSES.has(status)) return null;
  return {
    id: String(row.id ?? ""),
    status,
    created_at: String(row.created_at ?? ""),
  };
}
