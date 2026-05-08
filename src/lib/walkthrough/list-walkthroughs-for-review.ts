// SLC-079 MT-4 — Listing-Helper fuer Methodik-Review-Routen.
//
// Liefert pro walkthrough_session: Tenant-Name, Recorder-Email, Status, mapping-Stats
// (mapped + unmapped Counts). Nutzt service_role / adminClient (Cross-Tenant ohne RLS-
// Friction). Tenant-Filter optional.
//
// Performance-Annahme: V5 ist Internal-Test-Mode mit <50 pending Walkthroughs,
// daher reicht 4 Queries + JS-Aggregation. Bei >100 pending Sessions sollte ein
// SQL-View mit COUNT(DISTINCT walkthrough_step_id) FILTER (WHERE subtopic_id IS NULL)
// nachgezogen werden — aktuell YAGNI.

import type { SupabaseClient } from "@supabase/supabase-js";

export type WalkthroughListStatus = "pending_review" | "approved" | "rejected" | "all";

export interface WalkthroughListRow {
  id: string;
  tenantId: string;
  tenantName: string;
  recordedByEmail: string | null;
  status: string;
  createdAt: string | null;
  reviewedAt: string | null;
  mappedCount: number;
  unmappedCount: number;
}

export async function listWalkthroughsForReview(
  admin: SupabaseClient,
  options: {
    tenantId?: string;
    status?: WalkthroughListStatus;
  } = {},
): Promise<WalkthroughListRow[]> {
  const status = options.status ?? "pending_review";

  let query = admin
    .from("walkthrough_session")
    .select(
      "id, tenant_id, recorded_by_user_id, status, created_at, reviewed_at",
    )
    .order("created_at", { ascending: true });

  if (options.tenantId) {
    query = query.eq("tenant_id", options.tenantId);
  }

  if (status !== "all") {
    query = query.eq("status", status);
  } else {
    // "all" zeigt nur die 3 review-relevanten Stati, nicht recording/uploaded etc.
    query = query.in("status", ["pending_review", "approved", "rejected"]);
  }

  const { data: sessions, error } = await query;
  if (error) {
    throw new Error(`listWalkthroughsForReview failed: ${error.message}`);
  }
  if (!sessions || sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id as string);
  const tenantIds = Array.from(
    new Set(sessions.map((s) => s.tenant_id as string)),
  );
  const recorderIds = Array.from(
    new Set(
      sessions
        .map((s) => s.recorded_by_user_id as string | null)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  // Parallel laden: Tenants + Profiles + Steps (Mappings separat im 2. Schritt)
  const [tenantsRes, profilesRes, stepsRes] = await Promise.all([
    admin
      .from("tenants")
      .select("id, name")
      .in("id", tenantIds),
    recorderIds.length > 0
      ? admin
          .from("profiles")
          .select("id, email")
          .in("id", recorderIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("walkthrough_step")
      .select("id, walkthrough_session_id")
      .in("walkthrough_session_id", sessionIds)
      .is("deleted_at", null),
  ]);

  if (tenantsRes.error) {
    throw new Error(`tenants lookup failed: ${tenantsRes.error.message}`);
  }
  if (profilesRes.error) {
    throw new Error(`profiles lookup failed: ${profilesRes.error.message}`);
  }
  if (stepsRes.error) {
    throw new Error(`steps lookup failed: ${stepsRes.error.message}`);
  }

  const stepIdToSession = new Map<string, string>();
  for (const s of stepsRes.data ?? []) {
    stepIdToSession.set(
      s.id as string,
      s.walkthrough_session_id as string,
    );
  }

  // Mappings separat laden (PostgREST-Embedded-Select fand FK nicht zuverlaessig)
  const mappingBySessionStepKey = new Map<string, string | null>();
  if (stepIdToSession.size > 0) {
    const stepIds = Array.from(stepIdToSession.keys());
    const { data: mappingRows, error: mappingErr } = await admin
      .from("walkthrough_review_mapping")
      .select("walkthrough_step_id, subtopic_id")
      .in("walkthrough_step_id", stepIds);
    if (mappingErr) {
      throw new Error(`mappings lookup failed: ${mappingErr.message}`);
    }
    for (const m of mappingRows ?? []) {
      mappingBySessionStepKey.set(
        m.walkthrough_step_id as string,
        (m.subtopic_id as string | null) ?? null,
      );
    }
  }

  const tenantMap = new Map<string, string>();
  for (const t of tenantsRes.data ?? []) {
    tenantMap.set(t.id as string, (t.name as string) ?? "Unbekannter Tenant");
  }

  const recorderMap = new Map<string, string>();
  for (const p of profilesRes.data ?? []) {
    recorderMap.set(p.id as string, (p.email as string) ?? "");
  }

  // Mapping-Stats pro Session
  const mappedCount = new Map<string, number>();
  const unmappedCount = new Map<string, number>();
  for (const [stepId, sessionId] of stepIdToSession) {
    const subtopicId = mappingBySessionStepKey.get(stepId);
    if (subtopicId) {
      mappedCount.set(sessionId, (mappedCount.get(sessionId) ?? 0) + 1);
    } else {
      unmappedCount.set(sessionId, (unmappedCount.get(sessionId) ?? 0) + 1);
    }
  }

  return sessions.map((s) => {
    const sid = s.id as string;
    return {
      id: sid,
      tenantId: s.tenant_id as string,
      tenantName: tenantMap.get(s.tenant_id as string) ?? "Unbekannter Tenant",
      recordedByEmail:
        recorderMap.get(s.recorded_by_user_id as string) ?? null,
      status: s.status as string,
      createdAt: s.created_at as string | null,
      reviewedAt: s.reviewed_at as string | null,
      mappedCount: mappedCount.get(sid) ?? 0,
      unmappedCount: unmappedCount.get(sid) ?? 0,
    };
  });
}

export async function countPendingWalkthroughsByTenant(
  admin: SupabaseClient,
): Promise<Map<string, number>> {
  const { data, error } = await admin
    .from("walkthrough_session")
    .select("tenant_id")
    .eq("status", "pending_review");
  if (error) {
    throw new Error(
      `countPendingWalkthroughsByTenant failed: ${error.message}`,
    );
  }
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const tid = row.tenant_id as string;
    counts.set(tid, (counts.get(tid) ?? 0) + 1);
  }
  return counts;
}
