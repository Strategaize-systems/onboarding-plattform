// V9.1 SLC-V9.1-D MT-5 — Forward-Source-Statistik fuer Admin-Audit (FEAT-079).
//
// Liefert pro (Tenant + Endpoint) eine Statistik-Zeile fuer die strategaize_admin
// Cross-Tenant-Audit-Sicht: Inbound-Volumen 30d, Reject-Rate 30d je reject_layer,
// Monats-Kosten, Last-Inbound-Timestamp.
//
// Schema-Hinweise (IMP-1189 Schema-Validation):
//   - Es gibt KEINE vendor-Spalte. Inbound-Transport ist Single-IONOS-IMAP
//     (DEC-205, supersedes SES-Webhook DEC-194). vendorLabel ist daher ein
//     konstantes Label (ENV INBOUND_VENDOR_LABEL, Default 'imap-ionos'), nicht
//     pro Row variabel.
//   - email_message hat KEIN endpoint_id — Endpoint-Zuordnung via
//     email_bulk_run.endpoint_id (!inner-Join).
//   - Aggregation in JS (kein GROUP-BY-View), analog zum bestehenden
//     Cost-Aggregat in admin/audit/bulk-email/page.tsx. Fuer V9.1
//     Internal-Test-Volumen ausreichend (R5: Loading-Spinner, Volumen niedrig).

import { createAdminClient } from "@/lib/supabase/admin";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Reject-Layer aus MIG-057 email_validation_reject_log CHECK. */
export const REJECT_LAYERS = [
  "hmac_invalid",
  "tenant_not_found",
  "endpoint_inactive",
  "setup_token_missing",
  "setup_token_invalid",
  "allowlist_mismatch",
] as const;
export type RejectLayer = (typeof REJECT_LAYERS)[number];

export interface ForwardStatsRow {
  tenant_id: string;
  tenant_name: string | null;
  endpoint_id: string;
  slug: string;
  endpoint_status: string;
  vendor: string;
  inbound_count_30d: number;
  reject_count_30d_total: number;
  reject_count_30d_by_layer: Partial<Record<RejectLayer, number>>;
  monthly_cost_eur: number;
  last_inbound_at: string | null;
}

interface EndpointRow {
  id: string;
  tenant_id: string;
  slug: string;
  status: string;
}

/**
 * Pure Aggregation — keine DB. Baut die Statistik-Zeilen aus den Roh-Arrays.
 * Eine Zeile pro Endpoint. Reject-Rows ohne endpoint_id (z.B. tenant_not_found
 * vor Endpoint-Resolve) werden NICHT auf eine Endpoint-Zeile gemappt.
 */
export function aggregateForwardStats(args: {
  endpoints: EndpointRow[];
  tenantNames: Map<string, string>;
  inboundMessages: { endpoint_id: string | null; received_at: string | null }[];
  rejectRows: { endpoint_id: string | null; reject_layer: string }[];
  monthlyCostByTenant: Map<string, number>;
  vendorLabel: string;
}): ForwardStatsRow[] {
  const inboundByEndpoint = new Map<
    string,
    { count: number; last: string | null }
  >();
  for (const m of args.inboundMessages) {
    if (!m.endpoint_id) continue;
    const cur = inboundByEndpoint.get(m.endpoint_id) ?? { count: 0, last: null };
    cur.count += 1;
    if (m.received_at && (cur.last === null || m.received_at > cur.last)) {
      cur.last = m.received_at;
    }
    inboundByEndpoint.set(m.endpoint_id, cur);
  }

  const rejectByEndpoint = new Map<string, Partial<Record<RejectLayer, number>>>();
  for (const r of args.rejectRows) {
    if (!r.endpoint_id) continue;
    if (!(REJECT_LAYERS as readonly string[]).includes(r.reject_layer)) continue;
    const layer = r.reject_layer as RejectLayer;
    const bucket = rejectByEndpoint.get(r.endpoint_id) ?? {};
    bucket[layer] = (bucket[layer] ?? 0) + 1;
    rejectByEndpoint.set(r.endpoint_id, bucket);
  }

  return args.endpoints
    .map((ep) => {
      const inbound = inboundByEndpoint.get(ep.id) ?? { count: 0, last: null };
      const rejects = rejectByEndpoint.get(ep.id) ?? {};
      const rejectTotal = Object.values(rejects).reduce((a, b) => a + (b ?? 0), 0);
      return {
        tenant_id: ep.tenant_id,
        tenant_name: args.tenantNames.get(ep.tenant_id) ?? null,
        endpoint_id: ep.id,
        slug: ep.slug,
        endpoint_status: ep.status,
        vendor: args.vendorLabel,
        inbound_count_30d: inbound.count,
        reject_count_30d_total: rejectTotal,
        reject_count_30d_by_layer: rejects,
        monthly_cost_eur: args.monthlyCostByTenant.get(ep.tenant_id) ?? 0,
        last_inbound_at: inbound.last,
      };
    })
    .sort((a, b) => b.inbound_count_30d - a.inbound_count_30d);
}

/**
 * Fetcht die Roh-Daten via service_role und ruft aggregateForwardStats.
 * Caller (Admin-Page) MUSS den strategaize_admin-Role-Check vorher machen —
 * dieser Helper bypassed RLS (Cross-Tenant-Audit).
 */
export async function getForwardSourceStats(): Promise<ForwardStatsRow[]> {
  const admin = createAdminClient();
  const sinceIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const vendorLabel = process.env.INBOUND_VENDOR_LABEL ?? "imap-ionos";

  const { data: endpointRows } = await admin
    .from("email_inbound_endpoint")
    .select("id, tenant_id, slug, status");
  const endpoints = (endpointRows ?? []) as EndpointRow[];
  if (endpoints.length === 0) return [];

  const tenantIds = Array.from(new Set(endpoints.map((e) => e.tenant_id)));
  const tenantNames = new Map<string, string>();
  const { data: tenantRows } = await admin
    .from("tenants")
    .select("id, name")
    .in("id", tenantIds);
  for (const t of tenantRows ?? []) {
    tenantNames.set(t.id as string, t.name as string);
  }

  const { data: msgRows } = await admin
    .from("email_message")
    .select("received_at, email_bulk_run!inner(endpoint_id)")
    .gt("received_at", sinceIso);
  const inboundMessages = (msgRows ?? []).map((m) => {
    const run = m.email_bulk_run as unknown as { endpoint_id: string | null } | null;
    return {
      endpoint_id: run?.endpoint_id ?? null,
      received_at: (m.received_at as string | null) ?? null,
    };
  });

  const { data: rejectRows } = await admin
    .from("email_validation_reject_log")
    .select("endpoint_id, reject_layer")
    .gt("created_at", sinceIso);

  // Monats-Kosten aktueller Monat aus vw_bulk_email_cost_monthly (Spalte: month).
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString().slice(0, 10);
  const { data: costRows } = await admin
    .from("vw_bulk_email_cost_monthly")
    .select("tenant_id, month, total_cost_eur")
    .eq("month", monthIso);
  const monthlyCostByTenant = new Map<string, number>();
  for (const c of costRows ?? []) {
    monthlyCostByTenant.set(c.tenant_id as string, Number(c.total_cost_eur ?? 0));
  }

  return aggregateForwardStats({
    endpoints,
    tenantNames,
    inboundMessages,
    rejectRows: (rejectRows ?? []) as {
      endpoint_id: string | null;
      reject_layer: string;
    }[],
    monthlyCostByTenant,
    vendorLabel,
  });
}
