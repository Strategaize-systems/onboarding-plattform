// SLC-039 MT-3 — Section-Renderer (deterministisch, kein LLM)
//
// Pro Section: Header + intro_template + Subsections nach render.subsections_by
// (subtopic | block_key) + KU-Liste / Diagnose-Tabelle / SOP-Steps.
//
// Filterung der drei Quell-Tabellen erfolgt deterministisch aus section.sources[].filter.
// Der Renderer erzeugt KEIN ZIP, er liefert nur Markdown-Strings je Section-File.

import { slugifyHeading } from "@/lib/handbook/slugify";
import type {
  CrossLink,
  DiagnosisRow,
  DiagnosisSubtopic,
  HandbookSection,
  KnowledgeUnitRow,
  SectionSource,
  SectionSourceFilter,
  SopRow,
  SubsectionsBy,
  WalkthroughMappingRow,
  WalkthroughRow,
  WalkthroughStepRow,
} from "./types";

const STATUS_RANK: Record<string, number> = {
  draft: 0,
  reviewed: 1,
  confirmed: 2,
};

interface RenderSectionInput {
  section: HandbookSection;
  knowledgeUnits: KnowledgeUnitRow[];
  diagnoses: DiagnosisRow[];
  sops: SopRow[];
  walkthroughs?: WalkthroughRow[]; // V5.1 SLC-091
  crossLinksFromSection: CrossLink[];
  sectionFileMap: Record<string, string>;
  sectionAnchorMap: Record<string, string>;
}

export interface RenderedSection {
  filename: string;
  markdown: string;
  knowledgeUnitCount: number;
  diagnosisCount: number;
  sopCount: number;
  walkthroughCount: number; // V5.1
}

/**
 * Rendert eine Section in Markdown. Output-Filename folgt
 * `{order:02d}_{section.key}.md`.
 *
 * V5.1 SLC-091: Wenn `section.sources` mind. einen `walkthrough`-Source-Eintrag
 * enthaelt, wird der Walkthroughs-Renderer-Pfad gewaehlt (deterministisch, kein
 * Mischbetrieb mit KU/Diagnose/SOP). DEC-095: Walkthroughs leben in eigener
 * Section, kein Inline-Mischen mit anderen Source-Typen.
 */
export function renderSection(input: RenderSectionInput): RenderedSection {
  const { section, knowledgeUnits, diagnoses, sops, walkthroughs, crossLinksFromSection, sectionFileMap, sectionAnchorMap } = input;

  // V5.1 SLC-091 — Walkthroughs-Section-Branch (DEC-095).
  if (section.sources.some((s) => s.type === "walkthrough")) {
    return renderWalkthroughsSection({
      section,
      walkthroughs: walkthroughs ?? [],
      crossLinksFromSection,
      sectionFileMap,
      sectionAnchorMap,
    });
  }

  const filteredKus = filterKnowledgeUnits(section.sources, knowledgeUnits);
  const filteredDiags = filterDiagnoses(section.sources, diagnoses);
  const filteredSops = filterSops(section.sources, sops);

  const lines: string[] = [];

  // 1. Section-Header
  lines.push(`# ${section.title}`);
  lines.push("");

  // SLC-052 MT-2 — In-App-Anchor fuer In-Reader-Navigation. Reader strippt den
  // h1 (HandbookReader.stripLeadingH1), daher kann rehype-slug den Section-Title
  // nicht direkt zur Anchor-ID machen. Inline-HTML-Anchor (rehype-raw rendert es)
  // ueberlebt das Strippen, weil er getrennte Markdown-Node ist. Pattern wie bei
  // subtopic/block-Anchors weiter unten.
  const sectionSlug = sectionAnchorMap[section.key];
  if (sectionSlug) {
    lines.push(`<a id="section-${sectionSlug}"></a>`);
    lines.push("");
  }

  // 2. Intro-Template
  if (section.render.intro_template && section.render.intro_template.trim().length > 0) {
    lines.push(section.render.intro_template.trim());
    lines.push("");
  }

  // 3. Cross-Link-Hinweise (oben in der Section)
  if (crossLinksFromSection.length > 0) {
    lines.push("> **Querverweise:**");
    for (const link of crossLinksFromSection) {
      const targetFile = sectionFileMap[link.to_section];
      if (targetFile) {
        lines.push(`> - Siehe [${link.to_section}](${targetFile})`);
      }
    }
    lines.push("");
  }

  // 4. Inhalt — leer wenn keine Daten gefunden
  const hasAnyContent =
    filteredKus.length > 0 || filteredDiags.length > 0 || filteredSops.length > 0;

  if (!hasAnyContent) {
    lines.push(
      "_Fuer diesen Abschnitt liegen aktuell noch keine erfassten Inhalte vor._",
    );
    lines.push("");
  } else {
    if (section.render.subsections_by === "subtopic") {
      lines.push(...renderBySubtopic(filteredKus, filteredDiags, filteredSops));
    } else {
      lines.push(...renderByBlockKey(filteredKus, filteredDiags, filteredSops));
    }
  }

  const filename = sectionFileMap[section.key] ?? `${pad2(section.order)}_${section.key}.md`;

  return {
    filename,
    markdown: lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n",
    knowledgeUnitCount: filteredKus.length,
    diagnosisCount: filteredDiags.length,
    sopCount: filteredSops.length,
    walkthroughCount: 0,
  };
}

