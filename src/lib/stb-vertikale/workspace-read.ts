// StB-Vertikale Modul-Workspace-Reader — RLS-isolierter Lese-Layer (SLC-175 MT-1, OP V10).
//
// Der Konsum-Endpunkt der V10-Lieferdomaene: liest die vom Synthese-Worker
// (SLC-174) geschriebenen `modul_output`-Rows (MIG-124) und gruppiert sie fuer
// den Reader nach Modul + Output-Kind (Liefer-Triple) + KI-Hebel (Reifegrad 1-4).
//
// Tenant-Isolation (AC-175-3): die async-Reader nutzen den NORMALEN server-
// Client (authenticated, Cookie-JWT) — die RLS-Policy `modul_output_tenant_read`
// (MIG-124) scoped automatisch auf `auth.user_tenant_id()`. KEIN service_role,
// KEIN manueller tenant_id-Filter noetig (RLS ist die Bremse). Die Gruppierungs-
// /Sortier-Logik ist als pure Funktion ausgelagert -> hermetisch testbar.
//
// Quelle der Row-Shape: sql/migrations/124_v10_stb_modul_domain.sql (Teil 1) +
//   src/workers/stb-vertikale/handle-module-output-job.ts (Persist-Shape).

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// ─── Output-Kind-Vokabular ──────────────────────────────────────────────────
// Das Liefer-Triple in kanonischer Lese-Reihenfolge (Entscheidung -> Standard ->
// Implementierungsschritt). `ki_hebel` ist der vierte Kind, separat gerendert.
export const OUTPUT_TRIPLE_KINDS = [
  "entscheidung",
  "standard",
  "implementierungsschritt",
] as const;
export type OutputTripleKind = (typeof OUTPUT_TRIPLE_KINDS)[number];
export type OutputKind = OutputTripleKind | "ki_hebel";

/** Lesbare Labels fuer die Triple-Kinds (de). i18n-Vertiefung in MT-2 (/frontend). */
export const OUTPUT_TRIPLE_LABELS: Record<OutputTripleKind, string> = {
  entscheidung: "Entscheidung",
  standard: "Standard",
  implementierungsschritt: "Implementierungsschritt",
};

