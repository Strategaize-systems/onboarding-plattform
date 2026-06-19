// V9.8 SLC-V9.8-B MT-1 — Controlled Tenant-Tag-Vokabular Loader (FEAT-088)
//
// Slice: slices/SLC-V9.8-B-controlled-tag-vokabular.md (MT-1)
// DECs: DEC-229 (Vokabular-Quelle = on-the-fly-Aggregation aus
//       knowledge_unit.themes pro Tenant — KEINE tenant_tag-Tabelle, KEIN
//       Aggregations-RPC), DEC-230 (Top-N nach Haeufigkeit, Cap 60/Tenant).
//
// Liefert das pro-Tenant wachsende Tag-Vokabular: die haeufigsten Tags aus der
// kuratierten/promoteten knowledge_unit.themes-Menge (Spalte via MIG-123,
// SLC-V9.8-A). Wird in den Synthese-Prompt injiziert (MT-2/MT-3), damit das LLM
// bestehende Tags reused statt Synonyme zu erfinden (Findbarkeit im Handbuch).
//
// Aggregations-Ort = JS-seitig (R-B-2): die Architektur sieht nur MIG-123
// (Spalte + GIN), KEINEN Aggregations-RPC vor. Der per-Tenant-knowledge_unit-
// Rowcount ist bounded → ein voller themes-Select ist billig. Die PostgREST-
// Default-Row-Obergrenze ist fuer die Top-N-Frequenz unkritisch (Top-60 aus dem
// bounded Bestand ist hoch-repraesentativ). Falls je gross: RPC/Materialisierung
// als V9.8+-Kandidat ("nicht ueberdesignen", general.md Simplicity).

import type { SupabaseClient } from "@supabase/supabase-js";

/** Cap fuer das injizierte Tag-Vokabular (DEC-230, Token-Budget R-B-1). */
export const DEFAULT_TAG_VOCABULARY_CAP = 60;

interface KnowledgeUnitThemesRow {
  themes: string[] | null;
}

/**
 * Liefert die Top-`cap` Tenant-Tags nach Haeufigkeit aus `knowledge_unit.themes`,
 * strikt tenant-scoped (`WHERE tenant_id = $1`). On-the-fly-Aggregation, keine
 * neue Tabelle / kein neuer RPC (DEC-229).
 *
 * - Frequenz absteigend; bei Gleichstand alphabetisch aufsteigend (deterministisch).
 * - Leeres / nur-leere themes → `[]` (graceful — Caller laesst dann den
 *   Vokabular-Block weg, Prompt bleibt unveraendert, AC-B-2).
 * - DB-Fehler → throw (Caller im Worker faengt + degradiert auf `[]`, AC-B-3).
 *
 * @param adminClient service_role-Client (BYPASSRLS) — die Tenant-Grenze wird
 *   hier explizit per `.eq("tenant_id", tenantId)` gezogen (AC-B-4).
 */
export async function getTenantTagVocabulary(
  adminClient: SupabaseClient,
  tenantId: string,
  cap: number = DEFAULT_TAG_VOCABULARY_CAP,
): Promise<string[]> {
  const { data, error } = await adminClient
    .from("knowledge_unit")
    .select("themes")
    .eq("tenant_id", tenantId);
  if (error) {
    throw new Error(
      `tag-vocabulary: knowledge_unit.themes SELECT failed for tenant ${tenantId}: ${error.message}`,
    );
  }

  const rows = (data ?? []) as KnowledgeUnitThemesRow[];
  const freq = new Map<string, number>();
  for (const row of rows) {
    const themes = row.themes;
    if (!Array.isArray(themes)) continue;
    for (const raw of themes) {
      if (typeof raw !== "string") continue;
      const tag = raw.trim();
      if (!tag) continue;
      freq.set(tag, (freq.get(tag) ?? 0) + 1);
    }
  }

  if (freq.size === 0) return [];

  const limit = Math.max(0, Math.trunc(cap));
  return [...freq.entries()]
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .slice(0, limit)
    .map(([tag]) => tag);
}
