// SLC-183 MT-1 (OP V10.2) — Report #3: Wo stockt es? (cross-Mandant).
//
// Markiert Tenants, bei denen mindestens EIN Stall-Signal greift:
//   - lange Inaktivitaet (juengstes block_checkpoint aelter als INACTIVITY_DAYS)
//   - rote Modul-Reife-Ampel (capture_session.metadata.modul_delivery_ampel = red)
//   - fehlgeschlagene ai_jobs (status='failed', count > 0)
// Ampel-Extraktion wird aus dem Mandanten-Uebersicht-Report wiederverwendet.

import type { SupabaseClient } from "@supabase/supabase-js";

import { MODUL_DELIVERY_AMPEL_META_KEY } from "@/lib/stb-vertikale/module-delivery/reife-ampel";
import { scopeTenants } from "@/lib/workspace/tenant-scope";

const INACTIVITY_DAYS = 14;

export interface WoStocktEsRow {
  tenant_id: string;
  tenant_name: string | null;
  reasons: string[];
  last_activity_at: string | null;
  failed_jobs_count: number;
  has_red_ampel: boolean;
}

export interface WoStocktEsReport {
  key: "wo_stockt_es";
  rows: WoStocktEsRow[];
}

/** Defensiver Check: enthaelt das metadata-JSONB eine rote Modul-Ampel? */
function hasRedAmpel(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const ampelMap = (metadata as Record<string, unknown>)[
    MODUL_DELIVERY_AMPEL_META_KEY
  ];
  if (!ampelMap || typeof ampelMap !== "object") return false;
  for (const value of Object.values(ampelMap as Record<string, unknown>)) {
    if (value === "red") return true;
  }
  return false;
}

export async function loadWoStocktEs(
  admin: SupabaseClient,
  allowedTenantIds?: string[],
): Promise<WoStocktEsReport> {
  // V10.4 SLC-190: Berater-Scope-Filter (undefined => Admin, kein Filter).
  // tenants treibt die Ausgabe (nameByTenant-Iteration) -> Pflicht-Filter; die
  // Signal-Queries werden konsistent mitgefiltert (R-190-1).
  const [tenantsRes, checkpointsRes, sessionsRes, failedJobsRes] =
    await Promise.all([
      scopeTenants(
        admin.from("tenants").select("id, name").limit(500),
        "id",
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
      scopeTenants(
        admin.from("capture_session").select("tenant_id, metadata").limit(2000),
        "tenant_id",
        allowedTenantIds,
      ),
      scopeTenants(
        admin.from("ai_jobs").select("tenant_id").eq("status", "failed").limit(2000),
        "tenant_id",
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

  // last_activity je Tenant (DESC -> erster gewinnt).
  const lastActivityByTenant = new Map<string, string>();
  for (const cp of checkpointsRes.data ?? []) {
    const tenantId = (cp as { tenant_id?: unknown }).tenant_id;
    const createdAt = (cp as { created_at?: unknown }).created_at;
    if (typeof tenantId !== "string" || typeof createdAt !== "string") continue;
    if (lastActivityByTenant.has(tenantId)) continue;
    lastActivityByTenant.set(tenantId, createdAt);
  }

  // Rote Ampel je Tenant (irgendeine Session rot -> Tenant rot).
  const redAmpelTenants = new Set<string>();
  for (const s of sessionsRes.data ?? []) {
    const tenantId = (s as { tenant_id?: unknown }).tenant_id;
    if (typeof tenantId !== "string") continue;
    if (hasRedAmpel((s as { metadata?: unknown }).metadata)) {
      redAmpelTenants.add(tenantId);
    }
  }

  // Fehlgeschlagene Jobs je Tenant.
  const failedByTenant = new Map<string, number>();
  for (const j of failedJobsRes.data ?? []) {
    const tenantId = (j as { tenant_id?: unknown }).tenant_id;
    if (typeof tenantId !== "string") continue;
    failedByTenant.set(tenantId, (failedByTenant.get(tenantId) ?? 0) + 1);
  }

  const now = Date.now();
  const inactivityCutoffMs = INACTIVITY_DAYS * 24 * 60 * 60 * 1000;

  const rows: WoStocktEsRow[] = [];
  for (const [tenantId, tenantName] of nameByTenant) {
    const reasons: string[] = [];
    const lastActivityAt = lastActivityByTenant.get(tenantId) ?? null;
    const failedJobsCount = failedByTenant.get(tenantId) ?? 0;
    const hasRed = redAmpelTenants.has(tenantId);

    // Inaktivitaet: nie aktiv ODER letzte Aktivitaet aelter als Cutoff.
    if (lastActivityAt === null) {
      reasons.push("Keine Block-Aktivitaet erfasst");
    } else {
      const lastMs = Date.parse(lastActivityAt);
      if (Number.isFinite(lastMs) && now - lastMs > inactivityCutoffMs) {
        reasons.push(`Keine Aktivitaet seit > ${INACTIVITY_DAYS} Tagen`);
      }
    }

    if (hasRed) reasons.push("Rote Modul-Reife-Ampel");
    if (failedJobsCount > 0) {
      reasons.push(`${failedJobsCount} fehlgeschlagene KI-Jobs`);
    }

    if (reasons.length > 0) {
      rows.push({
        tenant_id: tenantId,
        tenant_name: tenantName,
        reasons,
        last_activity_at: lastActivityAt,
        failed_jobs_count: failedJobsCount,
        has_red_ampel: hasRed,
      });
    }
  }

  // Meiste Stall-Signale zuerst.
  rows.sort((a, b) => b.reasons.length - a.reasons.length);

  return { key: "wo_stockt_es", rows };
}
