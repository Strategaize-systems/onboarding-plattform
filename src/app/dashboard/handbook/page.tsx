// SLC-044 MT-6 — Snapshot-Auswahl-Page (ohne ID).
//
// Listet alle Handbuch-Snapshots des eigenen Tenants als Karten und linkt zur
// Reader-Page. Empty-State weist auf den Trigger durch StrategAIze hin.
//
// Strategaize_admin landet hier nicht regulaer — sie nutzen /admin/handbook —
// koennen aber direkt navigieren und sehen dann die eigenen Tenant-Snapshots.

import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { HandbookSelectionShell } from "@/components/handbook/HandbookSelectionShell";
import { HelpTrigger } from "@/components/help/HelpTrigger";
import { loadHelpMarkdown } from "@/lib/help/load";

interface HandbookListRow {
  id: string;
  status: "ready" | "generating" | "failed";
  created_at: string;
  formattedCreatedAt: string;
  storage_size_bytes: number | null;
  section_count: number | null;
  knowledge_unit_count: number | null;
  diagnosis_count: number | null;
  sop_count: number | null;
  metadata: {
    pending_blocks?: number;
    approved_blocks?: number;
    rejected_blocks?: number;
  } | null;
}

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "–";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default async function HandbookSelectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id, email")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/dashboard");
  }

  if (
    profile.role !== "tenant_admin" &&
    profile.role !== "strategaize_admin"
  ) {
    redirect("/dashboard");
  }

  // strategaize_admin hat keinen eigenen Tenant — Cross-Tenant-Sicht liegt
  // unter /admin/handbook.
  if (profile.role === "strategaize_admin") {
    redirect("/admin/handbook");
  }

  if (!profile.tenant_id) {
    redirect("/dashboard");
  }

  const { data: rows } = await supabase
    .from("handbook_snapshot")
    .select(
      "id, status, created_at, storage_size_bytes, section_count, knowledge_unit_count, diagnosis_count, sop_count, metadata",
    )
    .eq("tenant_id", profile.tenant_id)
    .order("created_at", { ascending: false });

  const dateFormatter = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });

  const snapshots: HandbookListRow[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    status: r.status as HandbookListRow["status"],
    created_at: r.created_at as string,
    formattedCreatedAt: dateFormatter.format(new Date(r.created_at as string)),
    storage_size_bytes: (r.storage_size_bytes as number | null) ?? null,
    section_count: (r.section_count as number | null) ?? null,
    knowledge_unit_count: (r.knowledge_unit_count as number | null) ?? null,
    diagnosis_count: (r.diagnosis_count as number | null) ?? null,
    sop_count: (r.sop_count as number | null) ?? null,
    metadata: (r.metadata as HandbookListRow["metadata"]) ?? null,
  }));

  return (
    <HandbookSelectionShell
      profile={{ email: profile.email as string, role: profile.role as string }}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-brand-primary-dark underline-offset-2 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Zurueck zum Dashboard
          </Link>
        </div>

        <header className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary/10">
              <BookOpen className="h-5 w-5 text-brand-primary-dark" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Unternehmerhandbuch
              </h1>
              <p className="text-sm text-slate-500">
                Konsolidierte Handbuch-Versionen aus deiner GF-Erhebung und den
                Mitarbeiter-Beitraegen.
              </p>
            </div>
          </div>
          <HelpTrigger
            pageKey="handbook"
            markdown={loadHelpMarkdown("handbook")}
          />
        </header>

        {snapshots.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <BookOpen className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-lg font-semibold text-slate-900">
                Noch kein Handbuch generiert
              </p>
              <p className="mt-1 max-w-md text-sm text-slate-500">
                Sobald StrategAIze deine Erhebung freigibt und einen Snapshot
                erzeugt, erscheint er hier zum Lesen. Bei Fragen wende dich an
                deinen Berater.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {snapshots.map((snap) => (
              <SnapshotCardLink key={snap.id} snap={snap} />
            ))}
          </div>
        )}
      </div>
    </HandbookSelectionShell>
  );
}

function SnapshotCardLink({ snap }: { snap: HandbookListRow }) {
  const isReady = snap.status === "ready";
  const isFailed = snap.status === "failed";
  const isGenerating = snap.status === "generating";

  const inner = (
    <Card
      className={`relative overflow-hidden transition-shadow ${
        isReady ? "cursor-pointer hover:shadow-md" : ""
      }`}
    >
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {isReady && (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Lesbar
              </Badge>
            )}
            {isGenerating && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Wird erzeugt
              </Badge>
            )}
            {isFailed && (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                Fehlgeschlagen
              </Badge>
            )}
            <span className="text-sm font-medium text-slate-800">
              {snap.formattedCreatedAt}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>{formatBytes(snap.storage_size_bytes)}</span>
            {snap.section_count !== null && (
              <span>{snap.section_count} Sektionen</span>
            )}
            {snap.knowledge_unit_count !== null && (
              <span>{snap.knowledge_unit_count} KU</span>
            )}
            {snap.diagnosis_count !== null && snap.diagnosis_count > 0 && (
              <span>{snap.diagnosis_count} Diagnosen</span>
            )}
            {snap.sop_count !== null && snap.sop_count > 0 && (
              <span>{snap.sop_count} SOPs</span>
            )}
          </div>

          {snap.metadata &&
            (snap.metadata.pending_blocks ||
              snap.metadata.approved_blocks ||
              snap.metadata.rejected_blocks) ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500">
              {snap.metadata.approved_blocks ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                  {snap.metadata.approved_blocks} approved
                </span>
              ) : null}
              {snap.metadata.rejected_blocks ? (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">
                  {snap.metadata.rejected_blocks} rejected
                </span>
              ) : null}
              {snap.metadata.pending_blocks ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                  {snap.metadata.pending_blocks} pending
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-shrink-0 items-center">
          {isReady && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary-dark">
              Oeffnen
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (!isReady) return inner;

  return (
    <Link
      href={`/dashboard/handbook/${snap.id}`}
      data-testid="handbook-list-open"
    >
      {inner}
    </Link>
  );
}
