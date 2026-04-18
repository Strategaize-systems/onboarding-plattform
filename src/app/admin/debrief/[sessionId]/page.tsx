import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";

interface DebriefSessionPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function DebriefSessionPage({
  params,
}: DebriefSessionPageProps) {
  const { sessionId } = await params;
  const supabase = await createClient();

  // Session laden (admin_full RLS -> cross-tenant)
  const { data: session, error: sessionError } = await supabase
    .from("capture_session")
    .select("id, tenant_id, template_id, status, started_at")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    notFound();
  }

  // Tenant-Name
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", session.tenant_id)
    .single();

  // Template mit Block-Definitionen
  const { data: template } = await supabase
    .from("template")
    .select("name, blocks")
    .eq("id", session.template_id)
    .single();

  const blocks = (template?.blocks ?? []) as Array<{
    key: string;
    title: Record<string, string>;
    order: number;
  }>;

  // KU-Counts pro Block
  const { data: kuCounts } = await supabase
    .from("knowledge_unit")
    .select("block_key")
    .eq("capture_session_id", sessionId);

  const kuCountByBlock = (kuCounts ?? []).reduce(
    (acc, row) => {
      acc[row.block_key] = (acc[row.block_key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const sortedBlocks = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Debrief: {tenant?.name ?? "Unbekannter Tenant"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Template: {template?.name ?? "—"} · Session{" "}
          {sessionId.slice(0, 8)}… · Status: {session.status}
        </p>
      </div>

      <div className="grid gap-3">
        {sortedBlocks.map((block) => {
          const blockTitle =
            block.title?.de ?? block.title?.en ?? block.key;
          const kuCount = kuCountByBlock[block.key] ?? 0;

          return (
            <Link
              key={block.key}
              href={`/admin/debrief/${sessionId}/${block.key}`}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-slate-50"
            >
              <div>
                <h3 className="text-sm font-medium text-slate-900">
                  {blockTitle}
                </h3>
                <p className="text-xs text-slate-500">Block {block.key}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    kuCount > 0
                      ? "bg-green-100 text-green-800"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {kuCount} KUs
                </span>
                <svg
                  className="h-4 w-4 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
