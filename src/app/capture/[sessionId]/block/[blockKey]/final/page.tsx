import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

interface FinalViewPageProps {
  params: Promise<{ sessionId: string; blockKey: string }>;
}

export default async function FinalViewPage({ params }: FinalViewPageProps) {
  const { sessionId, blockKey } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Verify tenant_admin or strategaize_admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    (profile.role !== "tenant_admin" && profile.role !== "strategaize_admin")
  ) {
    notFound();
  }

  // Load latest meeting_final checkpoint for this block
  // RLS ensures tenant_admin only sees own tenant's data
  const { data: checkpoint, error: cpError } = await supabase
    .from("block_checkpoint")
    .select("id, content, content_hash, created_at")
    .eq("capture_session_id", sessionId)
    .eq("block_key", blockKey)
    .eq("checkpoint_type", "meeting_final")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (cpError || !checkpoint) {
    notFound();
  }

  const content = checkpoint.content as {
    kus: Array<{
      id: string;
      title: string;
      body: string;
      unit_type: string;
      source: string;
      confidence: string;
      status: string;
    }>;
    finalized_at: string;
  };

  const kus = content?.kus ?? [];

  const confidenceLabel: Record<string, string> = {
    high: "Hoch",
    medium: "Mittel",
    low: "Niedrig",
  };

  const statusLabel: Record<string, string> = {
    proposed: "Vorgeschlagen",
    accepted: "Akzeptiert",
    edited: "Bearbeitet",
    rejected: "Abgelehnt",
  };

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <div className="mb-6">
        <div className="mb-2 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
          Finalisiert
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          Block {blockKey} — Finaler Stand
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Erstellt am{" "}
          {new Date(
            content?.finalized_at ?? checkpoint.created_at
          ).toLocaleString("de-DE")}
        </p>
      </div>

      <div className="space-y-3">
        {kus.map((ku) => (
          <div
            key={ku.id}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-medium text-slate-900">{ku.title}</h3>
              <div className="ml-3 flex flex-shrink-0 items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {confidenceLabel[ku.confidence] ?? ku.confidence}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {statusLabel[ku.status] ?? ku.status}
                </span>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {ku.body}
            </p>
          </div>
        ))}
      </div>

      {kus.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Keine Knowledge Units im Snapshot.
        </div>
      )}
    </div>
  );
}
