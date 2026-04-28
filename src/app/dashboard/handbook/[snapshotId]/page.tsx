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
import { ReaderShell } from "@/components/handbook/ReaderShell";
import type { ReaderSnapshotMeta } from "@/components/handbook/types";

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
    !["tenant_admin", "strategaize_admin"].includes(profile.role) ||
    !profile.tenant_id
  ) {
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
  const { data: snapshotListRaw } = await adminClient
    .from("handbook_snapshot")
    .select(
      "id, status, storage_size_bytes, section_count, knowledge_unit_count, diagnosis_count, sop_count, created_at, capture_session_id",
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

  // Tenant-Name fuer Header (best-effort).
  const { data: tenantRow } = await adminClient
    .from("tenants")
    .select("name")
    .eq("id", snapshotRow.tenant_id)
    .maybeSingle();

  // Stale-Check: gibt es block_checkpoints der GF-Session, die NACH der
  // Snapshot-Erzeugung angelegt wurden? Tenant-weit waere strenger, aber die
  // Slice-Spec definiert den Stale-Check auf der GF-Session (snapshot.capture_session_id).
  let isStale = false;
  if (snapshotRow.status === "ready") {
    const { count } = await adminClient
      .from("block_checkpoint")
      .select("id", { count: "exact", head: true })
      .eq("capture_session_id", snapshotRow.capture_session_id)
      .gt("created_at", snapshotRow.created_at);
    isStale = (count ?? 0) > 0;
  }

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
        sections={[]}
        indexMarkdown={null}
        isStale={false}
        isStrategaizeAdmin={isStrategaizeAdmin}
        captureSessionId={snapshotRow.capture_session_id as string}
      />
    );
  }

  let sections: SectionFile[] = [];
  let indexMarkdown: string | null = null;
  let loadError: string | null = null;

  try {
    const content = await loadSnapshotContent({
      storagePath: snapshotRow.storage_path as string,
      templateId: snapshotRow.template_id as string | null,
    });
    sections = content.sections;
    indexMarkdown = content.index?.markdown ?? null;
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
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
      sections={sections}
      indexMarkdown={indexMarkdown}
      isStale={isStale}
      isStrategaizeAdmin={isStrategaizeAdmin}
      captureSessionId={snapshotRow.capture_session_id as string}
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