/* ----------------------- Walkthroughs-Renderer (V5.1) ------------------- */

interface RenderWalkthroughsInput {
  section: HandbookSection;
  walkthroughs: WalkthroughRow[];
  crossLinksFromSection: CrossLink[];
  sectionFileMap: Record<string, string>;
  sectionAnchorMap: Record<string, string>;
}

/**
 * V5.1 SLC-091 — Renderer fuer Walkthroughs-Section. Pro approved Walkthrough
 * H2-Block mit `<video>`-Embed (Storage-Proxy-Pfad), Subtopic-gruppierter
 * Schritt-Liste + Unmapped-Bucket. Kein LLM, deterministisch.
 *
 * Embed-URL-Convention (DEC-096): `/api/walkthrough/{session_id}/embed`
 * (Storage-Proxy mit Range-Support, RPC-RLS-Check via DEC-099).
 */
export function renderWalkthroughsSection(input: RenderWalkthroughsInput): RenderedSection {
  const { section, walkthroughs, crossLinksFromSection, sectionFileMap, sectionAnchorMap } = input;

  const lines: string[] = [];

  // 1. Section-Header
  lines.push(`# ${section.title}`);
  lines.push("");

  const sectionSlug = sectionAnchorMap[section.key];
  if (sectionSlug) {
    lines.push(`<a id="section-${sectionSlug}"></a>`);
    lines.push("");
  }

  // 2. Intro-Template (oder Default)
  const intro =
    section.render.intro_template && section.render.intro_template.trim().length > 0
      ? section.render.intro_template.trim()
      : "_In diesem Abschnitt finden Sie freigegebene Walkthroughs der Mitarbeiter — Bildschirmaufnahmen mit extrahierten SOP-Schritten._";
  lines.push(intro);
  lines.push("");

  // 3. Cross-Links
  if (crossLinksFromSection.length > 0) {
    lines.push("> **Querverweise:**");
    for (const link of crossLinksFromSection) {
      const targetFile = sectionFileMap[link.to_section];
      if (targetFile) {
        lines.push(`> - Siehe [${link.to_section}](${targetFile})`);
      }
    }
    lines.push("");
  }

  // 4. Inhalt
  if (walkthroughs.length === 0) {
    lines.push("_Es wurden noch keine Walkthroughs freigegeben._");
    lines.push("");
  } else {
    for (const wt of walkthroughs) {
      lines.push(...renderSingleWalkthrough(wt));
    }
  }

  const filename = sectionFileMap[section.key] ?? `${pad2(section.order)}_${section.key}.md`;

  return {
    filename,
    markdown: lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n",
    knowledgeUnitCount: 0,
    diagnosisCount: 0,
    sopCount: 0,
    walkthroughCount: walkthroughs.length,
  };
}

