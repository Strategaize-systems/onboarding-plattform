import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { startWalkthroughSession } from "@/app/actions/walkthrough";

/**
 * SLC-075 MT-2 — Walkthrough-Listen-Seite + Self-Spawn-Button.
 *
 * Listet eigene walkthrough_session-Eintraege (RLS-bound auf
 * recorded_by_user_id = auth.uid() per MIG-031/083 walkthrough_session_select)
 * und bietet "Neuen Walkthrough starten" als Server-Action-Form. Beim Klick
 * wird startWalkthroughSession() ausgefuehrt (DEC-080 Self-Spawn-Pattern):
 * capture_session + walkthrough_session werden via service_role atomar erzeugt
 * und der User wird auf /employee/walkthroughs/[id]/record umgeleitet.
 *
 * Auth + employee-Rollen-Guard kommt aus /employee/layout.tsx.
 */

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  recording: { label: "Aufnahme laeuft", bg: "bg-amber-100", color: "text-amber-800" },
  uploading: { label: "Upload", bg: "bg-amber-100", color: "text-amber-800" },
  uploaded: { label: "Hochgeladen", bg: "bg-blue-100", color: "text-blue-800" },
  transcribing: { label: "Transkription", bg: "bg-blue-100", color: "text-blue-800" },
  pending_review: {
    label: "Wartet auf Review",
    bg: "bg-indigo-100",
    color: "text-indigo-800",
  },
  approved: { label: "Freigegeben", bg: "bg-emerald-100", color: "text-emerald-800" },
  rejected: { label: "Abgelehnt", bg: "bg-red-100", color: "text-red-800" },
  failed: { label: "Fehler", bg: "bg-red-100", color: "text-red-800" },
};

async function startWalkthroughAction() {
  "use server";
  const result = await startWalkthroughSession();
  redirect(`/employee/walkthroughs/${result.walkthroughSessionId}/record`);
}

export default async function WalkthroughListPage() {
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("walkthrough_session")
    .select("id, status, duration_sec, recorded_at")
    .order("recorded_at", { ascending: false });

  const rows = sessions ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/employee"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            ← Zurück zu Aufgaben
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Walkthroughs</h1>
          <p className="mt-1 text-sm text-slate-600">
            Nimm deinen Bildschirm und Mikrofon auf, um einen Arbeitsablauf zu
            dokumentieren. Maximale Aufnahmedauer: 30 Minuten.
          </p>
        </div>
        <form action={startWalkthroughAction}>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Neuen Walkthrough starten
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Noch keine Walkthroughs</CardTitle>
            <CardDescription>
              Klicke oben auf &bdquo;Neuen Walkthrough starten&ldquo;, um deine
              erste Aufnahme zu erstellen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              Du wirst nach Berechtigung fuer Bildschirm und Mikrofon gefragt.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Deine Walkthroughs ({rows.length})
          </h2>
          {rows.map((s) => {
            const cfg = STATUS_LABEL[s.status] ?? {
              label: s.status,
              bg: "bg-slate-100",
              color: "text-slate-700",
            };
            const isRecording = s.status === "recording";
            const href = isRecording
              ? `/employee/walkthroughs/${s.id}/record`
              : `/employee/walkthroughs/${s.id}`;
            const recordedAt = new Date(s.recorded_at).toLocaleString("de-DE", {
              dateStyle: "medium",
              timeStyle: "short",
            });
            const durationLabel =
              typeof s.duration_sec === "number" && s.duration_sec > 0
                ? `${Math.floor(s.duration_sec / 60)}:${String(
                    s.duration_sec % 60
                  ).padStart(2, "0")} min`
                : "—";
            return (
              <Link key={s.id} href={href} className="block">
                <Card className="hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-4">
                      <CardTitle className="text-base truncate">
                        Walkthrough vom {recordedAt}
                      </CardTitle>
                      <span
                        className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color} flex-shrink-0`}
                      >
                        {cfg.label}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Dauer: {durationLabel}
                    </p>
                    <span className="text-sm font-medium text-primary">
                      {isRecording ? "Aufnahme fortsetzen" : "Status ansehen"} →
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
