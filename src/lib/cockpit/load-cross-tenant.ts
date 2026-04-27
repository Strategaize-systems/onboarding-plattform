import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrossTenantRow } from "@/app/admin/tenants/CrossTenantCockpit";

/**
 * SLC-040 MT-6 — Aggregiert Cross-Tenant-Metriken fuer den strategaize_admin-View.
 *
 * Strategie (Foundation, V4):
 *   - Eine Query pro Tabelle (tenants/profiles/bridge_run/handbook_snapshot/
 *     capture_session/block_checkpoint) anstatt N Queries pro Tenant. Aggregation
 *     in JS — bei der erwarteten Tenant-Anzahl (<50 in V4) kein Performance-Issue.
 *
 * Die Funktion erwartet einen Client mit service_role oder strategaize_admin-
 * Rechten (Cross-Tenant-RLS). Aufrufer ist der /admin/tenants Server-Component.
 */
export async function loadCrossTenantCockpit(
  supabase: SupabaseClient
): Promise<CrossTenantRow[]> {
  const [
    tenantsRes,
    profilesRes,
    bridgeRunsRes,
    handbookSnapshotsRes,
    captureSessionsRes,
    checkpointsRes,
    templatesRes,
  ] = await Promise.all([
    supabase.from("tenants").select("id, name").order("name", { ascending: true }),
    supabase.from("profiles").select("tenant_id, role"),
    supabase
      .from("bridge_run")
      .select("tenant_id, status, proposal_count, created_at, capture_session_id")
      .order("created_at", { ascending: false }),
    supabase
      .from("handbook_snapshot")
      .select("tenant_id, status, created_at, capture_session_id")
      .order("created_at", { ascending: false }),
    supabase
      .from("capture_session")
      .select("id, tenant_id, owner_user_id, capture_mode, template_id, started_at")
      .order("started_at", { ascending: false }),
    supabase
      .from("block_checkpoint")
      .select("tenant_id, capture_session_id, block_key, checkpoint_type"),
    supabase.from("template").select("id, blocks"),
  ]);

  const tenants = (tenantsRes.data ?? []) as Array<{ id: string; name: string }>;

  // employees pro tenant
  const employeesByTenant = new Map<string, number>();
  for (const p of profilesRes.data ?? []) {
    if (p.role !== "employee" || !p.tenant_id) continue;
    employeesByTenant.set(p.tenant_id, (employeesByTenant.get(p.tenant_id) ?? 0) + 1);
  }

  // template blocks-count
  const blocksByTemplate = new Map<string, number>();
  for (const t of templatesRes.data ?? []) {
    const blocks = (t.blocks ?? []) as Array<unknown>;
    blocksByTemplate.set(t.id as string, Array.isArray(blocks) ? blocks.length : 0);
  }

  // primaere GF-Session pro Tenant: juengste mit capture_mode != employee_questionnaire
  const gfSessionByTenant = new Map<string, {
    id: string;
    template_id: string;
  }>();
  for (const s of captureSessionsRes.data ?? []) {
    if (!s.tenant_id) continue;
    if (s.capture_mode === "employee_questionnaire") continue;
    if (gfSessionByTenant.has(s.tenant_id)) continue; // erste = juengste
    gfSessionByTenant.set(s.tenant_id, {
      id: s.id as string,
      template_id: s.template_id as string,
    });
  }

  // blocksSubmitted pro GF-Session (distinct block_keys mit questionnaire_submit)
  const submittedBlocksBySession = new Map<string, Set<string>>();
  for (const cp of checkpointsRes.data ?? []) {
    if (cp.checkpoint_type !== "questionnaire_submit") continue;
    const sessionId = cp.capture_session_id as string;
    if (!sessionId) continue;
    if (!submittedBlocksBySession.has(sessionId)) {
      submittedBlocksBySession.set(sessionId, new Set());
    }
    submittedBlocksBySession.get(sessionId)!.add(cp.block_key as string);
  }

  // juengster bridge_run pro Tenant
  const latestBridgeByTenant = new Map<string, {
    status: string;
    proposal_count: number;
    capture_session_id: string;
  }>();
  for (const br of bridgeRunsRes.data ?? []) {
    if (!br.tenant_id) continue;
    if (latestBridgeByTenant.has(br.tenant_id)) continue;
    latestBridgeByTenant.set(br.tenant_id, {
      status: String(br.status ?? "none"),
      proposal_count: Number(br.proposal_count ?? 0),
      capture_session_id: br.capture_session_id as string,
    });
  }

  // juengster handbook_snapshot pro Tenant
  const latestHandbookByTenant = new Map<string, {
    status: string;
    created_at: string;
  }>();
  for (const hs of handbookSnapshotsRes.data ?? []) {
    if (!hs.tenant_id) continue;
    if (latestHandbookByTenant.has(hs.tenant_id)) continue;
    latestHandbookByTenant.set(hs.tenant_id, {
      status: String(hs.status ?? "none"),
      created_at: hs.created_at as string,
    });
  }

  return tenants.map<CrossTenantRow>((t) => {
    const gf = gfSessionByTenant.get(t.id);
    const blocksTotal = gf ? blocksByTemplate.get(gf.template_id) ?? 0 : 0;
    const blocksSubmitted = gf
      ? (submittedBlocksBySession.get(gf.id)?.size ?? 0)
      : 0;
    const bridge = latestBridgeByTenant.get(t.id);
    const hb = latestHandbookByTenant.get(t.id);

    return {
      tenant_id: t.id,
      tenant_name: t.name,
      employees_count: employeesByTenant.get(t.id) ?? 0,
      bridge_status: (bridge?.status as CrossTenantRow["bridge_status"]) ?? "none",
      bridge_proposal_count: bridge?.proposal_count ?? 0,
      handbook_status: (hb?.status as CrossTenantRow["handbook_status"]) ?? "none",
      handbook_created_at: hb?.created_at ?? null,
      blocks_submitted: blocksSubmitted,
      blocks_total: blocksTotal,
    };
  });
}
