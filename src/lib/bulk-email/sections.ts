// V9 SLC-167 MT-6 — Section-Lookup-Helper fuer Curation-UI (FEAT-073)
//
// Slice: SLC-167 — V9 Pattern-Extraktion + Curation-UI + Cost-Cap
// Spec: slices/SLC-167-v9-pattern-curation-cost-cap.md (MT-6 Expected behavior L187)
// DEC: DEC-181 ("Andere..."-Free-Text-Section)
//
// Aufgabe: liefere die im Section-Dropdown anzuzeigenden Sections fuer den
// Curation-PatternCard. Quelle = `template.handbook_schema.sections[]` der
// V4.1-Template-Definition (MIG-027 + MIG-033). Wir appenden eine "Andere..."-
// Sentinel-Option (DEC-181), die im Client-Component eine Inline-Free-Text-
// Eingabe triggert.
//
// Pattern-Reuse-Anker: cost-cap.ts (MT-3) Pure-Function + Store-Adapter-Pattern,
// damit Vitest ohne Coolify-DB laufen kann.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sentinel-Wert fuer die Free-Text-Wahl im Section-Dropdown. Wenn der Client
 * diesen Wert auswaehlt, rendert er ein Inline-Free-Text-Input und schreibt
 * den eingegebenen String spaeter als `curated_section`. Der Sentinel selbst
 * wird NIE als `curated_section`-Wert persistiert.
 */
export const SECTION_OTHER_SENTINEL = "__other__" as const;

/** Lesbarer Label fuer die Sentinel-Option. */
export const SECTION_OTHER_LABEL = "Andere…";

/** Default-Template-Slug fuer Fallback wenn kein templateId mitgegeben wird. */
export const DEFAULT_TEMPLATE_SLUG = "exit_readiness";

/** Eine einzelne Section-Option im Dropdown. */
export interface SectionOption {
  /** Eindeutige Key wie sie auch in `curated_section` landet. */
  key: string;
  /** Lesbarer Label fuer das Dropdown. */
  label: string;
  /** true wenn dies die Free-Text-Sentinel-Option ist. */
  isOther: boolean;
}

/**
 * Narrow Data-Access-Interface fuer Template-Section-Lookups. Mock-injectable
 * fuer Vitest (sections.test.ts), production via Supabase-Admin-Client
 * (createSectionStoreFromSupabase).
 */
export interface SectionStore {
  /**
   * Liest `template.handbook_schema.sections[]` fuer die templateId.
   * Liefert `null` wenn das Template nicht existiert oder kein handbook_schema
   * hinterlegt ist.
   */
  getHandbookSectionsForTemplate(
    templateId: string,
  ): Promise<Array<{ key: string; title: string }> | null>;

  /**
   * Fallback-Lookup: liest `template.handbook_schema.sections[]` ueber den
   * Default-Template-Slug ("exit_readiness"). Verwendet wenn kein templateId
   * resolvbar ist oder das spezifische Template kein handbook_schema hat.
   */
  getHandbookSectionsForSlug(
    slug: string,
  ): Promise<Array<{ key: string; title: string }> | null>;
}

/**
 * Liefert die Sections-Liste fuer das Curation-Dropdown.
 *
 * Lookup-Reihenfolge:
 *   1. `templateId` mitgegeben + Template hat handbook_schema → diese Sections.
 *   2. Kein Template gefunden ODER kein handbook_schema → Fallback auf Default-
 *      Template-Slug (DEC-181: V9.0 nimmt exit_readiness als safe default).
 *   3. Auch kein Default-Template-handbook_schema → nur die Sentinel-Option.
 *
 * Die Sentinel-Option "Andere…" wird IMMER am Ende appended (auch wenn das
 * Template eigene Sections hat).
 *
 * Note: `tenantId` ist im Signatur-Slot fuer kuenftiges Tenant-Override
 * (eigene custom-Sections pro Tenant) reserviert; V9.0 nutzt sie nicht.
 * Spec L50 schreibt die Signatur (tenantId, templateId) vor.
 */
export async function getAvailableSections(
  _tenantId: string,
  templateId: string | null,
  store: SectionStore,
): Promise<SectionOption[]> {
  let raw: Array<{ key: string; title: string }> | null = null;
  if (templateId) {
    raw = await store.getHandbookSectionsForTemplate(templateId);
  }
  if (!raw || raw.length === 0) {
    raw = await store.getHandbookSectionsForSlug(DEFAULT_TEMPLATE_SLUG);
  }

  const options: SectionOption[] = (raw ?? []).map((s) => ({
    key: s.key,
    label: s.title,
    isOther: false,
  }));

  options.push({
    key: SECTION_OTHER_SENTINEL,
    label: SECTION_OTHER_LABEL,
    isOther: true,
  });

  return options;
}

/**
 * Pruefe, ob ein `curated_section`-String die Sentinel-Form ist. Der Worker /
 * Server-Action lehnt das ab — Sentinel darf nicht in die DB.
 */
export function isSentinelSection(value: string): boolean {
  return value === SECTION_OTHER_SENTINEL;
}

// ────────────────────────────────────────────────────────────────────────────
// Production-Adapter
// ────────────────────────────────────────────────────────────────────────────

interface TemplateRow {
  handbook_schema: { sections?: Array<{ key: string; title: string }> } | null;
}

/**
 * Production-Adapter: liest aus Coolify-Postgres via Supabase-Admin-Client.
 * Tests injizieren stattdessen einen Mock-Store (siehe __tests__/sections.test.ts).
 */
export function createSectionStoreFromSupabase(
  adminClient: SupabaseClient,
): SectionStore {
  async function readTemplateById(templateId: string) {
    const { data, error } = await adminClient
      .from("template")
      .select("handbook_schema")
      .eq("id", templateId)
      .maybeSingle();
    if (error || !data) return null;
    return data as TemplateRow;
  }

  async function readTemplateBySlug(slug: string) {
    const { data, error } = await adminClient
      .from("template")
      .select("handbook_schema")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return null;
    return data as TemplateRow;
  }

  function extractSections(
    row: TemplateRow | null,
  ): Array<{ key: string; title: string }> | null {
    if (!row || !row.handbook_schema) return null;
    const sections = row.handbook_schema.sections;
    if (!Array.isArray(sections)) return null;
    return sections
      .filter((s): s is { key: string; title: string } =>
        typeof s.key === "string" &&
        typeof s.title === "string" &&
        s.key.length > 0,
      )
      .map((s) => ({ key: s.key, title: s.title }));
  }

  return {
    async getHandbookSectionsForTemplate(templateId) {
      return extractSections(await readTemplateById(templateId));
    },
    async getHandbookSectionsForSlug(slug) {
      return extractSections(await readTemplateBySlug(slug));
    },
  };
}
