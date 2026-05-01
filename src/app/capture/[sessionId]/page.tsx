import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCaptureSession } from "@/lib/db/capture-session-queries";
import { getTemplateById } from "@/lib/db/template-queries";
import { BlockList } from "./block-list";
import type { BlockCheckpointInput } from "@/lib/capture/derive-block-status";
import { resolveCaptureMode } from "@/components/capture-modes/registry";
import { HelpTrigger } from "@/components/help/HelpTrigger";
import { loadHelpMarkdown } from "@/lib/help/load";

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

  // SLC-038 — Capture-Mode-Hook: wenn der Mode eine eigene Stub-Komponente
  // bringt (z.B. walkthrough_stub), uebergeben wir das Rendering komplett an
  // sie und ueberspringen Template/Block-Listen-Lookup. Klassische Modes
  // (questionnaire/evidence/dialogue/employee_questionnaire) haben
  // StubComponent=null und durchlaufen den Default-Pfad weiter unten.
  const { meta: modeMeta } = resolveCaptureMode(session.capture_mode);
  if (modeMeta.StubComponent) {
    const StubComponent = modeMeta.StubComponent;
    return <StubComponent />;
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

  // Count overall progress
  const totalBlocks = template.blocks.length;
  const submittedBlocks = new Set(
    (checkpoints ?? []).map((cp) => cp.block_key)
  ).size;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar — same style as questionnaire */}
      <aside className="hidden lg:block w-[280px] flex-shrink-0">
        <div
          className="flex h-full flex-col"
          style={{ background: "var(--gradient-sidebar)" }}
        >
          {/* Logo block */}
          <div className="mx-3 mt-3 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-5 text-center">
            <div className="mx-auto w-fit rounded-2xl bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/logo-full.png"
                alt="StrategAIze"
                className="h-12 w-auto"
              />
            </div>
          </div>
          {/* Template title */}
          <div className="mx-3 mt-2 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-4 text-center">
            <div className="text-sm font-bold text-white">{template.name}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Exit-Readiness Assessment
            </div>
          </div>
          <div className="h-3" />

          {/* Progress summary */}
          <div className="mx-3 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Fortschritt
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-success-dark to-brand-success transition-all duration-700"
                  style={{
                    width: `${totalBlocks > 0 ? Math.round((submittedBlocks / totalBlocks) * 100) : 0}%`,
                  }}
                />
              </div>
              <span className="text-xs font-bold text-white tabular-nums">
                {submittedBlocks}/{totalBlocks}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Blöcke eingereicht
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Back to dashboard */}
          <div className="border-t border-white/[0.06] px-4 py-4">
            <Link
              href="/dashboard"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary/20 to-brand-primary-dark/20 px-3 py-3 text-sm font-semibold text-slate-300 transition-all hover:from-brand-primary/30 hover:to-brand-primary-dark/30 hover:text-white"
            >
              ← Zurück zum Dashboard
            </Link>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-8 px-6">
          {/* Mobile back link (hidden on desktop where sidebar has it) */}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 lg:hidden"
          >
            ← Zurück zum Dashboard
          </Link>

          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{template.name}</h1>
              <p className="text-muted-foreground mt-1">
                Version {session.template_version} · {template.blocks.length} Blöcke
              </p>
            </div>
            <HelpTrigger
              pageKey="capture"
              markdown={loadHelpMarkdown("capture")}
            />
          </div>

          <BlockList
            blocks={template.blocks}
            checkpointsByBlock={Object.fromEntries(checkpointsByBlock)}
            kuBlockKeys={[...kuBlockKeys]}
            sessionId={sessionId}
          />
        </div>
      </div>
    </div>
  );
}
