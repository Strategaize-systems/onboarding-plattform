// SLC-183 MT-1 (OP V10.2) — Report #5: Aktivitaets-Timeline (cross-Mandant).
//
// Union der juengsten Aktivitaeten aus mehreren Event-Quellen seit einem Cutoff
// (Default now-48h), normalisiert auf { source, tenant_id, tenant_name?,
// created_at, label }, gemergt, created_at DESC sortiert, auf 100 gekappt.
//
// Quellen (alle mit tenant_id + created_at verifiziert in sql/migrations/):
//   - capture_events   (MIG-034)
//   - diagnose_event   (MIG-100)
//   - modul_output     (MIG-124)
//   - block_checkpoint (MIG-021)
//   - validation_layer (MIG-021) — hat tenant_id + created_at, daher inklusive.

import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_LOOKBACK_MS = 48 * 60 * 60 * 1000;
const PER_SOURCE_LIMIT = 100;
const MERGED_CAP = 100;

export type ActivitySource =
  | "capture_events"
  | "diagnose_event"
  | "modul_output"
  | "block_checkpoint"
  | "validation_layer";

export interface ActivityTimelineEntry {
  source: ActivitySource;
  tenant_id: string;
  tenant_name: string | null;
  created_at: string;
  label: string;
}

export interface ActivityTimelineReport {
  key: "activity_timeline";
  since: string;
  entries: ActivityTimelineEntry[];
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export async function loadActivityTimeline(
  admin: SupabaseClient,
  sinceIso?: string,
): Promise<ActivityTimelineReport> {
  const cutoff =
    sinceIso ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS).toISOString();

  const [
    captureRes,
    diagnoseRes,
    modulRes,
    checkpointRes,
    validationRes,
    tenantsRes,
  ] = await Promise.all([
    admin
      .from("capture_events")
      .select("tenant_id, block_key, event_type, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),
    admin
      .from("diagnose_event")
      .select("tenant_id, event_type, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),
    admin
      .from("modul_output")
      .select("tenant_id, modul_key, output_kind, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),
    admin
      .from("block_checkpoint")
      .select("tenant_id, block_key, checkpoint_type, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),
    admin
      .from("validation_layer")
      .select("tenant_id, action, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),
    admin.from("tenants").select("id, name").limit(500),
  ]);

  const nameByTenant = new Map<string, string>();
  for (const t of tenantsRes.data ?? []) {
    const id = (t as { id?: unknown }).id;
    const name = (t as { name?: unknown }).name;
    if (typeof id === "string" && typeof name === "string") {
      nameByTenant.set(id, name);
    }
  }

  const entries: ActivityTimelineEntry[] = [];

  const push = (
    source: ActivitySource,
    tenantIdRaw: unknown,
    createdAtRaw: unknown,
    label: string,
  ) => {
    const tenantId = asString(tenantIdRaw);
    const createdAt = asString(createdAtRaw);
    if (!tenantId || !createdAt) return;
    entries.push({
      source,
      tenant_id: tenantId,
      tenant_name: nameByTenant.get(tenantId) ?? null,
      created_at: createdAt,
      label,
    });
  };

  for (const r of captureRes.data ?? []) {
    const row = r as Record<string, unknown>;
    push(
      "capture_events",
      row.tenant_id,
      row.created_at,
      `${asString(row.event_type) ?? "event"} · ${asString(row.block_key) ?? "-"}`,
    );
  }

  for (const r of diagnoseRes.data ?? []) {
    const row = r as Record<string, unknown>;
    push(
      "diagnose_event",
      row.tenant_id,
      row.created_at,
      asString(row.event_type) ?? "diagnose_event",
    );
  }

  for (const r of modulRes.data ?? []) {
    const row = r as Record<string, unknown>;
    push(
      "modul_output",
      row.tenant_id,
      row.created_at,
      `${asString(row.modul_key) ?? "-"} · ${asString(row.output_kind) ?? "output"}`,
    );
  }

  for (const r of checkpointRes.data ?? []) {
    const row = r as Record<string, unknown>;
    push(
      "block_checkpoint",
      row.tenant_id,
      row.created_at,
      `${asString(row.checkpoint_type) ?? "checkpoint"} · ${asString(row.block_key) ?? "-"}`,
    );
  }

  for (const r of validationRes.data ?? []) {
    const row = r as Record<string, unknown>;
    push(
      "validation_layer",
      row.tenant_id,
      row.created_at,
      `review ${asString(row.action) ?? "-"}`,
    );
  }

  entries.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  return {
    key: "activity_timeline",
    since: cutoff,
    entries: entries.slice(0, MERGED_CAP),
  };
}
