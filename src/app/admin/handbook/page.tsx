import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    !["tenant_admin", "strategaize_admin"].includes(profile.role) ||
    !profile.tenant_id
  ) {
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