function renderSingleWalkthrough(wt: WalkthroughRow): string[] {
  const out: string[] = [];

  // H2 Header: Recorder + Datum + Dauer
  const date = formatWalkthroughDate(wt.created_at);
  const duration = formatDuration(wt.duration_sec);
  const headerSuffix = duration ? ` (${duration})` : "";
  out.push(`## ${escapeMd(wt.recorder_display_name)} — ${date}${headerSuffix}`);
  out.push("");

  // Anchor
  const sessionShort = wt.id.slice(0, 8);
  out.push(`<a id="walkthrough-${sessionShort}"></a>`);
  out.push("");

  // Embed-Player (DEC-096)
  out.push(
    `<video src="/api/walkthrough/${wt.id}/embed" controls preload="metadata" style="max-width:100%;border-radius:0.5rem;background:#000;display:block;margin:1rem 0;"></video>`,
  );
  out.push("");

  // Subtopic-Gruppierung
  const stepsWithMapping = groupStepsBySubtopic(wt.steps, wt.mappings);
  const subtopicKeys = Array.from(stepsWithMapping.mapped.keys()).sort();

  for (const subtopic of subtopicKeys) {
    const subtopicSteps = stepsWithMapping.mapped.get(subtopic) ?? [];
    if (subtopicSteps.length === 0) continue;
    out.push(`### ${escapeMd(subtopic)}`);
    out.push("");
    out.push(...renderStepList(subtopicSteps));
    out.push("");
  }

  if (stepsWithMapping.unmapped.length > 0) {
    out.push("### Unzugeordnete Schritte");
    out.push("");
    out.push(...renderStepList(stepsWithMapping.unmapped));
    out.push("");
  }

  return out;
}

interface GroupedSteps {
  mapped: Map<string, WalkthroughStepRow[]>;
  unmapped: WalkthroughStepRow[];
}

function groupStepsBySubtopic(
  steps: WalkthroughStepRow[],
  mappings: WalkthroughMappingRow[],
): GroupedSteps {
  const mappingByStepId = new Map<string, WalkthroughMappingRow>();
  for (const m of mappings) {
    mappingByStepId.set(m.walkthrough_step_id, m);
  }

  const mapped = new Map<string, WalkthroughStepRow[]>();
  const unmapped: WalkthroughStepRow[] = [];

  for (const step of steps) {
    const mapping = mappingByStepId.get(step.id);
    if (mapping?.subtopic_id) {
      const arr = mapped.get(mapping.subtopic_id) ?? [];
      arr.push(step);
      mapped.set(mapping.subtopic_id, arr);
    } else {
      unmapped.push(step);
    }
  }
  return { mapped, unmapped };
}

function renderStepList(steps: WalkthroughStepRow[]): string[] {
  const out: string[] = [];
  // Innerhalb eines Subtopic-Buckets nach step_number sortieren
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);
  let i = 1;
  for (const step of sorted) {
    out.push(`${i}. **${escapeMd(step.action)}**`);
    const metaParts: string[] = [];
    if (step.responsible && step.responsible.trim()) {
      metaParts.push(`_Verantwortlich:_ ${escapeMd(step.responsible.trim())}`);
    }
    if (step.timeframe && step.timeframe.trim()) {
      metaParts.push(`_Frist:_ ${escapeMd(step.timeframe.trim())}`);
    }
    if (metaParts.length > 0) {
      out.push(`   ${metaParts.join(" | ")}`);
    }
    if (step.success_criterion && step.success_criterion.trim()) {
      out.push(
        `   _Erfolg:_ ${escapeMd(step.success_criterion.trim().split("\n").join(" "))}`,
      );
    }
    if (step.dependencies && step.dependencies.trim()) {
      out.push(`   _Voraussetzungen:_ ${escapeMd(step.dependencies.trim())}`);
    }
    i++;
  }
  return out;
}

