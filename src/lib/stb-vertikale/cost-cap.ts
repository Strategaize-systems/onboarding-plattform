// StB-Vertikale Modul-Output-Synthese — Cost-Cap (SLC-174 MT-3, AC-174-4).
//
// Reuse der Cap-MECHANIK aus src/lib/bulk-email/cost-cap.ts (DEC-235):
//   - Run-Cap (pure)         : akkumulierte USD->EUR-Kosten DIESES Worker-Laufs
//                              gegen den Run-Cap (in-Memory, da es — anders als
//                              email_bulk_run — KEINE Pro-Run-Kostenspalte fuer
//                              module_output_synthesis gibt; Worker akkumuliert).
//   - Tenant-Monatscap (DB)  : Summe ai_cost_ledger.usd_cost (Modul-Rollen,
//                              aktueller Monat) gegen den Tenant-Monatscap.
// USD_TO_EUR_APPROX wird aus dem bestehenden bulk-email-Modul wiederverwendet
// (kein zweiter Wechselkurs-Konstant -> kein Drift).

import type { SupabaseClient } from "@supabase/supabase-js";
import { USD_TO_EUR_APPROX } from "@/lib/bulk-email/cost-estimate";

/** ai_cost_ledger.role-Werte des Modul-Synthese-Workers (MIG-124, DEC-235). */
export const MODULE_COST_LEDGER_ROLES = [
  "module_output_synthesis",
  "module_output_critic",
] as const;

/** Last-Resort-Default Run-Cap (EUR) — ENV V10_MODULE_SYNTHESIS_RUN_CAP_EUR. */
export const DEFAULT_MODULE_RUN_CAP_EUR = 5;
/** Last-Resort-Default Tenant-Monatscap (EUR) — ENV V10_MODULE_SYNTHESIS_TENANT_MONTH_CAP_EUR. */
export const DEFAULT_MODULE_TENANT_MONTH_CAP_EUR = 50;

function resolveEnvCap(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

export function resolveModuleRunCapEur(override?: number): number {
  if (typeof override === "number") return override;
  return resolveEnvCap("V10_MODULE_SYNTHESIS_RUN_CAP_EUR", DEFAULT_MODULE_RUN_CAP_EUR);
}

export function resolveModuleTenantMonthCapEur(override?: number): number {
  if (typeof override === "number") return override;
  return resolveEnvCap(
    "V10_MODULE_SYNTHESIS_TENANT_MONTH_CAP_EUR",
    DEFAULT_MODULE_TENANT_MONTH_CAP_EUR,
  );
}

/** USD -> EUR (Approx, wiederverwendet). */
export function usdToEur(usd: number): number {
  return usd * USD_TO_EUR_APPROX;
}

/**
 * Run-Cap (pure): true = akkumulierte EUR-Kosten dieses Laufs sind noch im
 * Budget (`accumulatedEur <= runCapEur`), false = Cap ueberschritten.
 */
export function checkRunCapEur(accumulatedEur: number, runCapEur: number): boolean {
  return accumulatedEur <= runCapEur;
}

// ─── Tenant-Monatscap (DB-gebunden) ──────────────────────────────────────────

export interface ModuleCostCapStore {
  /** Summe ai_cost_ledger.usd_cost (Modul-Rollen, aktueller Monat) als EUR. */
  getTenantMonthCostEur(tenantId: string): Promise<number>;
}

export interface TenantMonthCapResult {
  allowed: boolean;
  currentMonthEur: number;
}

/**
 * Pre-Run-Check: liegt der Tenant im laufenden Monat noch unter dem Cap? Der
 * eigentliche Run ist klein (~2 Calls), daher pruefen wir den IST-Stand vor dem
 * ersten LLM-Call (Hard-Stop, kein Persist) — der Run-Cap fuengt das Lauf-Delta.
 */
export async function checkTenantMonthCap(
  tenantId: string,
  capEur: number,
  store: ModuleCostCapStore,
): Promise<TenantMonthCapResult> {
  const currentMonthEur = await store.getTenantMonthCostEur(tenantId);
  return { allowed: currentMonthEur < capEur, currentMonthEur };
}

/** Production-Adapter: liest aus Coolify-Postgres via Supabase-Admin-Client. */
export function createModuleCostCapStore(
  adminClient: SupabaseClient,
): ModuleCostCapStore {
  return {
    async getTenantMonthCostEur(tenantId) {
      const now = new Date();
      const startOfMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ).toISOString();
      const { data, error } = await adminClient
        .from("ai_cost_ledger")
        .select("usd_cost")
        .eq("tenant_id", tenantId)
        .gte("created_at", startOfMonth)
        .in("role", [...MODULE_COST_LEDGER_ROLES]);
      if (error) {
        throw new Error(
          `module cost-cap: failed to read ai_cost_ledger for tenant ${tenantId}: ${error.message}`,
        );
      }
      const totalUsd = (data ?? []).reduce((sum, row) => {
        const raw = (row as { usd_cost: string | number | null }).usd_cost;
        const n = typeof raw === "number" ? raw : Number(raw);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
      return usdToEur(totalUsd);
    },
  };
}