// ─── Row-Schema (defensiv geparst) ──────────────────────────────────────────
export const ModulOutputRowSchema = z.object({
  id: z.string(),
  modul_key: z.string(),
  output_kind: z.enum([
    "entscheidung",
    "standard",
    "implementierungsschritt",
    "ki_hebel",
  ]),
  title: z.string().nullable(),
  body: z.string(),
  reifegrad: z.number().int().min(1).max(4).nullable(),
  // jsonb-Array von frage_id-Strings (Provenance). Tolerant: Nicht-String-Eintraege
  // werden verworfen, kaputte Shape -> leere Liste (kein harter Reader-Bruch).
  evidence_refs: z
    .array(z.unknown())
    .transform((arr) => arr.filter((x): x is string => typeof x === "string"))
    .catch([] as string[]),
  source: z.string(),
  status: z.string(),
  capture_session_id: z.string(),
  ai_job_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ModulOutputRow = z.infer<typeof ModulOutputRowSchema>;

const SELECT_COLS =
  "id, modul_key, output_kind, title, body, reifegrad, evidence_refs, source, status, capture_session_id, ai_job_id, created_at, updated_at";

// ─── Gruppierung eines einzelnen Moduls (pure, AC-175-1) ─────────────────────
export interface TripleSection {
  kind: OutputTripleKind;
  label: string;
  rows: ModulOutputRow[];
}

export interface ModuleWorkspaceData {
  modulKey: string;
  /** Triple-Sections in kanonischer Reihenfolge (immer alle drei Kinds, ggf. leer). */
  triple: TripleSection[];
  /** KI-Hebel nach Reifegrad 1->4 gestaffelt (nulls zuletzt), dann Titel. */
  kiHebel: ModulOutputRow[];
  total: number;
}

/**
 * Sortiert KI-Hebel gestaffelt nach Reifegrad 1->4 (AC-175-1). Eintraege ohne
 * Reifegrad landen am Ende; innerhalb gleicher Stufe alphabetisch nach Titel
 * (stabil, deterministisch fuer den Render).
 */
function sortKiHebel(rows: ModulOutputRow[]): ModulOutputRow[] {
  return [...rows].sort((a, b) => {
    const ra = a.reifegrad ?? Number.POSITIVE_INFINITY;
    const rb = b.reifegrad ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return (a.title ?? "").localeCompare(b.title ?? "", "de");
  });
}

/**
 * Gruppiert die `modul_output`-Rows EINES Moduls fuer den Reader: das Liefer-
 * Triple in kanonischer Reihenfolge (jede Sektion ggf. leer) + die KI-Hebel-
 * Liste gestaffelt nach Reifegrad. Rows fremder modul_key werden ignoriert
 * (Defense — der Caller filtert bereits per Query).
 */
export function groupModuleOutputs(
  modulKey: string,
  rows: ModulOutputRow[],
): ModuleWorkspaceData {
  const own = rows.filter((r) => r.modul_key === modulKey);
  const triple: TripleSection[] = OUTPUT_TRIPLE_KINDS.map((kind) => ({
    kind,
    label: OUTPUT_TRIPLE_LABELS[kind],
    rows: own.filter((r) => r.output_kind === kind),
  }));
  const kiHebel = sortKiHebel(own.filter((r) => r.output_kind === "ki_hebel"));
  return { modulKey, triple, kiHebel, total: own.length };
}

// ─── Overview-Zusammenfassung (pure) ─────────────────────────────────────────
export interface ModulSummary {
  modulKey: string;
  outputCount: number;
  tripleCount: number;
  kiHebelCount: number;
  /** Juengstes created_at innerhalb des Moduls (ISO) — fuer "zuletzt erzeugt". */
  latestCreatedAt: string | null;
}

/**
 * Verdichtet ALLE Tenant-Rows zu einer Modul-Uebersicht (eine Zeile je
 * modul_key, aufsteigend sortiert). Basis fuer die Workspace-Startseite.
 */
export function summarizeModulOutputs(rows: ModulOutputRow[]): ModulSummary[] {
  const byModul = new Map<string, ModulOutputRow[]>();
  for (const row of rows) {
    const list = byModul.get(row.modul_key);
    if (list) list.push(row);
    else byModul.set(row.modul_key, [row]);
  }
  const summaries: ModulSummary[] = [];
  for (const [modulKey, list] of byModul) {
    const tripleCount = list.filter((r) =>
      (OUTPUT_TRIPLE_KINDS as readonly string[]).includes(r.output_kind),
    ).length;
    const kiHebelCount = list.filter((r) => r.output_kind === "ki_hebel").length;
    const latestCreatedAt = list.reduce<string | null>((acc, r) => {
      if (!acc || r.created_at > acc) return r.created_at;
      return acc;
    }, null);
    summaries.push({
      modulKey,
      outputCount: list.length,
      tripleCount,
      kiHebelCount,
      latestCreatedAt,
    });
  }
  return summaries.sort((a, b) => a.modulKey.localeCompare(b.modulKey, "de"));
}

/** Modul-Schluessel -> lesbares Label (`m04` -> `M-04`). */
export function modulKeyToLabel(modulKey: string): string {
  const match = modulKey.match(/^m(\d{2})$/i);
  return match ? `M-${match[1]}` : modulKey.toUpperCase();
}

// ─── Async-Reader (RLS-scoped, authenticated server-Client) ──────────────────

/**
 * Liest alle `modul_output`-Rows des aktuellen Tenants (RLS-scoped) fuer die
 * Workspace-Uebersicht. Tenant-Isolation kommt ausschliesslich aus der RLS-
 * Policy `modul_output_tenant_read` (MIG-124) — der Client traegt das JWT.
 */
export async function readWorkspaceOutputs(
  client: SupabaseClient,
): Promise<ModulOutputRow[]> {
  const { data, error } = await client
    .from("modul_output")
    .select(SELECT_COLS)
    .order("modul_key", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ModulOutputRowSchema.parse(row));
}

/**
 * Liest die `modul_output`-Rows EINES Moduls (RLS-scoped) fuer die Detail-Seite.
 * `modul_key`-Filter ist Bequemlichkeit/Defense — die Tenant-Grenze ist RLS.
 */
export async function readModulOutputsForModul(
  client: SupabaseClient,
  modulKey: string,
): Promise<ModulOutputRow[]> {
  const { data, error } = await client
    .from("modul_output")
    .select(SELECT_COLS)
    .eq("modul_key", modulKey)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ModulOutputRowSchema.parse(row));
}