function formatWalkthroughDate(iso: string): string {
  // Deterministisch: yyyy-mm-dd (UTC) ohne Locale-Drift
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const y = d.getUTCFullYear();
    const m = pad2(d.getUTCMonth() + 1);
    const day = pad2(d.getUTCDate());
    return `${y}-${m}-${day}`;
  } catch {
    return iso;
  }
}

function formatDuration(durationSec: number | null): string | null {
  if (durationSec === null || durationSec === undefined) return null;
  if (!Number.isFinite(durationSec) || durationSec < 0) return null;
  const total = Math.round(durationSec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad2(s)}`;
}

/* ----------------------------- Filter-Logik ----------------------------- */

function filterKnowledgeUnits(
  sources: SectionSource[],
  rows: KnowledgeUnitRow[],
): KnowledgeUnitRow[] {
  const kuSources = sources.filter((s) => s.type === "knowledge_unit");
  if (kuSources.length === 0) return [];
  const keep = new Set<string>();
  for (const src of kuSources) {
    for (const ku of rows) {
      if (matchesFilter(ku, src.filter)) {
        keep.add(ku.id);
      }
    }
  }
  return rows
    .filter((ku) => keep.has(ku.id))
    .sort((a, b) => a.block_key.localeCompare(b.block_key) || a.title.localeCompare(b.title));
}

function filterDiagnoses(sources: SectionSource[], rows: DiagnosisRow[]): DiagnosisRow[] {
  const diagSources = sources.filter((s) => s.type === "diagnosis");
  if (diagSources.length === 0) return [];
  const keep = new Set<string>();
  for (const src of diagSources) {
    for (const d of rows) {
      if (matchesDiagnosisFilter(d, src.filter)) {
        keep.add(d.id);
      }
    }
  }
  return rows
    .filter((d) => keep.has(d.id))
    .sort((a, b) => a.block_key.localeCompare(b.block_key));
}

function filterSops(sources: SectionSource[], rows: SopRow[]): SopRow[] {
  const sopSources = sources.filter((s) => s.type === "sop");
  if (sopSources.length === 0) return [];
  const keep = new Set<string>();
  for (const src of sopSources) {
    for (const s of rows) {
      if (matchesSopFilter(s, src.filter)) {
        keep.add(s.id);
      }
    }
  }
  return rows
    .filter((s) => keep.has(s.id))
    .sort((a, b) => a.block_key.localeCompare(b.block_key));
}

function matchesFilter(ku: KnowledgeUnitRow, filter: SectionSourceFilter): boolean {
  if (filter.block_keys && !filter.block_keys.includes(ku.block_key)) return false;
  if (filter.source_in && !filter.source_in.includes(ku.source)) return false;
  if (filter.exclude_source && filter.exclude_source.includes(ku.source)) return false;
  return true;
}

function matchesDiagnosisFilter(d: DiagnosisRow, filter: SectionSourceFilter): boolean {
  if (filter.block_keys && !filter.block_keys.includes(d.block_key)) return false;
  if (filter.min_status) {
    const need = STATUS_RANK[filter.min_status] ?? 0;
    const have = STATUS_RANK[d.status] ?? -1;
    if (have < need) return false;
  }
  return true;
}

function matchesSopFilter(s: SopRow, filter: SectionSourceFilter): boolean {
  if (filter.block_keys && !filter.block_keys.includes(s.block_key)) return false;
  return true;
}

/* ------------------------- Subsection-Rendering ------------------------- */

function renderBySubtopic(
  kus: KnowledgeUnitRow[],
  diags: DiagnosisRow[],
  sops: SopRow[],
): string[] {
  const out: string[] = [];

  // Subtopics aus den Diagnosen extrahieren (Diagnose-Schema ist die Wahrheit)
  const subtopicMap = new Map<string, { name: string; blockKey: string }>();
  const subtopicOrder: string[] = [];
  for (const d of diags) {
    const subs = Array.isArray(d.content?.subtopics) ? d.content.subtopics : [];
    for (const st of subs) {
      if (!st || typeof st.key !== "string") continue;
      if (!subtopicMap.has(st.key)) {
        subtopicMap.set(st.key, { name: st.name ?? st.key, blockKey: d.block_key });
        subtopicOrder.push(st.key);
      }
    }
  }

  if (subtopicMap.size === 0) {
    // Fallback: kein Diagnose-Subtopic-Schema vorhanden -> nach block_key gruppieren
    return renderByBlockKey(kus, diags, sops);
  }

  for (const subtopicKey of subtopicOrder) {
    const meta = subtopicMap.get(subtopicKey)!;
    out.push(`## ${meta.name}`);
    out.push("");
    out.push(`<a id="subtopic-${subtopicKey}"></a>`);
    out.push("");

    // Diagnose-Felder fuer diese Subtopic
    for (const d of diags) {
      const sub = (d.content?.subtopics ?? []).find(
        (s: DiagnosisSubtopic) => s.key === subtopicKey,
      );
      if (sub?.fields) {
        out.push(...renderDiagnosisSubtopicTable(sub));
        out.push("");
      }
    }

    // SOPs fuer den zugehoerigen Block (Subtopic-Match nicht direkt, daher Block-Match)
    const blockSops = sops.filter((s) => s.block_key === meta.blockKey);
    for (const sop of blockSops) {
      out.push(...renderSop(sop));
      out.push("");
    }
  }

  // KUs als Ueberblick am Ende (KUs haben keinen subtopic_key auf der Tabelle)
  if (kus.length > 0) {
    out.push("## Erfasste Wissens-Einheiten");
    out.push("");
    out.push(...renderKnowledgeUnitsList(kus));
    out.push("");
  }

  return out;
}

