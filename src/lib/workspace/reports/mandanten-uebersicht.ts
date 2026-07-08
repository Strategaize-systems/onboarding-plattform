// SLC-183 MT-1 (OP V10.2) — Report #1: Mandanten-Uebersicht (cross-Mandant).
//
// Basis = loadCrossTenantCockpit (SLC-040), angereichert um:
//   - modul_reife_ampel: schlimmste Ampel (red>yellow>green) aus
//     capture_session.metadata.modul_delivery_ampel je Tenant (MIG-103/reife-ampel).
//   - last_activity_at: juengstes block_checkpoint.created_at je Tenant.
//
// Loader RECEIVE den service-role Admin-Client (Aufrufer macht das Gate).

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadCrossTenantCockpit } from "@/lib/cockpit/load-cross-tenant";
import type { CrossTenantRow } from "@/app/admin/tenants/CrossTenantCockpit";
import { MODUL_DELIVERY_AMPEL_META_KEY } from "@/lib/stb-vertikale/module-delivery/reife-ampel";
import { scopeTenants } from "@/lib/workspace/tenant-scope";

/** Ampel-Vokabular (green|yellow|red), konsistent zu blueprint/reife-ampel. */
export type ReportAmpel = "green" | "yellow" | "red";

/** Ampel-Rang fuer "schlimmste gewinnt"-Rollup. */
const AMPEL_RANK: Record<ReportAmpel, number> = { green: 0, yellow: 1, red: 2 };

export interface MandantenUebersichtRow extends CrossTenantRow {
  /** Schlimmste Modul-Reife-Ampel ueber alle Sessions des Tenants, oder null. */
  modul_reife_ampel: ReportAmpel | null;
  /** Juengste Aktivitaet (max block_checkpoint.created_at), oder null. */
  last_activity_at: string | null;
}

export interface MandantenUebersichtReport {
  key: "mandanten_uebersicht";
  rows: MandantenUebersichtRow[];
}

/** Rollt einen ampel-Kandidaten in den bisherigen Worst-Case ein. */
function mergeWorstAmpel(
  current: ReportAmpel | null,
  candidate: ReportAmpel,
): ReportAmpel {
  if (current === null) return candidate;
  return AMPEL_RANK[candidate] > AMPEL_RANK[current] ? candidate : current;
}

/**
 * Extrahiert die schlimmste Ampel aus einem metadata-JSONB einer capture_session.
 * Defensiv: malformte metadata -> null (nie werfen).
 */
function worstAmpelFromMetadata(metadata: unknown): ReportAmpel | null {
  if (!metadata || typeof metadata !== "object") return null;
  const ampelMap = (metadata as Record<string, unknown>)[
    MODUL_DELIVERY_AMPEL_META_KEY
  ];
  if (!ampelMap || typeof ampelMap !== "object") return null;
  let worst: ReportAmpel | null = null;
  for (const value of Object.values(ampelMap as Record<string, unknown>)) {
    if (value === "green" || value === "yellow" || value === "red") {
      worst = mergeWorstAmpel(worst, value);
    }
  }
  return worst;
}

export async function loadMandantenUebersicht(
  admin: SupabaseClient,
  allowedTenantIds?: string[],
): Promise<MandantenUebersichtReport> {
  const base = await loadCrossTenantCockpit(admin, allowedTenantIds);

  // metadata (Ampel-Rollup) + last_activity je Tenant in je einer bounded Query.
  // V10.4 SLC-190: Berater-Scope-Filter (undefined => Admin, kein Filter).
  const [sessionsRes, checkpointsRes] = await Promise.all([
    scopeTenants(
      admin.from("capture_session").select("tenant_id, metadata").limit(2000),
      "tenant_id",
      allowedTenantIds,
    ),
    scopeTenants(
      admin
        .from("block_checkpoint")
        .select("tenant_id, created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
      "tenant_id",
      allowedTenantIds,
    ),
  ]);

  // Worst-Ampel je Tenant aus allen Sessions.
  const ampelByTenant = new Map<string, ReportAmpel | null>();
  for (const row of sessionsRes.data ?? []) {
    const tenantId = (row as { tenant_id?: unknown }).tenant_id;
    if (typeof tenantId !== "string") continue;
    const candidate = worstAmpelFromMetadata(
      (row as { metadata?: unknown }).metadata,
    );
    if (candidate === null) {
      if (!ampelByTenant.has(tenantId)) ampelByTenant.set(tenantId, null);
      continue;
    }
    ampelByTenant.set(
      tenantId,
      mergeWorstAmpel(ampelByTenant.get(tenantId) ?? null, candidate),
    );
  }

  // last_activity je Tenant (checkpoints sind created_at DESC sortiert -> erster gewinnt).
  const lastActivityByTenant = new Map<string, string>();
  for (const cp of checkpointsRes.data ?? []) {
    const tenantId = (cp as { tenant_id?: unknown }).tenant_id;
    const createdAt = (cp as { created_at?: unknown }).created_at;
    if (typeof tenantId !== "string" || typeof createdAt !== "string") continue;
    if (lastActivityByTenant.has(tenantId)) continue;
    lastActivityByTenant.set(tenantId, createdAt);
  }

  const rows: MandantenUebersichtRow[] = base.map((r) => ({
    ...r,
    modul_reife_ampel: ampelByTenant.get(r.tenant_id) ?? null,
    last_activity_at: lastActivityByTenant.get(r.tenant_id) ?? null,
  }));

  return { key: "mandanten_uebersicht", rows };
}
