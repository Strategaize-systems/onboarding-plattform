// V9.1 SLC-V9.1-B MT-1 — Continuous-Cost-Cap-Service (FEAT-077).
//
// Slice: SLC-V9.1-B — Continuous-Cost-Cap-Service + Pipeline-Trigger
// Spec:  slices/SLC-V9.1-B-continuous-cost-cap.md (MT-1)
// DECs:  DEC-197 (3-Schichten-Cost-Cap: Daily 5 EUR + Monthly 100 EUR +
//        Per-Email-Approval > 0.50 EUR), DEC-182 (Monthly-Cap-Reuse aus V9.0).
//
// Pattern-Reuse-Anker: src/lib/bulk-email/cost-cap.ts (V9.0 SLC-167 MT-3,
//   DEC-182). V9.0 ist Estimate-basiert (projected = current + estimate <= cap)
//   fuer Foreground-mbox-Runs. V9.1 Continuous-Stream prueft den AKKUMULIERTEN
//   Ist-Stand (actual >= cap) pro Tag + Monat, weil der periodische Pipeline-
//   Trigger (MT-2) keinen User-Estimate hat — er entscheidet rein anhand der
//   bisherigen Tages-/Monatskosten, ob ein weiterer Continuous-Run getriggert
//   werden darf.
//
// Daily-Schicht ist V9.1-Innovation (DEC-197): ohne Daily-Cap waere ein
// Forward-Spike (z.B. 1000 Spam-Mails an einem Tag) potenziell teuer. Monthly-
// Cap = V9.0-DEC-182-Reuse (100 EUR). Per-Email-Approval-Schwelle: siehe
// per-email-approval.ts (Outlier-Guard, separate Schicht im Worker MT-3).
//
// Store-Injection wie cost-cap.ts: ContinuousCapStore-Interface erlaubt
// hermetische Mock-Tests (continuous-cost-cap.test.ts) + Production via
// createContinuousCapStoreFromSupabase. Die Daily-View kommt aus MIG-062/117.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Default Daily-Cap (EUR/Tag/Tenant) per DEC-197 Option B. ENV-Override moeglich. */
export const DEFAULT_DAILY_CAP_EUR = 5;
/** Default Monthly-Cap (EUR/Monat/Tenant). Reuse V9.0 DEC-182. ENV-Override moeglich. */
export const DEFAULT_MONTHLY_CAP_EUR = 100;

/**
 * Resolved Daily-Cap aus ENV `V91_BULK_EMAIL_DAILY_CAP_EUR`, Fallback 5.
 * Ungueltige/nicht-positive Werte fallen auf Default zurueck (R1-ENV-Drift-Mitigation).
 */
export function resolveDailyCapEur(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.V91_BULK_EMAIL_DAILY_CAP_EUR;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_CAP_EUR;
}

/**
 * Resolved Monthly-Cap aus ENV `V91_BULK_EMAIL_MONTHLY_CAP_EUR`, Fallback 100.
 * Ungueltige/nicht-positive Werte fallen auf Default zurueck.
 */
export function resolveMonthlyCapEur(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.V91_BULK_EMAIL_MONTHLY_CAP_EUR;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_CAP_EUR;
}

export type ContinuousCapReason = "daily_cap_hit" | "monthly_cap_hit";

export interface ContinuousCapResult {
  /** true wenn ein weiterer Continuous-Run getriggert werden darf. */
  allowed: boolean;
  /** Gesetzt wenn allowed=false: welche Schicht den Run blockt. */
  reason?: ContinuousCapReason;
  /** Cap-Wert (EUR) der getroffenen Schicht. */
  cap?: number;
  /** Aktueller Ist-Stand (EUR) der getroffenen Schicht. */
  actual?: number;
}

/**
 * Narrow Data-Access-Interface fuer die Continuous-Cost-Cap-DB-Lookups.
 * Test-Injection via Mock (continuous-cost-cap.test.ts), Production via
 * createContinuousCapStoreFromSupabase.
 */
export interface ContinuousCapStore {
  /** Akkumulierte Bulk-Email-Kosten (EUR) des Tenants HEUTE (UTC). 0 wenn keine. */
  getTenantDayCostEur(tenantId: string): Promise<number>;
  /** Akkumulierte Bulk-Email-Kosten (EUR) des Tenants im aktuellen Monat. 0 wenn keine. */
  getTenantMonthCostEur(tenantId: string): Promise<number>;
}

