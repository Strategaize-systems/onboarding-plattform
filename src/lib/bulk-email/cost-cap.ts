// V9 SLC-167 MT-3 — Cost-Cap-Service fuer Pattern-Extraktion-Run (FEAT-073)
//
// Slice: SLC-167 — V9 Pattern-Extraktion + Curation-UI + Cost-Cap
// Spec: slices/SLC-167-v9-pattern-curation-cost-cap.md (MT-3 Expected behavior)
// DECs: DEC-182 (Cost-Cap-Enforcement-Flow), DEC-181 (V9.0 EUR-Approx)
//
// Pattern-Reuse-Anker: V8.1 SLC-161 src/lib/llm/v8-1-augmentation/augment.ts
//   Cost-Cap-Loop. V8.1 ist single-session in-Memory (accumulatedCost), V9 ist
//   Cross-Session DB-backed (vw_bulk_email_cost_monthly + email_bulk_run.
//   pattern_extraction_cost_eur). Konzept identisch, Implementierung anders.
//
// Vier Check-Methoden (per Slice-Spec L32-36):
//   1. checkRunCap(estimateEur, runCapEur): boolean
//      → Pure-Function, Pre-Approval-Page + Server-Action Re-Check.
//   2. checkTenantMonthlyCap(tenantId, estimateEur, hardCapEur, store): Promise
//      → Lookup vw_bulk_email_cost_monthly per Tenant + aktueller Monat.
//   3. checkPreApprovalThreshold(estimateEur, thresholdEur): boolean
//      → Pure-Function, MT-4 UI-Modal-Trigger.
//   4. checkLiveCapInWorker(runId, capEur, store): Promise
//      → MT-5 Worker-Schritt, Abbruch wenn akkumulierte cost > cap.
//
// Spec-Drift D-MT3-Live-Cap-Source — DOKUMENTIERT:
//   Slice-Spec L128 sagt "SELECT SUM(cost_eur) FROM ai_cost_ledger WHERE
//   bulk_run_id=X". Reale Schema-Lage:
//     (a) ai_cost_ledger hat keine bulk_run_id-Spalte (nur job_id REFERENCES ai_jobs).
//     (b) ai_cost_ledger.usd_cost ist in USD, nicht EUR — Cap-Check braucht EUR.
//   Stattdessen: email_bulk_run.pattern_extraction_cost_eur ist die V9-
//   Konvention (siehe MIG-051/106 + handle-pre-filter-job.ts USD_TO_EUR_APPROX-
//   Pattern). Worker MT-5 inkrementiert nach jedem Bedrock-Call. Live-Cap-Check
//   liest diese Spalte. Spec-Drift akzeptiert ohne Migration-Add (kleinste
//   Aenderung pro general.md Simplicity).
//
// ENV-Override-Konstanten:
//   V9_BULK_EMAIL_RUN_CAP_EUR              (Default 20)   → checkRunCap
//   V9_BULK_EMAIL_TENANT_MONTH_CAP_EUR     (Default 100)  → checkTenantMonthlyCap
//   V9_BULK_EMAIL_PRE_APPROVAL_THRESHOLD_EUR (Default 10) → checkPreApprovalThreshold
// Caller (MT-4 actions.ts) resolved die ENVs und uebergibt die Cap-Werte als
// Argumente. Module-Default-Konstanten sind hier nur Last-Resort-Default-Backup.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Last-Resort-Default fuer Run-Cap. Caller (Server-Action) sollte ENV nutzen. */
export const DEFAULT_RUN_CAP_EUR = 20;
/** Last-Resort-Default fuer Tenant-Monats-Cap. */
export const DEFAULT_TENANT_MONTH_CAP_EUR = 100;
/** Last-Resort-Default fuer Pre-Approval-Schwelle. */
export const DEFAULT_PRE_APPROVAL_THRESHOLD_EUR = 10;

