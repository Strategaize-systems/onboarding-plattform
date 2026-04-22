import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Mic, Plus, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { DialogueSessionStatus } from "@/types/dialogue-session";

interface DialogueListPageProps {
  params: Promise<{ sessionId: string }>;
}

const STATUS_CONFIG: Record<
  DialogueSessionStatus,
  { label: string; icon: typeof Clock; className: string }
> = {
  planned: { label: "Geplant", icon: Clock, className: "bg-slate-100 text-slate-600" },
  in_progress: { label: "Aktiv", icon: Loader2, className: "bg-blue-100 text-blue-700" },
  recording: { label: "Aufnahme", icon: Mic, className: "bg-red-100 text-red-700" },
  completed: { label: "Beendet", icon: CheckCircle2, className: "bg-green-100 text-green-700" },
  transcribing: { label: "Transkription", icon: Loader2, className: "bg-amber-100 text-amber-700" },
  processing: { label: "KI-Verarbeitung", icon: Loader2, className: "bg-purple-100 text-purple-700" },
  processed: { label: "Fertig", icon: CheckCircle2, className: "bg-green-100 text-green-700" },
  failed: { label: "Fehlgeschlagen", icon: AlertCircle, className: "bg-red-100 text-red-700" },
};

export default async function DialogueListPage({ params }: DialogueListPageProps) {
  const { sessionId } = await params;
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load capture session
  const { data: captureSession } = await supabase
    .from("capture_session")
    .select("id, template_id")
    .eq("id", sessionId)
    .single();

  if (!captureSession) notFound();

  // Load template name
  const { data: template } = await supabase
    .from("template")
    .select("name")
    .eq("id", captureSession.template_id)
    .single();

  // Load all dialogue sessions for this capture session
  const { data: dialogueSessions } = await supabase
    .from("dialogue_session")
    .select("id, status, jitsi_room_name, started_at, ended_at, created_at, recording_duration_s")
    .eq("capture_session_id", sessionId)
    .order("created_at", { ascending: false });

  const sessions = dialogueSessions ?? [];

  return (
    <div className="container mx-auto max-w-3xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Dialogue-Sessions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {template?.name ?? "Unbekanntes Template"} &middot; Session{" "}
            {sessionId.slice(0, 8)}&hellip;
          </p>
        </div>
        <Link
          href={`/admin/session/${sessionId}/dialogue/new`}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          Neues Gespraech
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Mic className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-lg font-semibold text-slate-700">
            Noch keine Dialogue-Sessions
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Erstellen Sie ein Gespraech mit Meeting-Guide, Aufzeichnung und
            KI-Analyse.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((ds) => {
            const status = ds.status as DialogueSessionStatus;
            const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.planned;
            const StatusIcon = cfg.icon;
            const isProcessed = status === "processed";

            return (
              <Link
                key={ds.id}
                href={
                  isProcessed
                    ? `/admin/debrief/${sessionId}`
                    : `/admin/session/${sessionId}/dialogue/${ds.id}`
                }
              >
                <div className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                        <Mic className="h-4 w-4 text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          Gespraech {ds.id.slice(0, 8)}&hellip;
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(ds.created_at).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {ds.recording_duration_s != null && (
                            <> &middot; {Math.round(ds.recording_duration_s / 60)} min</>
                          )}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.className}`}
                    >
                      <StatusIcon className="h-3.5 w-3.5" />
                      {cfg.label}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <Link
          href={`/admin/session/${sessionId}/meeting-guide`}
          className="text-sm text-brand-primary hover:text-brand-primary-dark"
        >
          Meeting-Guide bearbeiten &rarr;
        </Link>
      </div>
    </div>
  );
}
