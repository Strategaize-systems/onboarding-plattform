import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { AutoRefresh } from "./AutoRefresh";
import { TriggerHandbookButton } from "./TriggerHandbookButton";
import { HandbookSnapshotList } from "./HandbookSnapshotList";
import type { CaptureSessionLite, HandbookSnapshotRow } from "./types";
import { getReviewSummary } from "@/lib/handbook/get-review-summary";

/**
 * SLC-040 — Handbuch-UI fuer tenant_admin / strategaize_admin.
 *
 * Datenfluss:
 *   1. Auth + Role-Check.
 *   2. GF-capture_session des Admins finden (analog Bridge-Page: owner_user_id=user.id,
 *      capture_mode IS NULL oder != 'employee_questionnaire'). Bevorzugt Session,
 *      die schon Snapshots hat; sonst juengste GF-Session.
 *   3. Alle handbook_snapshot-Rows der Session laden, sortiert nach created_at desc.
 *
 * Empty-States:
 *   - Keine GF-Session -> Hinweis + Link auf /capture/new.
 *   - GF-Session ohne Snapshot -> Trigger-Button + Erklaerungstext.
 *
 * Auto-Refresh fuer generating-Snapshots: meta-refresh nach 5s, solange mind.
 * ein Snapshot status='generating' hat.
 */

export default async function AdminHandbookPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !["tenant_admin", "strategaize_admin"].includes(profile.role)
  ) {
    redirect("/dashboard");
  }

  // strategaize_admin: Cross-Tenant-Reader-Sicht. Listet alle Snapshots aller
  // Tenants mit Reader-Direktlink. Trigger/Quality-Gate gibt es hier nicht —
  // generieren passiert tenant-spezifisch via tenant_admin in deren Sicht.
  if (profile.role === "strategaize_admin") {
    return <CrossTenantHandbookView />;
  }

  if (!profile.tenant_id) {
    redirect("/dashboard");
  }

  // GF-Session finden (Pattern aus /admin/bridge/page.tsx)
  const { data: ownSessionsRaw } = await supabase
    .from("capture_session")
    .select("id, status, capture_mode, started_at, template:template_id(name)")
    .eq("tenant_id", profile.tenant_id)
    .eq("owner_user_id", user.id)
    .or("capture_mode.is.null,capture_mode.neq.employee_questionnaire")
    .order("started_at", { ascending: false });

  const ownSessions = ownSessionsRaw ?? [];
  let activeSession: CaptureSessionLite | null = null;

  if (ownSessions.length > 0) {
    const ownIds = ownSessions.map((s) => s.id as string);
    const { data: priorSnapshots } = await supabase
      .from("handbook_snapshot")
      .select("capture_session_id")
      .in("capture_session_id", ownIds)
      .order("created_at", { ascending: false })
      .limit(1);

    const priorSessionId = priorSnapshots?.[0]?.capture_session_id ?? null;
    const chosen = priorSessionId
      ? ownSessions.find((s) => s.id === priorSessionId) ?? ownSessions[0]
      : ownSessions[0];

    activeSession = {
      id: chosen.id as string,
      status: chosen.status as string,
      started_at: chosen.started_at as string,
      template_name: (Array.isArray(chosen.template)
        ? chosen.template[0]?.name ?? null
        : (chosen.template as { name: string } | null)?.name ?? null) as string | null,
    };
  }

  if (!activeSession) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Unternehmerhandbuch</h1>
          <p className="mt-1 text-sm text-slate-500">
            Konsolidiertes PDF/Markdown-Paket aus deiner GF-Erhebung und den Mitarbeiter-Aufgaben.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Noch keine GF-Erhebung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              Das Unternehmerhandbuch wird aus deinen Antworten erzeugt. Starte zuerst eine
              eigene Erhebung und schliesse die Bloecke ab.
            </p>
            <Link
              href="/capture/new"
              className="inline-flex h-9 items-center rounded-md bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-dark"
            >
              Neue Erhebung starten
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Snapshots laden
  const { data: snapshotsRaw } = await supabase
    .from("handbook_snapshot")
    .select(
      "id, capture_session_id, status, storage_size_bytes, section_count, knowledge_unit_count, diagnosis_count, sop_count, error_message, created_at, updated_at"
    )
    .eq("capture_session_id", activeSession.id)
    .order("created_at", { ascending: false });

  const dateFormatter = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });

  const snapshots = ((snapshotsRaw ?? []) as Array<Omit<HandbookSnapshotRow, "formattedCreatedAt">>).map(
    (s) => ({
      ...s,
      formattedCreatedAt: dateFormatter.format(new Date(s.created_at)),
    })
  ) as HandbookSnapshotRow[];

  const hasGenerating = snapshots.some((s) => s.status === "generating");
  const hasReady = snapshots.some((s) => s.status === "ready");

  // SLC-042 — Quality-Gate-Daten fuer den TriggerHandbookButton.
  // ISSUE-029 Fix: ueber Tenant aggregieren, weil block_review-Rows in den
  // Mitarbeiter-Sessions liegen (nicht in der GF-Session des Beraters).
  const reviewSummary = await getReviewSummary(supabase, profile.tenant_id);

  return (
    <div className="space-y-6">
      {hasGenerating && <AutoRefresh intervalMs={5000} />}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Unternehmerhandbuch</h1>
          <p className="mt-1 text-sm text-slate-500">
            Konsolidiertes Markdown-Paket aus deiner GF-Erhebung. Aktuelle Erhebung:{" "}
            <span className="font-medium text-slate-700">
              {activeSession.template_name ?? "Unbekannt"}
            </span>
            .
          </p>
        </div>
        <TriggerHandbookButton
          captureSessionId={activeSession.id}
          hasPreviousSnapshot={hasReady}
          disabled={hasGenerating}
          reviewSummary={reviewSummary}
        />
      </div>

      {hasGenerating && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Handbuch wird im Hintergrund erzeugt (typischerweise unter 30s). Die Seite
          aktualisiert sich automatisch alle 5 Sekunden.
        </div>
      )}

      {snapshots.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Noch kein Handbuch</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              Sobald deine Erhebung Inhalte enthaelt (Bloecke abgeschlossen, Diagnosen
              bestaetigt, SOPs erzeugt), kannst du ein konsolidiertes Markdown-Paket
              generieren. Das ZIP enthaelt einen Index und 8 Sektionen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <HandbookSnapshotList
          snapshots={snapshots}
          captureSessionId={activeSession.id}
          reviewSummary={reviewSummary}
        />
      )}
    </div>
  );
}