function renderByBlockKey(
  kus: KnowledgeUnitRow[],
  diags: DiagnosisRow[],
  sops: SopRow[],
): string[] {
  const out: string[] = [];
  const blocks = new Set<string>([
    ...kus.map((k) => k.block_key),
    ...diags.map((d) => d.block_key),
    ...sops.map((s) => s.block_key),
  ]);
  const ordered = Array.from(blocks).sort();

  for (const block of ordered) {
    out.push(`## Block ${block}`);
    out.push("");
    out.push(`<a id="block-${block}"></a>`);
    out.push("");

    const blockKus = kus.filter((k) => k.block_key === block);
    if (blockKus.length > 0) {
      out.push("### Wissens-Einheiten");
      out.push("");
      out.push(...renderKnowledgeUnitsList(blockKus));
      out.push("");
    }

    const blockDiags = diags.filter((d) => d.block_key === block);
    for (const d of blockDiags) {
      const subs = Array.isArray(d.content?.subtopics) ? d.content.subtopics : [];
      for (const sub of subs) {
        if (!sub || typeof sub.key !== "string") continue;
        out.push(`### ${sub.name ?? sub.key}`);
        out.push("");
        out.push(`<a id="subtopic-${sub.key}"></a>`);
        out.push("");
        if (sub.fields) {
          out.push(...renderDiagnosisSubtopicTable(sub));
          out.push("");
        }
      }
    }

    const blockSops = sops.filter((s) => s.block_key === block);
    for (const sop of blockSops) {
      out.push(...renderSop(sop));
      out.push("");
    }
  }

  return out;
}

function renderKnowledgeUnitsList(kus: KnowledgeUnitRow[]): string[] {
  const out: string[] = [];
  for (const ku of kus) {
    out.push(`- **${escapeMd(ku.title)}** _(Block ${ku.block_key}, Konfidenz: ${ku.confidence})_`);
    if (ku.body && ku.body.trim().length > 0) {
      out.push(`  ${escapeMd(ku.body.trim().split("\n").join(" "))}`);
    }
  }
  return out;
}

