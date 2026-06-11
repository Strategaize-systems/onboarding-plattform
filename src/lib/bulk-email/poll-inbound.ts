// V9.1 SLC-V9.1-D MT-6 — Polling-Helper fuer Test-Send-Verifikation (FEAT-079).
//
// Der Setup-UI Test-Send (actions.ts sendTestEmail) verschickt eine Test-Mail an
// bulk-<slug>@<inbound-domain> mit Setup-Token-Header. Der IMAP-Inbound-Sync-Cron
// (SLC-V9.1-A, DEC-205) zieht sie ein, validiert sie und legt eine email_message-Row
// unter einem email_bulk_run mit endpoint_id an. Dieser Helper pollt, bis diese Row
// erscheint (oder Timeout).
//
// Schema-Hinweis (IMP-1189 Schema-Validation): email_message hat KEIN endpoint_id —
// die Endpoint-Zuordnung liegt auf email_bulk_run.endpoint_id (MIG-058). Der Lookup
// joint daher email_message -> email_bulk_run (!inner) und filtert auf
// email_bulk_run.endpoint_id.

import { createAdminClient } from "@/lib/supabase/admin";

export interface InboundEmailRow {
  id: string;
  bulk_run_id: string;
  message_id: string;
  subject: string | null;
  from_address: string | null;
  received_at: string | null;
}

/** Eine einzelne Lookup-Runde: neueste email_message fuer den Endpoint seit `sinceIso`. */
export type InboundFinder = (
  endpointId: string,
  sinceIso: string,
) => Promise<InboundEmailRow | null>;

const DEFAULT_INTERVAL_MS = 3_000;
const DEFAULT_MAX_ATTEMPTS = 20; // 20 * 3s = 60s Timeout (AC-V9.1-D-6)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Produktions-Finder: liest email_message via service_role und filtert ueber den
 * !inner-Join auf email_bulk_run.endpoint_id. service_role, weil die Verifikation
 * serverseitig unabhaengig von der Tenant-RLS laufen muss.
 */
export const adminInboundFinder: InboundFinder = async (endpointId, sinceIso) => {
  const db = createAdminClient();
  const { data, error } = await db
    .from("email_message")
    .select(
      "id, bulk_run_id, message_id, subject, from_address, received_at, email_bulk_run!inner(endpoint_id)",
    )
    .eq("email_bulk_run.endpoint_id", endpointId)
    .gt("received_at", sinceIso)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id as string,
    bulk_run_id: data.bulk_run_id as string,
    message_id: data.message_id as string,
    subject: (data.subject as string | null) ?? null,
    from_address: (data.from_address as string | null) ?? null,
    received_at: (data.received_at as string | null) ?? null,
  };
};

export interface PollOptions {
  intervalMs?: number;
  maxAttempts?: number;
  /** Injizierbar fuer Tests (Default: adminInboundFinder gegen die DB). */
  finder?: InboundFinder;
  /** Injizierbar fuer Tests (Default: echtes setTimeout-sleep). */
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Pollt bis eine passende Inbound-Email erscheint oder das Timeout erreicht ist.
 * Erste Runde laeuft sofort (kein initiales sleep), danach `intervalMs` zwischen
 * den Versuchen. Gibt die gefundene Row zurueck oder null bei Timeout.
 */
export async function pollForInboundEmail(
  endpointId: string,
  sinceIso: string,
  opts: PollOptions = {},
): Promise<InboundEmailRow | null> {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const finder = opts.finder ?? adminInboundFinder;
  const sleepFn = opts.sleepFn ?? sleep;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleepFn(intervalMs);
    const row = await finder(endpointId, sinceIso);
    if (row) return row;
  }
  return null;
}