// SLC-044 Iter-5 — Cross-Tenant-Reader-Liste fuer strategaize_admin.
// Listet alle Snapshots aller Tenants. Klick auf "Im Reader oeffnen" fuehrt
// zur normalen Reader-URL `/dashboard/handbook/[id]`, wo strategaize_admin
// per AC-4 Direct-URL-Zugriff hat.
async function CrossTenantHandbookView() {
  const adminClient = createAdminClient();

  const { data: rows } = await adminClient
    .from("handbook_snapshot")
    .select(
      "id, tenant_id, status, created_at, storage_size_bytes, section_count, knowledge_unit_count, diagnosis_count, sop_count, metadata",
    )
    .order("created_at", { ascending: false });

  const tenantIds = Array.from(
    new Set((rows ?? []).map((r) => r.tenant_id as string)),
  );

  const { data: tenantRows } = await adminClient
    .from("tenants")
    .select("id, name")
    .in("id", tenantIds.length > 0 ? tenantIds : ["00000000-0000-0000-0000-000000000000"]);

  const tenantNameById = new Map<string, string>();
  for (const t of tenantRows ?? []) {
    tenantNameById.set(t.id as string, (t.name as string) ?? "(ohne Name)");
  }

  const dateFormatter = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });

  const grouped = new Map<
    string,
    Array<{
      id: string;
      status: "ready" | "generating" | "failed";
      created_at: string;
      formattedCreatedAt: string;
      sizeBytes: number | null;
      sectionCount: number | null;
      knowledgeUnitCount: number | null;
      metadata: {
        pending_blocks?: number;
        approved_blocks?: number;
        rejected_blocks?: number;
      } | null;
    }>
  >();

  for (const r of rows ?? []) {
    const tid = r.tenant_id as string;
    const list = grouped.get(tid) ?? [];
    list.push({
      id: r.id as string,
      status: r.status as "ready" | "generating" | "failed",
      created_at: r.created_at as string,
      formattedCreatedAt: dateFormatter.format(new Date(r.created_at as string)),
      sizeBytes: (r.storage_size_bytes as number | null) ?? null,
      sectionCount: (r.section_count as number | null) ?? null,
      knowledgeUnitCount: (r.knowledge_unit_count as number | null) ?? null,
      metadata: (r.metadata as {
        pending_blocks?: number;
        approved_blocks?: number;
        rejected_blocks?: number;
      } | null) ?? null,
    });
    grouped.set(tid, list);
  }

  const tenantsWithSnapshots = Array.from(grouped.entries())
    .map(([tid, snaps]) => ({
      tenantId: tid,
      tenantName: tenantNameById.get(tid) ?? "(unbekannter Tenant)",
      snapshots: snaps,
    }))
    .sort((a, b) => a.tenantName.localeCompare(b.tenantName));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Unternehmerhandbuch — Cross-Tenant-Sicht
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Alle Tenant-Snapshots zum direkten Lesen. Generieren / Quality-Gate
          erfolgt durch den jeweiligen Tenant-Admin in deren Sicht.
        </p>
      </div>

      {tenantsWithSnapshots.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <BookOpen className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-lg font-semibold text-slate-900">
              Noch keine Snapshots vorhanden
            </p>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Sobald der erste Tenant ein Handbuch generiert, erscheint es hier.
            </p>
          </CardContent>
        </Card>
      )}

      {tenantsWithSnapshots.map((tenant) => (
        <Card key={tenant.tenantId}>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">
              {tenant.tenantName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tenant.snapshots.map((s) => {
              const isReady = s.status === "ready";
              const inner = (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:border-brand-primary hover:bg-brand-primary/[0.03]">
                  <div className="flex items-center gap-3">
                    {isReady ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Lesbar
                      </Badge>
                    ) : s.status === "generating" ? (
                      <Badge variant="secondary" className="gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Wird erzeugt
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Fehlgeschlagen
                      </Badge>
                    )}
                    <div className="text-sm">
                      <div className="font-medium text-slate-800">
                        {s.formattedCreatedAt}
                      </div>
                      <div className="text-xs text-slate-500">
                        {s.sectionCount !== null
                          ? `${s.sectionCount} Sektionen`
                          : null}
                        {s.sectionCount !== null && s.knowledgeUnitCount !== null
                          ? " · "
                          : ""}
                        {s.knowledgeUnitCount !== null
                          ? `${s.knowledgeUnitCount} KU`
                          : null}
                      </div>
                    </div>
                  </div>
                  {isReady && (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary-dark">
                      Im Reader oeffnen
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </div>
              );

              return isReady ? (
                <Link
                  key={s.id}
                  href={`/dashboard/handbook/${s.id}`}
                  data-testid="cross-tenant-reader-open"
                >
                  {inner}
                </Link>
              ) : (
                <div key={s.id}>{inner}</div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
