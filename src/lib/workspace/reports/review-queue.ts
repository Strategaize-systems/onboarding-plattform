// SLC-183 MT-1 (OP V10.2) — Report #2: Review-Queue (cross-Mandant).
//
// Je Tenant: Anzahl offener knowledge_unit (status='proposed') + einige juengste
// Titel, plus Anzahl offener Walkthrough-Reviews (walkthrough_session
// status='pending_review', MIG-031/083). Nur Tenants mit >0 offenen Items.

import type { SupabaseClient } from "@supabase/supabase-js";

import { scopeTenants } from "@/lib/workspace/tenant-scope";

const KU_TITLE_SAMPLE = 3;

export interface ReviewQueueRow {
  tenant_id: string;
  tenant_name: string | null;
  /** Offene knowledge_unit (status='proposed'). */
  proposed_units_count: number;
  /** Einige juengste Titel der offenen Units. */
  latest_unit_titles: string[];
  /** Offene Walkthrough-Reviews (status='pending_review'). */
  pending_walkthrough_reviews: number;
}

export interface ReviewQueueReport {
  key: "review_queue";
  rows: ReviewQueueRow[];
}

export async function loadReviewQueue(
  admin: SupabaseClient,
  allowedTenantIds?: string[],
): Promise<ReviewQueueReport> {
  // V10.4 SLC-190: Berater-Scope-Filter auf jede tenant-tragende Query
  // (undefined => Admin, kein Filter). knowledge_unit/walkthrough treiben die
  // Ausgabe -> Pflicht-Filter, tenants nur Namens-Lookup (aber konsistent gefiltert).
  const [unitsRes, walkthroughRes, tenantsRes] = await Promise.all([
    scopeTenants(
      admin
        .from("knowledge_unit")
        .select("tenant_id, title, created_at")
        .eq("status", "proposed")
        .order("created_at", { ascending: false })
        .limit(500),
      "tenant_id",
      allowedTenantIds,
    ),
    scopeTenants(
      admin
        .from("walkthrough_session")
        .select("tenant_id")
        .eq("status", "pending_review")
        .limit(500),
      "tenant_id",
      allowedTenantIds,
    ),
    scopeTenants(
      admin.from("tenants").select("id, name").limit(500),
      "id",
      allowedTenantIds,
    ),
  ]);

  const nameByTenant = new Map<string, string>();
  for (const t of tenantsRes.data ?? []) {
    const id = (t as { id?: unknown }).id;
    const name = (t as { name?: unknown }).name;
    if (typeof id === "string" && typeof name === "string") {
      nameByTenant.set(id, name);
    }
  }

  type Agg = { count: number; titles: string[]; walkthroughs: number };
  const byTenant = new Map<string, Agg>();
  const ensure = (tenantId: string): Agg => {
    let agg = byTenant.get(tenantId);
    if (!agg) {
      agg = { count: 0, titles: [], walkthroughs: 0 };
      byTenant.set(tenantId, agg);
    }
    return agg;
  };

  // knowledge_unit-Aggregation (created_at DESC -> erste Titel sind die juengsten).
  for (const u of unitsRes.data ?? []) {
    const tenantId = (u as { tenant_id?: unknown }).tenant_id;
    if (typeof tenantId !== "string") continue;
    const agg = ensure(tenantId);
    agg.count += 1;
    const title = (u as { title?: unknown }).title;
    if (typeof title === "string" && agg.titles.length < KU_TITLE_SAMPLE) {
      agg.titles.push(title);
    }
  }

  // Walkthrough-Review-Aggregation.
  for (const w of walkthroughRes.data ?? []) {
    const tenantId = (w as { tenant_id?: unknown }).tenant_id;
    if (typeof tenantId !== "string") continue;
    ensure(tenantId).walkthroughs += 1;
  }

  const rows: ReviewQueueRow[] = [];
  for (const [tenantId, agg] of byTenant) {
    if (agg.count === 0 && agg.walkthroughs === 0) continue;
    rows.push({
      tenant_id: tenantId,
      tenant_name: nameByTenant.get(tenantId) ?? null,
      proposed_units_count: agg.count,
      latest_unit_titles: agg.titles,
      pending_walkthrough_reviews: agg.walkthroughs,
    });
  }

  // Groesste Queues zuerst.
  rows.sort(
    (a, b) =>
      b.proposed_units_count + b.pending_walkthrough_reviews -
      (a.proposed_units_count + a.pending_walkthrough_reviews),
  );

  return { key: "review_queue", rows };
}
