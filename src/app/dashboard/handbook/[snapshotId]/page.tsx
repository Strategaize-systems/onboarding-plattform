// SLC-044 MT-2 — Handbuch-Reader-Page (In-App-Reader).
//
// Datenfluss:
//   1. Auth via SSR-Client + Profile-Lookup (Rolle, Tenant).
//   2. Strategaize_admin oder tenant_admin → erlaubt; sonst Redirect /dashboard.
//   3. Snapshot via Service-Role-Admin laden — Cross-Tenant-Check inline:
//      tenant_admin sieht nur eigene Tenant-Snapshots (sonst 404). strategaize_admin
//      darf jeden Snapshot oeffnen.
//   4. Markdown-Content via loadSnapshotContent (entpackt das ZIP server-seitig).
//   5. Stale-Check: existiert ein block_checkpoint der GF-Session, das nach
//      snapshot.created_at angelegt wurde? → Stale-Banner.
//   6. Snapshot-Liste fuer den Tenant fuer ReaderSidebar.
//   7. Render via HandbookReader (Client) + ReaderSidebar (Client).

import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadSnapshotContent,
  type SectionFile,
} from "@/lib/handbook/load-snapshot-content";
import { checkSnapshotStale } from "@/lib/handbook/check-snapshot-stale";
import { extractWalkthroughIds } from "@/lib/handbook/extract-walkthrough-ids";
import { loadCrossSearchSnapshots } from "@/lib/handbook/load-cross-search-snapshots";
import { captureInfo } from "@/lib/logger";
import type { CrossSearchSnapshot } from "@/lib/handbook/cross-snapshot-search";
import { ReaderShell } from "@/components/handbook/ReaderShell";
import type { ReaderSnapshotMeta } from "@/components/handbook/types";
import { HelpTrigger } from "@/components/help/HelpTrigger";
import { loadHelpMarkdown } from "@/lib/help/load";

interface PageProps {
  params: Promise<{ snapshotId: string }>;
}

