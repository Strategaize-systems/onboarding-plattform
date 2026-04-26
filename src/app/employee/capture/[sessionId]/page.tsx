import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCaptureSession } from "@/lib/db/capture-session-queries";
import { getTemplateById } from "@/lib/db/template-queries";
import { BlockList } from "@/app/capture/[sessionId]/block-list";
import type { BlockCheckpointInput } from "@/lib/capture/derive-block-status";

/**
 * SLC-037 MT-2/MT-3 — Mitarbeiter-Block-Liste fuer eine spawned capture_session.
 *
 * Sichtperimeter (R16):
 *   - owner_user_id = auth.uid()  (defensive Application-Check zusaetzlich zu RLS)
 *   - capture_mode = 'employee_questionnaire'
 *
 * Renders die bestehende `BlockList`-Komponente mit basePath='/employee/capture'.
 * Layout: kommt aus /employee/layout.tsx (Mitarbeiter-Header + Tenant-Name).
 */
export default async function EmployeeCaptureSessionPage({
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

  if (!profile || profile.role !== "employee") {
    redirect("/login");
  }

  const session = await getCaptureSession(supabase, sessionId);

  if (!session) {
    notFound();
  }

  // Defense-in-depth: owner_user_id-Check zusaetzlich zu RLS.
  if (session.owner_user_id !== user.id) {
    notFound();
  }

  if (session.capture_mode !== "employee_questionnaire") {
    notFound();
  }

  const template = await getTemplateById(supabase, session.template_id);

  if (!template) {
    notFound();
  }

  const { data: checkpoints } = await supabase
    .from("block_checkpoint")
    .select("block_key, checkpoint_type, created_at")
    .eq("capture_session_id", sessionId)
    .order("created_at", { ascending: false });

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

  const totalBlocks = template.blocks.length;
  const submittedBlocks = new Set(
    (checkpoints ?? []).map((cp) => cp.block_key)
  ).size;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/employee"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            ← Zurück zu Aufgaben
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{template.name}</h1>
          <p className="text-muted-foreground mt-1">
            {totalBlocks} Block{totalBlocks === 1 ? "" : "ö"}cke ·{" "}
            {submittedBlocks}/{totalBlocks} eingereicht
          </p>
        </div>
      </div>

      <BlockList
        blocks={template.blocks}
        checkpointsByBlock={Object.fromEntries(checkpointsByBlock)}
        kuBlockKeys={[...kuBlockKeys]}
        sessionId={sessionId}
        basePath="/employee/capture"
      />
    </div>
  );
}