// ────────────────────────────────────────────────────────────────────────────
// Pure-Function Check 1: Run-Cap (Soft-Cap pro einzelnem Run)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Liefert true wenn der geschaetzte Run-Cost im erlaubten Bereich liegt
 * (`estimateEur <= runCapEur`), false wenn der Run blockiert werden muss.
 *
 * Pure-Function: keine DB-Calls. Wird in Pre-Cost-Estimate-Page (MT-4 UI) als
 * Convenience-Check verwendet UND in Server-Action `startPatternExtraction`
 * (MT-4 actions.ts) als Sicherheits-Re-Check vor ai_jobs-Enqueue.
 */
export function checkRunCap(estimateEur: number, runCapEur: number): boolean {
  return estimateEur <= runCapEur;
}

// ────────────────────────────────────────────────────────────────────────────
// Pure-Function Check 2: Pre-Approval-Schwelle
// ────────────────────────────────────────────────────────────────────────────

/**
 * Liefert true wenn Pre-Approval-Modal getriggert werden muss
 * (`estimateEur > thresholdEur`), false wenn der Run ohne Modal startet.
 *
 * Pure-Function: keine DB-Calls. MT-4 Modal-Trigger.
 *
 * Beachte: Pre-Approval ist eine Warn-Schwelle, KEIN Block. Selbst wenn
 * estimateEur > thresholdEur ist der Run noch erlaubt — der GF muss nur
 * aktiv bestaetigen. checkRunCap blockt erst bei >> runCapEur (Hard-Stop).
 */
export function checkPreApprovalThreshold(
  estimateEur: number,
  thresholdEur: number,
): boolean {
  return estimateEur > thresholdEur;
}

// ────────────────────────────────────────────────────────────────────────────
// Data-Access-Layer fuer DB-gebundene Checks
// ────────────────────────────────────────────────────────────────────────────

/**
 * Narrow Data-Access-Interface fuer Cost-Cap-DB-Lookups. Erlaubt Test-Injection
 * via Mock-Implementierung (cost-cap.test.ts) sowie production via
 * Supabase-Admin-Client. Production-Adapter siehe createCostCapStoreFromSupabase.
 */
export interface CostCapStore {
  /**
   * Liest die aktuelle Monatssumme `total_cost_eur` aus
   * `vw_bulk_email_cost_monthly` fuer (`tenant_id`, `date_trunc('month', now())`).
   * Liefert `0`, wenn der Tenant im aktuellen Monat noch keinen Run hatte.
   */
  getTenantMonthCostEur(tenantId: string): Promise<number>;

  /**
   * Liest `email_bulk_run.pattern_extraction_cost_eur` fuer eine spezifische
   * Run-ID. Liefert `0`, wenn der Run noch nicht existiert oder noch kein
   * Bedrock-Call abgerechnet wurde.
   *
   * Used by checkLiveCapInWorker (MT-5).
   */
  getRunPatternExtractionCostEur(runId: string): Promise<number>;
}

// ────────────────────────────────────────────────────────────────────────────
// DB-Check 3: Tenant-Monthly-Cap (Hard-Cap pro Tenant pro Monat)
// ────────────────────────────────────────────────────────────────────────────

export interface TenantMonthlyCapResult {
  /** true wenn der Run noch im Tenant-Monatsbudget passt */
  allowed: boolean;
  /** Bisheriger Stand des laufenden Monats fuer den Tenant (EUR) */
  currentMonthEur: number;
  /** Verbleibendes Budget (EUR) — kann negativ sein wenn Tenant schon ueber Cap */
  remainingEur: number;
}

/**
 * Prueft, ob ein neuer Run mit `estimateEur` Pattern-Cost den Tenant-Monatscap
 * (`hardCapEur`) ueberschreiten wuerde.
 *
 * Verwendet `vw_bulk_email_cost_monthly` (MIG-054/109) als Single-Source-of-
 * Truth fuer die aktuelle Monatssumme. RLS via security_invoker=true erbt aus
 * email_bulk_run — Tenant-A sieht nur Tenant-A-Aggregate (siehe MIG-054).
 *
 * Aufrufer (MT-4 actions.ts): muss adminClient (service_role) injizieren, weil
 * GF beim Server-Action-Aufruf noch nicht authentifiziert sein muss (Server-
 * Action Context). adminClient hat BYPASSRLS und liest alle Tenants — wir
 * filtern explizit `WHERE tenant_id = $1` im store.
 */
