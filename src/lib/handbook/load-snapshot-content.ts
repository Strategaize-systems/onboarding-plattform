// SLC-044 MT-2 — Handbuch-Snapshot-Content-Loader fuer den In-App-Reader.
//
// Der Worker schreibt pro Snapshot ein einzelnes ZIP (`{tenant_id}/{snapshot_id}.zip`)
// mit INDEX.md + N Section-Markdown-Files. Der Reader laedt das ZIP via Service-Role
// und entpackt es im Memory mit jszip. Pre-V4.1 Snapshots mit unbekannten Section-
// Layouts sind weiterhin downloadbar; der Reader betrachtet aber nur die `.md`-Files.
//
// Daten werden nur server-seitig konsumiert (Server-Component). Bundle-Auswirkung
// auf den Client = 0.
//
// Fuer den Cross-Link "Im Debrief bearbeiten" (SLC-044 MT-5) liefert der Loader
// zusaetzlich das aufbereitete Section→Block-Key-Mapping aus `template.handbook_schema`.
// Section mit genau einem `block_keys`-Eintrag bekommt einen eindeutigen Block-Key,
// Sections mit 0 oder >1 Bloecken bleiben ohne Cross-Link (Vereinfachung fuer V4.1).

import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "handbook";
const INDEX_FILENAME = "INDEX.md";
// Worker schreibt das ZIP mit Verzeichnis-Prefix `handbuch/` (siehe
// zip-builder.ts). Wir akzeptieren den optionalen Prefix, damit der Match
// klappt. Beispiele die matchen: "01_foo.md" und "handbuch/01_foo.md".
const SECTION_FILENAME_PATTERN = /^(?:handbuch\/)?(\d{2})_([a-z0-9_-]+)\.md$/i;
const INDEX_FILENAME_PATTERN = /^(?:handbuch\/)?INDEX\.md$/i;

export interface SectionFile {
  filename: string;
  order: number;
  sectionKey: string;
  title: string;
  markdown: string;
  /**
   * Eindeutiger Block-Key, falls die Section laut handbook_schema genau einen
   * Block addressiert. Bei 0 oder >1 Bloecken `null` — der Reader rendert dann
   * keinen Cross-Link (Slice-Spec-MT-5 Vereinfachung).
   */
  blockKey: string | null;
}

export interface IndexFile {
  filename: string;
  markdown: string;
}

export interface SnapshotContent {
  index: IndexFile | null;
  sections: SectionFile[];
  /** SLC-045 MT-2: Summe der Markdown-Bytes (INDEX + alle Sections). */
  totalMarkdownBytes: number;
  /** SLC-045 MT-2: true wenn totalMarkdownBytes > LARGE_SNAPSHOT_BYTE_THRESHOLD. */
  isLargeSnapshot: boolean;
}

/** SLC-045 MT-2: Schwellenwert fuer den Performance-Banner (500KB). */
export const LARGE_SNAPSHOT_BYTE_THRESHOLD = 500_000;

interface SchemaSectionLite {
  key: string;
  title: string;
  order: number;
  blockKeys: string[];
}

/**
 * Laedt das ZIP des Snapshots aus dem `handbook`-Storage-Bucket via Service-Role,
 * entpackt INDEX.md + Section-Files und reichert jede Section um den Block-Key
 * (falls eindeutig) und den lesbaren Titel aus `template.handbook_schema` an.
 *
 * Voraussetzung: Caller hat die Authorization bereits geprueft (Server-Component
 * mit Tenant-Match oder strategaize_admin). Der Service-Role-Client umgeht hier
 * lediglich den Storage-RLS auf `storage.objects`.
 */
export async function loadSnapshotContent(params: {
  storagePath: string;
  templateId: string | null;
}): Promise<SnapshotContent> {
  const adminClient = createAdminClient();

  const { data: blob, error: dlErr } = await adminClient.storage
    .from(STORAGE_BUCKET)
    .download(params.storagePath);

  if (dlErr || !blob) {
    throw new Error(
      `Snapshot-Storage konnte nicht geladen werden: ${dlErr?.message ?? "blob_missing"}`,
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const schemaMap = await loadSchemaSectionMap(adminClient, params.templateId);

  let index: IndexFile | null = null;
  const sections: SectionFile[] = [];

  for (const [filename, fileEntry] of Object.entries(zip.files)) {
    if (fileEntry.dir) continue;
    if (!filename.toLowerCase().endsWith(".md")) continue;

    const markdown = await fileEntry.async("string");

    if (INDEX_FILENAME_PATTERN.test(filename)) {
      index = { filename, markdown };
      continue;
    }

    const match = SECTION_FILENAME_PATTERN.exec(filename);
    if (!match) {
      // Unbekannte Markdown-Datei (z.B. README in alten Snapshots). Wir nehmen sie
      // mit reduzierten Metadaten in die Liste auf, damit der Reader sie zumindest
      // anzeigt — Cross-Link gibt es dafuer nicht.
      const fallbackName = filename.replace(/^.*\//, "").replace(/\.md$/i, "");
      sections.push({
        filename,
        order: 999,
        sectionKey: fallbackName,
        title: fallbackName,
        markdown,
        blockKey: null,
      });
      continue;
    }

    const order = Number.parseInt(match[1], 10);
    const sectionKey = match[2];
    const schemaEntry = schemaMap.get(sectionKey) ?? null;
    const blockKey =
      schemaEntry && schemaEntry.blockKeys.length === 1
        ? schemaEntry.blockKeys[0]
        : null;

    sections.push({
      filename,
      order: Number.isFinite(order) ? order : 999,
      sectionKey,
      title: schemaEntry?.title ?? sectionKey,
      markdown,
      blockKey,
    });
  }

  sections.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.sectionKey.localeCompare(b.sectionKey);
  });

  const totalMarkdownBytes =
    (index?.markdown.length ?? 0) +
    sections.reduce((sum, s) => sum + s.markdown.length, 0);

  return {
    index,
    sections,
    totalMarkdownBytes,
    isLargeSnapshot: totalMarkdownBytes > LARGE_SNAPSHOT_BYTE_THRESHOLD,
  };
}

async function loadSchemaSectionMap(
  adminClient: SupabaseClient,
  templateId: string | null,
): Promise<Map<string, SchemaSectionLite>> {
  const out = new Map<string, SchemaSectionLite>();
  if (!templateId) return out;

  const { data, error } = await adminClient
    .from("template")
    .select("handbook_schema")
    .eq("id", templateId)
    .single();

  if (error || !data?.handbook_schema) return out;

  const schema = data.handbook_schema as {
    sections?: Array<{
      key?: string;
      title?: string;
      order?: number;
      sources?: Array<{ filter?: { block_keys?: string[] } }>;
    }>;
  };

  for (const section of schema.sections ?? []) {
    if (!section.key) continue;
    const blockKeys = new Set<string>();
    for (const src of section.sources ?? []) {
      for (const bk of src.filter?.block_keys ?? []) {
        if (typeof bk === "string" && bk.length > 0) blockKeys.add(bk);
      }
    }
    out.set(section.key, {
      key: section.key,
      title: section.title ?? section.key,
      order: typeof section.order === "number" ? section.order : 999,
      blockKeys: [...blockKeys],
    });
  }

  return out;
}
