// V10.2.1 SLC-185 MT-2 — Reconcile-Orchestrator (Self-Healing knowledge_chunks-Coverage).
//
// Slice: SLC-185 / FEAT-102 — Embedding-Reconcile-Cron (ISSUE-112).
// DECs: DEC-262 (Per-Tenant-Loop, geteilte Gap-Definition via getTenantCoverage,
//       0 Migration, Cap 25), DEC-259 (ledger-frei), DEC-261 (fire-and-forget-Ursache).
//
// Ablauf (sequentiell, fail-open pro Mandant):
//   1. Tenant-Enumeration (tenants.select("id") — Primitive wie load-cross-tenant.ts).
//   2. Pro Mandant Count-Gap-Check via getTenantCoverage (identische Query wie der
//      V10.2-Coverage-Guard in askRag — die eine Wahrheit der Gap-Definition).
//   3. Bei Luecke (chunkCount < kuCount) → reembedTenantKnowledge (idempotent via
//      Unique-Constraint, fail-open). Cap MAX_TENANTS_PER_RUN Re-Embeds pro Lauf;
//      nach Cap-Erreichen werden restliche Mandanten weiterhin GEPRUEFT (ehrliche
//      tenantsChecked/tenantsWithGap-Counts, Plan-QA RPT-579 L-1), nur nicht mehr
//      re-embedded — Rest heilt der naechste Tick, Cap-Hit wird als capped:true geloggt.
//   4. Summary via captureInfo (error_log, category "knowledge_embed_reconcile").
//
// Fehler pro Mandant: captureException + weiter mit dem naechsten (fail-open).
// Ein Fehler der Enumeration selbst propagiert — die Cron-Route faengt ihn als 500.

import type { SupabaseClient } from "@supabase/supabase-js";

import { captureException, captureInfo } from "@/lib/logger";
import {
  getTenantCoverage,
  reembedTenantKnowledge,
  type ReembedResult,
} from "./rag";

// Cap auf Re-Embed-Mandanten pro Lauf (DEC-262): begrenzt Titan-Last pro 10-Minuten-Tick.
export const MAX_TENANTS_PER_RUN = 25;

export interface ReconcileDeps {
  listTenants: (admin: SupabaseClient) => Promise<string[]>;
  getCoverage: (
    admin: SupabaseClient,
    tenantId: string,
  ) => Promise<{ kuCount: number; chunkCount: number }>;
  reembed: (admin: SupabaseClient, tenantId: string) => Promise<ReembedResult>;
}

export interface ReconcileSummary {
  tenantsChecked: number;
  tenantsWithGap: number;
  chunksReembedded: number;
  failures: number;
  capped: boolean;
}

const DEFAULT_RECONCILE_DEPS: ReconcileDeps = {
  listTenants: async (admin) => {
    const { data, error } = await admin.from("tenants").select("id");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  },
  getCoverage: getTenantCoverage,
  reembed: reembedTenantKnowledge,
};

/**
 * Schliesst RAG-Coverage-Luecken in knowledge_chunks selbstheilend: pro Mandant
 * Count-Gap-Check, bei Luecke Re-Embed (max. MAX_TENANTS_PER_RUN pro Lauf).
 * Fehler pro Mandant werden auditiert und uebersprungen (fail-open); die Summary
 * geht zusaetzlich als captureInfo in den error_log (Beobachtbarkeit SC4).
 */
export async function reconcileEmbeddings(
  admin: SupabaseClient,
  deps: ReconcileDeps = DEFAULT_RECONCILE_DEPS,
): Promise<ReconcileSummary> {
  const tenantIds = await deps.listTenants(admin);

  const summary: ReconcileSummary = {
    tenantsChecked: 0,
    tenantsWithGap: 0,
    chunksReembedded: 0,
    failures: 0,
    capped: false,
  };
  let reembedsDone = 0;

  for (const tenantId of tenantIds) {
    summary.tenantsChecked += 1;
    try {
      const { kuCount, chunkCount } = await deps.getCoverage(admin, tenantId);
      if (chunkCount >= kuCount) continue;

      summary.tenantsWithGap += 1;
      if (reembedsDone >= MAX_TENANTS_PER_RUN) {
        // Cap erreicht: weiter zaehlen (ehrliche Counts), aber nicht mehr re-embedden.
        summary.capped = true;
        continue;
      }

      reembedsDone += 1;
      const result = await deps.reembed(admin, tenantId);
      if (result.ok) {
        summary.chunksReembedded += result.embedded;
      } else {
        summary.failures += 1;
      }
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        source: "cron:knowledge-embed-reconcile",
        metadata: { tenantId },
      });
      summary.failures += 1;
    }
  }

  captureInfo("Embedding-Reconcile-Lauf abgeschlossen", {
    source: "cron:knowledge-embed-reconcile",
    metadata: { category: "knowledge_embed_reconcile", ...summary },
  });

  return summary;
}