export async function checkTenantMonthlyCap(
  tenantId: string,
  estimateEur: number,
  hardCapEur: number,
  store: CostCapStore,
): Promise<TenantMonthlyCapResult> {
  const currentMonthEur = await store.getTenantMonthCostEur(tenantId);
  const projectedEur = currentMonthEur + estimateEur;
  const remainingEur = hardCapEur - currentMonthEur;
  return {
    allowed: projectedEur <= hardCapEur,
    currentMonthEur,
    remainingEur,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// DB-Check 4: Live-Cap-Check im Worker (MT-5)
// ────────────────────────────────────────────────────────────────────────────

export interface LiveCapResult {
  /** true wenn die akkumulierte Run-Cost den Cap ueberschritten hat */
  exceeded: boolean;
  /** Aktueller email_bulk_run.pattern_extraction_cost_eur Stand (EUR) */
  currentEur: number;
}

/**
 * Worker-Schritt (MT-5): nach jedem erfolgreichen Sonnet-Call fuer einen
 * Thread fragt der Worker, ob die akkumulierte Run-Cost den Cap ueberschritten
 * hat. Wenn ja: Worker setzt `email_bulk_run.status='failed'` mit
 * `failure_reason='cost_cap_run_exceeded'` und bricht die Thread-Iteration ab.
 *
 * Quelle der currentEur: `email_bulk_run.pattern_extraction_cost_eur`. Der
 * Worker selbst inkrementiert diese Spalte nach jedem Bedrock-Call via
 * UPDATE-Statement (MT-5 Verantwortung). Diese Pure-Function liest den Wert
 * und vergleicht ihn mit dem Cap.
 *
 * Spec-Drift gegenueber Slice-Spec L165: dort steht "SELECT SUM(cost_eur)
 * FROM ai_cost_ledger WHERE bulk_run_id=X" — siehe Modul-Header Dokumentation.
 */
export async function checkLiveCapInWorker(
  runId: string,
  capEur: number,
  store: CostCapStore,
): Promise<LiveCapResult> {
  const currentEur = await store.getRunPatternExtractionCostEur(runId);
  return {
    exceeded: currentEur > capEur,
    currentEur,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Supabase-Production-Adapter fuer CostCapStore
// ────────────────────────────────────────────────────────────────────────────

/**
 * Production-Adapter: liest aus Coolify-Postgres via Supabase-Admin-Client.
 * Tests injizieren stattdessen einen Mock-Store (siehe __tests__/cost-cap.test.ts).
 */
export function createCostCapStoreFromSupabase(
  adminClient: SupabaseClient,
): CostCapStore {
  return {
    async getTenantMonthCostEur(tenantId) {
      // vw_bulk_email_cost_monthly aggregiert pro tenant_id + month.
      // current month = date_trunc('month', now()) — die View nutzt das
      // intern. Wir filtern hier den aktuellen Monat per >= start-of-month.
      const startOfMonth = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      )
        .toISOString()
        .slice(0, 10);
      const { data, error } = await adminClient
        .from("vw_bulk_email_cost_monthly")
        .select("total_cost_eur")
        .eq("tenant_id", tenantId)
        .eq("month", startOfMonth)
        .maybeSingle();
      if (error) {
        throw new Error(
          `cost-cap: failed to read vw_bulk_email_cost_monthly for tenant ${tenantId}: ${error.message}`,
        );
      }
      if (!data) return 0;
      const raw = (data as { total_cost_eur: string | number | null })
        .total_cost_eur;
      if (raw === null || raw === undefined) return 0;
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? n : 0;
    },

    async getRunPatternExtractionCostEur(runId) {
      const { data, error } = await adminClient
        .from("email_bulk_run")
        .select("pattern_extraction_cost_eur")
        .eq("id", runId)
        .maybeSingle();
      if (error) {
        throw new Error(
          `cost-cap: failed to read email_bulk_run ${runId}: ${error.message}`,
        );
      }
      if (!data) return 0;
      const raw = (
        data as { pattern_extraction_cost_eur: string | number | null }
      ).pattern_extraction_cost_eur;
      if (raw === null || raw === undefined) return 0;
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? n : 0;
    },
  };
}
