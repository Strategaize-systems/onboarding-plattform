import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCaptureSession } from "@/lib/db/capture-session-queries";
import { getTemplateById } from "@/lib/db/template-queries";
import { BlockList } from "@/app/capture/[sessionId]/block-list";
import type { BlockCheckpointInput } from "@/lib/capture/derive-block-status";
import { splitBlocksByStufe } from "@/lib/stb-vertikale/modul-capture";
import {
  BLUEPRINT_BASE_PATH,
  ADAPTIVE_AMPEL_META_KEY,
  deriveVertiefungCouplings,
  coupledKernFrageIds,
  surfacedVertiefungFrageIds,
  filterAdaptiveBlocks,
  type Ampel,
} from "@/lib/stb-vertikale/blueprint";
import { BlueprintRevealButton } from "./reveal-button";

// Port-Vorbild: src/app/dashboard/stb/modul/[modulKey]/[sessionId]/page.tsx
// (SLC-173). Blueprint-Capture-Overview (SLC-172 MT-1). Adaptive Vertiefung
// (Choice A / DEC-249): die Stufe-2-Vertiefungsfragen erscheinen erst, wenn die
// gekoppelte Kern-Antwort gelb/rot bewertet wurde (R-172-2: Reveal auf
// Block-Ebene, die geteilte QuestionnaireWorkspace bleibt unangetastet).
// Env-gated via dashboard/stb/layout.
export default async function StbBlueprintOverviewPage({
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

  // Adaptive Ampeln aus dem JSONB-Stash lesen (Writer: assessAnswerAmpel /
  // assessBlueprintKernAnswers). getCaptureSession liefert metadata nicht.
  const { data: metaRow } = await supabase
    .from("capture_session")
    .select("metadata")
    .eq("id", sessionId)
    .maybeSingle();
  const kernAmpel =
    (((metaRow?.metadata ?? {}) as Record<string, unknown>)[
      ADAPTIVE_AMPEL_META_KEY
    ] as Record<string, Ampel> | undefined) ?? {};

  const checkpointsByBlock = new Map<string, BlockCheckpointInput[]>();
  for (const cp of checkpoints ?? []) {
    if (!checkpointsByBlock.has(cp.block_key)) {
      checkpointsByBlock.set(cp.block_key, []);
    }
    checkpointsByBlock.get(cp.block_key)!.push({
      checkpoint_type:
        cp.checkpoint_type as BlockCheckpointInput["checkpoint_type"],
      created_at: cp.created_at,
    });
  }
  const kuBlockKeys = [...new Set((kuCounts ?? []).map((ku) => ku.block_key))];
  const checkpointsRecord = Object.fromEntries(checkpointsByBlock);

  // Adaptive Sichtbarkeit: Vertiefungsfragen nur, wenn ihre Kern-Frage gelb/rot
  // ist. Kern bleibt immer voll; leere (noch nicht freigeschaltete) Bloecke
  // fallen weg.
  const couplings = deriveVertiefungCouplings(template.blocks);
  const surfaced = surfacedVertiefungFrageIds(couplings, kernAmpel);
  const visibleBlocks = filterAdaptiveBlocks(template.blocks, surfaced);
  const { stufe1, stufe2 } = splitBlocksByStufe(visibleBlocks);

  // Reveal-Button ist sinnvoll, sobald eine gekoppelte Kern-Frage beantwortet
  // ist (sonst gibt es nichts zu bewerten).
  const coupledKern = new Set(coupledKernFrageIds(couplings));
  const answeredCoupledKern = template.blocks.some((b) =>
    b.questions.some(
      (q) =>
        coupledKern.has(q.frage_id) &&
        (session.answers[`${b.key}.${q.id}`] ?? "").trim().length > 0
    )
  );

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <Link
        href={BLUEPRINT_BASE_PATH}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        ← Blueprint-Übersicht
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">{template.name}</h1>
      <p className="text-muted-foreground mt-1">
        Version {session.template_version} · Standortbestimmung für die eigene
        Kanzlei
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
          Stufe 1 – Kern (der Gratis-Test)
        </h2>
        <BlockList
          blocks={stufe1}
          checkpointsByBlock={checkpointsRecord}
          kuBlockKeys={kuBlockKeys}
          sessionId={sessionId}
          basePath={BLUEPRINT_BASE_PATH}
        />
        {stufe1.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Keine Kern-Blöcke definiert.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
          Stufe 2 – Vertiefung (adaptiv)
        </h2>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-muted-foreground">
            Die Vertiefungsfragen gehören nicht zum automatischen Pfad. Die KI
            bohrt gezielt nur dort nach, wo eine Kern-Antwort gelb oder rot
            ergibt. Werten Sie Ihre Kern-Antworten aus, um relevante
            Vertiefungsfragen freizuschalten.
          </p>
          <div className="mt-4">
            <BlueprintRevealButton
              sessionId={sessionId}
              disabled={!answeredCoupledKern}
            />
          </div>
        </div>

        {stufe2.length > 0 ? (
          <div className="mt-4">
            <BlockList
              blocks={stufe2}
              checkpointsByBlock={checkpointsRecord}
              kuBlockKeys={kuBlockKeys}
              sessionId={sessionId}
              basePath={BLUEPRINT_BASE_PATH}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {surfaced.length === 0 && answeredCoupledKern
              ? "Aktuell sind keine Vertiefungsfragen nötig – Ihre Kern-Antworten zeigen keinen Handlungsbedarf."
              : "Noch keine Vertiefungsfragen freigeschaltet."}
          </p>
        )}
      </section>
    </div>
  );
}
