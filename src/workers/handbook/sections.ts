// SLC-039 MT-3 — Section-Renderer (deterministisch, kein LLM)
//
// Pro Section: Header + intro_template + Subsections nach render.subsections_by
// (subtopic | block_key) + KU-Liste / Diagnose-Tabelle / SOP-Steps.
//
// Filterung der drei Quell-Tabellen erfolgt deterministisch aus section.sources[].filter.
// Der Renderer erzeugt KEIN ZIP, er liefert nur Markdown-Strings je Section-File.

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
  crossLinksFromSection: CrossLink[];
  sectionFileMap: Record<string, string>;
}

export interface RenderedSection {
  filename: string;
  markdown: string;
  knowledgeUnitCount: number;
  diagnosisCount: number;
  sopCount: number;
}

/**
 * Rendert eine Section in Markdown. Output-Filename folgt
 * `{order:02d}_{section.key}.md`.
 */
export function renderSection(input: RenderSectionInput): RenderedSection {
  const { section, knowledgeUnits, diagnoses, sops, crossLinksFromSection, sectionFileMap } = input;

  const filteredKus = filterKnowledgeUnits(section.sources, knowledgeUnits);
  const filteredDiags = filterDiagnoses(section.sources, diagnoses);
  const filteredSops = filterSops(section.sources, sops);

  const lines: string[] = [];

  // 1. Section-Header
  lines.push(`# ${section.title}`);
  lines.push("");

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
  };
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
      const t = step.title ? String(step.title).trim() : `Schritt ${i}`;
      out.push(`${i}. **${escapeMd(t)}**`);
      if (step.detail) {
        out.push(`   ${escapeMd(String(step.detail).trim().split("\n").join(" "))}`);
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