function renderDiagnosisSubtopicTable(sub: DiagnosisSubtopic): string[] {
  const out: string[] = [];
  const fields = sub.fields ?? {};
  const entries = Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== "");

  if (entries.length === 0) {
    out.push("_Keine Diagnose-Felder erfasst._");
    return out;
  }

  out.push("| Feld | Wert |");
  out.push("|------|------|");
  for (const [k, v] of entries) {
    out.push(`| ${escapeTableCell(k)} | ${escapeTableCell(stringifyValue(v))} |`);
  }
  return out;
}

function renderSop(sop: SopRow): string[] {
  const out: string[] = [];
  const title = sop.content?.title?.trim() || `SOP fuer Block ${sop.block_key}`;
  out.push(`### ${escapeMd(title)}`);
  out.push("");
  if (sop.content?.objective) {
    out.push(`_Ziel:_ ${escapeMd(String(sop.content.objective))}`);
    out.push("");
  }
  const steps = Array.isArray(sop.content?.steps) ? sop.content.steps : [];
  if (steps.length > 0) {
    let i = 1;
    for (const step of steps) {
      const num = typeof step.number === "number" ? step.number : i;
      // Title bevorzugt: action (Generator) > title (Legacy) > "Schritt N"
      const titleRaw =
        (typeof step.action === "string" && step.action.trim()) ||
        (typeof step.title === "string" && step.title.trim()) ||
        `Schritt ${num}`;
      out.push(`${num}. **${escapeMd(titleRaw)}**`);

      // Detail-Zeilen: aus action-Schema (responsible/timeframe/success_criterion)
      // oder aus legacy detail-Feld.
      const metaParts: string[] = [];
      if (typeof step.responsible === "string" && step.responsible.trim()) {
        metaParts.push(`_Verantwortlich:_ ${escapeMd(step.responsible.trim())}`);
      }
      if (typeof step.timeframe === "string" && step.timeframe.trim()) {
        metaParts.push(`_Frist:_ ${escapeMd(step.timeframe.trim())}`);
      }
      if (metaParts.length > 0) {
        out.push(`   ${metaParts.join(" | ")}`);
      }
      if (typeof step.success_criterion === "string" && step.success_criterion.trim()) {
        out.push(
          `   _Erfolg:_ ${escapeMd(step.success_criterion.trim().split("\n").join(" "))}`,
        );
      }
      if (typeof step.detail === "string" && step.detail.trim()) {
        out.push(`   ${escapeMd(step.detail.trim().split("\n").join(" "))}`);
      }
      const deps = Array.isArray(step.dependencies) ? step.dependencies : [];
      if (deps.length > 0) {
        out.push(`   _Voraussetzungen:_ Schritt ${deps.map((d) => String(d)).join(", ")}`);
      }
      i++;
    }
  } else {
    out.push("_Diese SOP enthaelt aktuell keine Schritte._");
  }
  return out;
}

/* --------------------------- Hilfsfunktionen --------------------------- */

export function buildSectionFileMap(sections: HandbookSection[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of [...sections].sort((a, b) => a.order - b.order)) {
    out[s.key] = `${pad2(s.order)}_${s.key}.md`;
  }
  return out;
}

/**
 * SLC-052 MT-2 — Pro Section ein Slug aus dem section.title (nicht section.key),
 * damit die Anchor-ID mit rehype-slug-Output uebereinstimmt (gleicher Algorithmus
 * via github-slugger, siehe lib/handbook/slugify.ts). Der Worker injiziert pro
 * Section ein <a id="section-{slug}"></a> nach dem h1, der TOC im INDEX nutzt
 * `[Title](#section-{slug})`.
 */
export function buildSectionAnchorMap(sections: HandbookSection[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sections) {
    out[s.key] = slugifyHeading(s.title);
  }
  return out;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function escapeMd(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// Re-Export typed marker for SubsectionsBy parameter validation in tests
export type { SubsectionsBy };
