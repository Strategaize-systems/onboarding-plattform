import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WalkthroughStatusPolling } from "@/components/capture-modes/walkthrough/WalkthroughStatusPolling";

/**
 * SLC-071 MT-7 — Walkthrough Status-Polling-Page.
 *
 * SSR-Initial holt den walkthrough_session-Status via RLS-bound user client;
 * der eingebettete Client-Component pollt anschliessend alle 5s. Eine fremde
 * (oder verborgene) Session liefert 404 — die `walkthrough_session_select`
 * Policy aus MIG-031/083 entscheidet, was sichtbar ist.
 */
export default async function WalkthroughStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: row, error } = await supabase
    .from("walkthrough_session")
    .select(
      "id, status, transcript_completed_at, reviewed_at, reviewer_note, rejection_reason, duration_sec, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 space-y-6">
      <div>
        <Link
          href="/employee"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          ← Zurück zu Aufgaben
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">
          Walkthrough-Aufnahme
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Hier siehst du den Bearbeitungsstand deiner Aufnahme.
        </p>
      </div>

      <WalkthroughStatusPolling
        walkthroughId={row.id}
        initial={{
          id: row.id,
          status: row.status,
          transcript_completed_at: row.transcript_completed_at,
          reviewed_at: row.reviewed_at,
          reviewer_note: row.reviewer_note,
          rejection_reason: row.rejection_reason,
          duration_sec: row.duration_sec,
        }}
      />
    </div>
  );
}