/**
 * 3-Schichten-Continuous-Cost-Cap (Daily zuerst, dann Monthly).
 *
 * Per Slice-Spec MT-1 Verification:
 *   - Daily-Cost  >= dailyCap   -> { allowed:false, reason:'daily_cap_hit' }
 *   - Monthly-Cost >= monthlyCap -> { allowed:false, reason:'monthly_cap_hit' }
 *   - sonst                      -> { allowed:true }
 *   - Daily wird ZUERST geprueft (Short-Circuit): bei Daily-Hit wird der
 *     Monthly-Lookup uebersprungen (kein zweiter DB-Roundtrip).
 *
 * Cap-Hit-Semantik: `actual >= cap` (anders als V9.0 estimate-basiertes
 * `projected <= cap`). Continuous prueft den Ist-Verbrauch, nicht einen Estimate
 * — der Run hat das Tages-/Monatsbudget erreicht, sobald die Summe den Cap
 * erreicht (5.00 EUR Daily = Hit, 4.99 EUR = allowed).
 *
 * Die Per-Email-Approval-Schicht (per-email-approval.ts) ist NICHT Teil dieses
 * Checks — sie greift erst im Worker (MT-3) pro Run vor dem Sonnet-Call.
 */
export async function checkContinuousCostCap(
  tenantId: string,
  store: ContinuousCapStore,
  opts: { dailyCapEur?: number; monthlyCapEur?: number } = {},
): Promise<ContinuousCapResult> {
  const dailyCap = opts.dailyCapEur ?? resolveDailyCapEur();
  const monthlyCap = opts.monthlyCapEur ?? resolveMonthlyCapEur();

  const dayCost = await store.getTenantDayCostEur(tenantId);
  if (dayCost >= dailyCap) {
    return {
      allowed: false,
      reason: "daily_cap_hit",
      cap: dailyCap,
      actual: dayCost,
    };
  }

  const monthCost = await store.getTenantMonthCostEur(tenantId);
  if (monthCost >= monthlyCap) {
    return {
      allowed: false,
      reason: "monthly_cap_hit",
      cap: monthlyCap,
      actual: monthCost,
    };
  }

  return { allowed: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Supabase-Production-Adapter fuer ContinuousCapStore
// ────────────────────────────────────────────────────────────────────────────

/** Tolerantes Number-Parsing fuer string/numeric/null-Cost-Spalten. */
function toCostNumber(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Aktuelles UTC-Datum als 'YYYY-MM-DD' (matched vw_bulk_email_cost_daily.day). */
function utcTodayDate(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

/** Monatsanfang als UTC 'YYYY-MM-01' (matched vw_bulk_email_cost_monthly.month). */
function utcMonthStartDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/**
 * Production-Adapter: liest vw_bulk_email_cost_daily (MIG-062/117) +
 * vw_bulk_email_cost_monthly (MIG-054/109) via Supabase-Admin-Client.
 *
 * Defensive Degradation (Slice-Spec MT-1 Edge-Case): fehlt die Daily-View
 * (Postgres-Fehlercode 42P01 = undefined_table, z.B. MIG-062 noch nicht applied),
 * liefert getTenantDayCostEur 0 statt zu werfen — die Daily-Schicht faellt auf
 * No-Op zurueck, die Monthly-Schicht greift weiter. Verhindert, dass eine
 * fehlende additive Schicht den ganzen Pipeline-Trigger blockt.
 */
export function createContinuousCapStoreFromSupabase(
  adminClient: SupabaseClient,
): ContinuousCapStore {
  return {
    async getTenantDayCostEur(tenantId) {
      const { data, error } = await adminClient
        .from("vw_bulk_email_cost_daily")
        .select("total_cost_eur")
        .eq("tenant_id", tenantId)
        .eq("day", utcTodayDate())
        .maybeSingle();
      if (error) {
        // 42P01 = undefined_table (Daily-View fehlt) -> graceful No-Op (0).
        if (error.code === "42P01") return 0;
        throw new Error(
          `continuous-cost-cap: failed to read vw_bulk_email_cost_daily for tenant ${tenantId}: ${error.message}`,
        );
      }
      const raw = (data as { total_cost_eur: string | number | null } | null)
        ?.total_cost_eur;
      return toCostNumber(raw);
    },

    async getTenantMonthCostEur(tenantId) {
      const { data, error } = await adminClient
        .from("vw_bulk_email_cost_monthly")
        .select("total_cost_eur")
        .eq("tenant_id", tenantId)
        .eq("month", utcMonthStartDate())
        .maybeSingle();
      if (error) {
        throw new Error(
          `continuous-cost-cap: failed to read vw_bulk_email_cost_monthly for tenant ${tenantId}: ${error.message}`,
        );
      }
      const raw = (data as { total_cost_eur: string | number | null } | null)
        ?.total_cost_eur;
      return toCostNumber(raw);
    },
  };
}
