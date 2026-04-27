// SLC-039 MT-4 — INDEX.md Builder
//
// Erzeugt das Inhaltsverzeichnis fuer das Handbuch-ZIP.
// Header: Tenant-Name + Generierungs-Datum.
// Liste: alle Sections in Order, jeweils Markdown-Link auf Section-File.

import type { HandbookSection } from "./types";

interface IndexBuilderInput {
  sections: HandbookSection[]; // bereits nach order sortiert
  sectionFileMap: Record<string, string>;
  tenantName: string;
  generatedAt: Date;
}

export function buildIndexMarkdown(input: IndexBuilderInput): string {
  const { sections, sectionFileMap, tenantName, generatedAt } = input;

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
      const file = sectionFileMap[s.key] ?? `${s.key}.md`;
      lines.push(`${s.order}. [${s.title}](${file})`);
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