export default async function HandbookReaderPage({ params }: PageProps) {
  const { snapshotId } = await params;

  if (!snapshotId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, tenant_id, email")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !["tenant_admin", "strategaize_admin"].includes(profile.role)
  ) {
    redirect("/dashboard");
  }
  // tenant_id ist Pflicht fuer tenant_admin (eigener Tenant). strategaize_admin
  // hat tenant_id=NULL per Design und kann via Direct-URL Cross-Tenant lesen.
  if (profile.role === "tenant_admin" && !profile.tenant_id) {
    redirect("/dashboard");
  }

  const isStrategaizeAdmin = profile.role === "strategaize_admin";
  const adminClient = createAdminClient();

  const { data: snapshotRow, error: snapErr } = await adminClient
    .from("handbook_snapshot")
    .select(
      "id, tenant_id, capture_session_id, template_id, status, storage_path, storage_size_bytes, section_count, knowledge_unit_count, diagnosis_count, sop_count, error_message, metadata, created_at, updated_at",
    )
    .eq("id", snapshotId)
    .maybeSingle();

  if (snapErr || !snapshotRow) {
    notFound();
  }

  // Cross-Tenant-Schutz: tenant_admin nur eigener Tenant. strategaize_admin darf alles.
  if (!isStrategaizeAdmin && snapshotRow.tenant_id !== profile.tenant_id) {
    notFound();
  }

  const tenantIdForList = isStrategaizeAdmin
    ? snapshotRow.tenant_id
    : profile.tenant_id;

  // Snapshot-Liste fuer ReaderSidebar (alle Snapshots desselben Tenants).
  // SLC-054: storage_path zusaetzlich, damit der Cross-Search-Loader die ZIPs
  // direkt nachladen kann — kein zweiter DB-Roundtrip noetig.
  const { data: snapshotListRaw } = await adminClient
    .from("handbook_snapshot")
    .select(
      "id, status, storage_size_bytes, storage_path, section_count, knowledge_unit_count, diagnosis_count, sop_count, created_at, capture_session_id",
    )
    .eq("tenant_id", tenantIdForList)
    .order("created_at", { ascending: false });

  const dateFormatter = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });

  const snapshotList: ReaderSnapshotMeta[] = (snapshotListRaw ?? []).map(
    (row) => ({
      id: row.id as string,
      status: row.status as ReaderSnapshotMeta["status"],
      created_at: row.created_at as string,
      formattedCreatedAt: dateFormatter.format(new Date(row.created_at as string)),
      section_count: (row.section_count as number | null) ?? null,
      knowledge_unit_count: (row.knowledge_unit_count as number | null) ?? null,
      isActive: row.id === snapshotRow.id,
    }),
  );

  // SLC-054 MT-4: Body-Inhalte aller "ready"-Snapshots fuer client-side
  // Cross-Search. Sind nicht alle Snapshots "ready", werden nur die Ready-en
  // gesucht — generating/failed werden vom Loader uebersprungen.
  let crossSearchSnapshots: CrossSearchSnapshot[] = [];
  try {
    crossSearchSnapshots = await loadCrossSearchSnapshots(
      (snapshotListRaw ?? []).map((row) => ({
        id: row.id as string,
        status: row.status as ReaderSnapshotMeta["status"],
        storage_path: (row.storage_path as string | null) ?? null,
        created_at: row.created_at as string,
        formattedCreatedAt: dateFormatter.format(
          new Date(row.created_at as string),
        ),
      })),
    );
  } catch (err) {
    console.warn(
      "[handbook/page] Cross-Search-Snapshots konnten nicht geladen werden:",
      err,
    );
  }

  // Tenant-Name fuer Header (best-effort).
  const { data: tenantRow } = await adminClient
    .from("tenants")
    .select("name")
    .eq("id", snapshotRow.tenant_id)
    .maybeSingle();

  // Stale-Check (V4.1 SLC-042 + V5.1 SLC-092):
  //   - block_checkpoints der GF-Session nach Snapshot-Erzeugung
  //   - approved walkthrough_sessions des Tenants nach Snapshot-Erzeugung (DEC-097)
  let isStale = false;
  if (snapshotRow.status === "ready") {
    isStale = await checkSnapshotStale(adminClient, {
      capture_session_id: snapshotRow.capture_session_id as string,
      tenant_id: snapshotRow.tenant_id as string,
      created_at: snapshotRow.created_at as string,
    });
  }

  const helpMarkdown = loadHelpMarkdown("handbook");
  const helpTrigger = (
    <HelpTrigger pageKey="handbook" markdown={helpMarkdown} />
  );

  // Wenn Snapshot nicht "ready" → eigene Reader-Hint-View ohne Markdown-Load.
  if (snapshotRow.status !== "ready" || !snapshotRow.storage_path) {
    return (
      <ReaderShell
        snapshotId={snapshotRow.id}
        snapshotMeta={{
          status: snapshotRow.status as ReaderSnapshotMeta["status"],
          createdAtFormatted: dateFormatter.format(
            new Date(snapshotRow.created_at as string),
          ),
          tenantName: (tenantRow?.name as string | null) ?? null,
          sizeBytes: snapshotRow.storage_size_bytes as number | null,
          sectionCount: snapshotRow.section_count as number | null,
          knowledgeUnitCount: snapshotRow.knowledge_unit_count as number | null,
          diagnosisCount: snapshotRow.diagnosis_count as number | null,
          sopCount: snapshotRow.sop_count as number | null,
          errorMessage: snapshotRow.error_message as string | null,
          metadata: parseMetadata(snapshotRow.metadata),
        }}
        snapshotList={snapshotList}
        crossSearchSnapshots={crossSearchSnapshots}
        sections={[]}
        indexMarkdown={null}
        isStale={false}
        isStrategaizeAdmin={isStrategaizeAdmin}
        captureSessionId={snapshotRow.capture_session_id as string}
        isLargeSnapshot={false}
        totalMarkdownBytes={0}
        helpTrigger={helpTrigger}
      />
    );
  }

  let sections: SectionFile[] = [];
  let indexMarkdown: string | null = null;
  let totalMarkdownBytes = 0;
  let isLargeSnapshot = false;
  let loadError: string | null = null;

  try {
    const content = await loadSnapshotContent({
      storagePath: snapshotRow.storage_path as string,
      templateId: snapshotRow.template_id as string | null,
    });
    sections = content.sections;
    indexMarkdown = content.index?.markdown ?? null;
    totalMarkdownBytes = content.totalMarkdownBytes;
    isLargeSnapshot = content.isLargeSnapshot;
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  // SLC-092 MT-3 — Audit-Log einmalig pro Reader-Page-Load (DEC-098).
  // Wir sind hier nach Tenant-/Auth-Check; Cross-Tenant-Leser haben oben via
  // notFound() abgebrochen, also wird kein Audit fuer Forbidden-Faelle
  // geschrieben. Audit nur, wenn der Snapshot tatsaechlich Walkthrough-Embeds
  // referenziert — sonst ist er fuer V5.1-Audit nicht relevant.
  const walkthroughSessionIds = extractWalkthroughIds(sections, indexMarkdown);
  if (walkthroughSessionIds.length > 0) {
    captureInfo("walkthrough_video_embed", {
      source: "handbook/reader",
      userId: user.id,
      metadata: {
        category: "walkthrough_video_embed",
        snapshot_id: snapshotRow.id,
        tenant_id: snapshotRow.tenant_id,
        walkthrough_session_ids: walkthroughSessionIds,
      },
    });
  }

  return (
    <ReaderShell
      snapshotId={snapshotRow.id}
      snapshotMeta={{
        status: "ready",
        createdAtFormatted: dateFormatter.format(
          new Date(snapshotRow.created_at as string),
        ),
        tenantName: (tenantRow?.name as string | null) ?? null,
        sizeBytes: snapshotRow.storage_size_bytes as number | null,
        sectionCount: snapshotRow.section_count as number | null,
        knowledgeUnitCount: snapshotRow.knowledge_unit_count as number | null,
        diagnosisCount: snapshotRow.diagnosis_count as number | null,
        sopCount: snapshotRow.sop_count as number | null,
        errorMessage: loadError,
        metadata: parseMetadata(snapshotRow.metadata),
      }}
      snapshotList={snapshotList}
      crossSearchSnapshots={crossSearchSnapshots}
      sections={sections}
      indexMarkdown={indexMarkdown}
      isStale={isStale}
      isStrategaizeAdmin={isStrategaizeAdmin}
      captureSessionId={snapshotRow.capture_session_id as string}
      isLargeSnapshot={isLargeSnapshot}
      totalMarkdownBytes={totalMarkdownBytes}
      helpTrigger={helpTrigger}
    />
  );
}

function parseMetadata(raw: unknown): {
  pending_blocks: number;
  approved_blocks: number;
  rejected_blocks: number;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const pending = Number(obj.pending_blocks);
  const approved = Number(obj.approved_blocks);
  const rejected = Number(obj.rejected_blocks);
  if (
    !Number.isFinite(pending) &&
    !Number.isFinite(approved) &&
    !Number.isFinite(rejected)
  ) {
    return null;
  }
  return {
    pending_blocks: Number.isFinite(pending) ? pending : 0,
    approved_blocks: Number.isFinite(approved) ? approved : 0,
    rejected_blocks: Number.isFinite(rejected) ? rejected : 0,
  };
}
