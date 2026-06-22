import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCaptureSession } from "@/lib/db/capture-session-queries";
import { getTemplateById } from "@/lib/db/template-queries";
import { BlockList } from "@/app/capture/[sessionId]/block-list";
import type { BlockCheckpointInput } from "@/lib/capture/derive-block-status";
import {
  isValidModulKey,
  modulBasePath,
  splitBlocksByStufe,
} from "@/lib/stb-vertikale/modul-capture";
import { EnqueueModulOutputButton } from "./enqueue-button";

// StB-Modul-Capture-Overview (SLC-173). Reuse BlockList via basePath; zwei
// Stufen-Gruppen (AC-173-3). Env-gated via dashboard/stb/layout.
export default async function StbModulOverviewPage({
  params,
}: {
  params: Promise<{ modulKey: string; sessionId: string }>;
}) {
  const { modulKey, sessionId } = await params;
  if (!isValidModulKey(modulKey)) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) {
    redirect("/login");
  }

  const session = await getCaptureSession(supabase, sessionId);
  if (!session) {
    notFound();
  }
  // RLS schuetzt cross-tenant; expliziter Check = Defense-in-Depth.
  if (session.tenant_id !== profile.tenant_id) {
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
  const kuBlockKeys = [...new Set((kuCounts ?? []).map((ku) => ku.block_key))];

  const { stufe1, stufe2 } = splitBlocksByStufe(template.blocks);
  const basePath = modulBasePath(modulKey);
  const checkpointsRecord = Object.fromEntries(checkpointsByBlock);

  // Stufe-1 ist vollstaendig, wenn alle Pflicht-Bloecke einen Checkpoint haben.
  const stufe1Complete =
    stufe1.length > 0 &&
    stufe1.every((b) => (checkpointsByBlock.get(b.key)?.length ?? 0) > 0);

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <Link
        href={`${basePath}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        ← Modul-Übersicht
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">{template.name}</h1>
      <p className="text-muted-foreground mt-1">
        Version {session.template_version} · {template.blocks.length} Blöcke
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
          Stufe 1 – Kern (Pflicht)
        </h2>
        <BlockList
          blocks={stufe1}
          checkpointsByBlock={checkpointsRecord}
          kuBlockKeys={kuBlockKeys}
          sessionId={sessionId}
          basePath={basePath}
        />
      </section>

      {stufe2.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
            Stufe 2 – Vertiefung (optional)
          </h2>
          <BlockList
            blocks={stufe2}
            checkpointsByBlock={checkpointsRecord}
            kuBlockKeys={kuBlockKeys}
            sessionId={sessionId}
            basePath={basePath}
          />
        </section>
      )}

      <section className="mt-10 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-900">Modul-Output erzeugen</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Erstellt aus den Antworten den KI-Modul-Output (Entscheidung · Standard ·
          Implementierungsschritt + KI-Hebel). Stufe 1 sollte dafür vollständig sein.
        </p>
        <div className="mt-4">
          <EnqueueModulOutputButton
            sessionId={sessionId}
            modulKey={modulKey}
            stufe1Complete={stufe1Complete}
          />
        </div>
      </section>
    </div>
  );
}
