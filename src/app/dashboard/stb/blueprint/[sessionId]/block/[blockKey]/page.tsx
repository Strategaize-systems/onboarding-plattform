import { redirect, notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCaptureSession } from "@/lib/db/capture-session-queries";
import { getTemplateById } from "@/lib/db/template-queries";
import { QuestionnaireWorkspace } from "@/app/capture/[sessionId]/block/[blockKey]/questionnaire-form";
import {
  BLUEPRINT_BASE_PATH,
  ADAPTIVE_AMPEL_META_KEY,
  deriveVertiefungCouplings,
  surfacedVertiefungFrageIds,
  filterAdaptiveBlocks,
  type Ampel,
} from "@/lib/stb-vertikale/blueprint";

// Port-Vorbild: src/app/dashboard/stb/modul/[modulKey]/[sessionId]/block/[blockKey]/page.tsx
// (SLC-173). Blueprint Block-Detail (SLC-172 MT-1). Reuse QuestionnaireWorkspace
// 1:1 via basePath (Save/Resume + Voice unveraendert). NEU: die uebergebenen
// Bloecke werden adaptiv gefiltert (R-172-2) — noch nicht freigeschaltete
// Vertiefungsfragen sind nicht sichtbar und ihr Block ist nicht aufrufbar.
export default async function StbBlueprintBlockPage({
  params,
}: {
  params: Promise<{ sessionId: string; blockKey: string }>;
}) {
  const { sessionId, blockKey } = await params;

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
  if (session.tenant_id !== profile.tenant_id) {
    notFound();
  }

  const template = await getTemplateById(supabase, session.template_id);
  if (!template) {
    notFound();
  }

  // Adaptive Ampeln lesen + Bloecke filtern (Kern voll, Vertiefung nur surfaced).
  const { data: metaRow } = await supabase
    .from("capture_session")
    .select("metadata")
    .eq("id", sessionId)
    .maybeSingle();
  const kernAmpel =
    (((metaRow?.metadata ?? {}) as Record<string, unknown>)[
      ADAPTIVE_AMPEL_META_KEY
    ] as Record<string, Ampel> | undefined) ?? {};
  const couplings = deriveVertiefungCouplings(template.blocks);
  const surfaced = surfacedVertiefungFrageIds(couplings, kernAmpel);
  const visibleBlocks = filterAdaptiveBlocks(template.blocks, surfaced);

  // Block muss nach dem adaptiven Filter noch existieren (eine nicht
  // freigeschaltete Vertiefung ist nicht direkt aufrufbar).
  const block = visibleBlocks.find((b) => b.key === blockKey);
  if (!block) {
    notFound();
  }

  const locale = await getLocale();

  const { data: blockCheckpoints } = await supabase
    .from("block_checkpoint")
    .select("id, checkpoint_type, content_hash, created_at")
    .eq("capture_session_id", sessionId)
    .eq("block_key", blockKey)
    .order("created_at", { ascending: false });

  return (
    <QuestionnaireWorkspace
      sessionId={sessionId}
      activeBlockKey={blockKey}
      templateName={template.name}
      blocks={visibleBlocks}
      ownerFields={template.owner_fields ?? []}
      savedAnswers={session.answers}
      locale={locale}
      existingCheckpoints={blockCheckpoints ?? []}
      basePath={BLUEPRINT_BASE_PATH}
    />
  );
}
