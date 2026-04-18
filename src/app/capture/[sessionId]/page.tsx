import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCaptureSession } from "@/lib/db/capture-session-queries";
import { getTemplateById } from "@/lib/db/template-queries";
import { BlockList } from "./block-list";
import type { BlockCheckpointInput } from "@/lib/capture/derive-block-status";

export default async function CaptureSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  const session = await getCaptureSession(supabase, sessionId);

  if (!session) {
    notFound();
  }

  // RLS handles cross-tenant isolation, but explicit check for defense-in-depth
  if (session.tenant_id !== profile.tenant_id) {
    notFound();
  }

  const template = await getTemplateById(supabase, session.template_id);

  if (!template) {
    notFound();
  }

  // Load block checkpoints for status derivation
  const { data: checkpoints } = await supabase
    .from("block_checkpoint")
    .select("block_key, checkpoint_type, created_at")
    .eq("capture_session_id", sessionId)
    .order("created_at", { ascending: false });

  // Load knowledge unit counts per block for reviewed status
  const { data: kuCounts } = await supabase
    .from("knowledge_unit")
    .select("block_key")
    .eq("capture_session_id", sessionId);

  const checkpointsByBlock = new Map<string, BlockCheckpointInput[]>();
  for (const cp of checkpoints ?? []) {
    if (!checkpointsByBlock.has(cp.block_key)) {
      checkpointsByBlock.set(cp.block_key, []);
    }
    checkpointsByBlock.get(cp.block_key)!.push({
      checkpoint_type: cp.checkpoint_type as BlockCheckpointInput["checkpoint_type"],
      created_at: cp.created_at,
    });
  }

  const kuBlockKeys = new Set((kuCounts ?? []).map((ku) => ku.block_key));

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          ← Zurück zum Dashboard
        </Link>
        <h1 className="text-2xl font-bold">{template.name}</h1>
        <p className="text-muted-foreground mt-1">
          Version {session.template_version} · {template.blocks.length} Blöcke
        </p>
      </div>

      <BlockList
        blocks={template.blocks}
        checkpointsByBlock={Object.fromEntries(checkpointsByBlock)}
        kuBlockKeys={[...kuBlockKeys]}
        sessionId={sessionId}
      />
    </div>
  );
}
