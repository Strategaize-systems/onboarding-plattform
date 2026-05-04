// SLC-054 MT-4 — Cross-Search-Snapshot-Loader.
//
// Laedt fuer alle "ready"-Snapshots eines Tenants nur das Notwendige fuer die
// client-side Cross-Snapshot-Suche: Snapshot-Metadaten + pro Section title +
// roher Markdown-Body. Templating-/Block-Key-Anreicherung (loadSnapshotContent)
// wird hier bewusst weggelassen — Search braucht keinen Block-Key, und das
// Re-Use des kompletten Loaders waere unnoetig schwer (Schema-Lookup pro Snapshot).
//
// Per V4.3 Trade-off (Slice SLC-054 R1): die ZIPs werden parallel via
// Promise.allSettled geladen. Bei >50 Snapshots wird hart auf 50 gekappt
// (Performance-Schutz; >20 zeigt die UI bereits eine Warnung). Einzelne
// fehlerhafte Snapshots werden uebersprungen, nicht als Page-Error.

import JSZip from "jszip";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CrossSearchSnapshot } from "@/lib/handbook/cross-snapshot-search";

const STORAGE_BUCKET = "handbook";
const SECTION_FILENAME_PATTERN = /^(?:handbuch\/)?(\d{2})_([a-z0-9_-]+)\.md$/i;
const HARD_CAP_SNAPSHOTS = 50;
const SECTION_TITLE_PATTERN = /^#\s+(.+?)\s*$/m;

interface SnapshotRow {
  id: string;
  status: "generating" | "ready" | "failed";
  storage_path: string | null;
  created_at: string;
  formattedCreatedAt: string;
}

/**
 * Laedt fuer eine Liste von "ready"-Snapshots die Search-relevante Body-Daten.
 * Snapshots ohne `storage_path` oder mit Download-Fehler werden weggelassen.
 */
export async function loadCrossSearchSnapshots(
  rows: SnapshotRow[],
): Promise<CrossSearchSnapshot[]> {
  const ready = rows.filter((r) => r.status === "ready" && r.storage_path);
  const capped = ready.slice(0, HARD_CAP_SNAPSHOTS);
  if (capped.length === 0) return [];

  const adminClient = createAdminClient();

  const results = await Promise.allSettled(
    capped.map(async (row): Promise<CrossSearchSnapshot | null> => {
      const { data: blob, error: dlErr } = await adminClient.storage
        .from(STORAGE_BUCKET)
        .download(row.storage_path as string);
      if (dlErr || !blob) return null;

      try {
        const buf = await blob.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        const sections: CrossSearchSnapshot["sections"] = [];

        for (const [filename, fileEntry] of Object.entries(zip.files)) {
          if (fileEntry.dir) continue;
          if (!filename.toLowerCase().endsWith(".md")) continue;
          const match = SECTION_FILENAME_PATTERN.exec(filename);
          if (!match) continue;

          const order = Number.parseInt(match[1], 10);
          const sectionKey = match[2];
          const markdown = await fileEntry.async("string");
          const titleMatch = SECTION_TITLE_PATTERN.exec(markdown);
          const title = titleMatch ? titleMatch[1] : sectionKey;

          sections.push({
            sectionKey,
            title,
            markdown,
            order: Number.isFinite(order) ? order : 999,
          });
        }

        sections.sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.sectionKey.localeCompare(b.sectionKey);
        });

        return {
          id: row.id,
          createdAtIso: row.created_at,
          formattedCreatedAt: row.formattedCreatedAt,
          sections,
        };
      } catch (err) {
        console.warn(
          `[loadCrossSearchSnapshots] Snapshot ${row.id} konnte nicht entpackt werden:`,
          err,
        );
        return null;
      }
    }),
  );

  const out: CrossSearchSnapshot[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) out.push(r.value);
  }
  return out;
}
