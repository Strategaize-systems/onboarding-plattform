// SLC-039 MT-4 — INDEX.md Builder
// SLC-052 MT-2 — TOC-Links sind In-App-Anchors `#section-{slug}` statt
// Datei-Pfade `01_section.md`. Reader-CustomLink wird damit fuer NEUE Snapshots
// nicht mehr ausgeloest; Pre-V4.3-Snapshots rendern weiter ueber den Override.
//
// Erzeugt das Inhaltsverzeichnis fuer das Handbuch-ZIP.
// Header: Tenant-Name + Generierungs-Datum.
// Liste: alle Sections in Order, jeweils Markdown-Link auf In-App-Anchor.

import type { HandbookSection } from "./types";

interface IndexBuilderInput {
  sections: HandbookSection[]; // bereits nach order sortiert
  sectionFileMap: Record<string, string>;
  sectionAnchorMap: Record<string, string>;
  tenantName: string;
  generatedAt: Date;
}

export function buildIndexMarkdown(input: IndexBuilderInput): string {
  const { sections, sectionAnchorMap, tenantName, generatedAt } = input;

  const lines: string[] = [];
  const titleTenant = tenantName?.trim().length ? tenantName.trim() : "Tenant";

  lines.push(`# Unternehmerhandbuch — ${titleTenant}`);
  lines.push("");
  lines.push(`_Generiert am ${formatDate(generatedAt)}_`);
  lines.push("");
  lines.push("## Inhaltsverzeichnis");
  lines.push("");

  if (sections.length === 0) {
    lines.push("_Dieses Handbuch enthaelt aktuell keine Abschnitte._");
    lines.push("");
  } else {
    for (const s of sections) {
      const slug = sectionAnchorMap[s.key];
      lines.push(`${s.order}. [${s.title}](#section-${slug})`);
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function formatDate(d: Date): string {
  // ISO yyyy-mm-dd HH:MM (UTC) — deterministisch fuer Snapshot-Tests
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const min = pad2(d.getUTCMinutes());
  return `${y}-${m}-${day} ${h}:${min} UTC`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
