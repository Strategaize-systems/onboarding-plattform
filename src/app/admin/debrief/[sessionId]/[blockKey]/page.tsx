import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { KnowledgeUnitList } from "./KnowledgeUnitList";
import { DebriefBlockClient } from "./DebriefBlockClient";

interface DebriefBlockPageProps {
  params: Promise<{ sessionId: string; blockKey: string }>;
}

export default async function DebriefBlockPage({
  params,
}: DebriefBlockPageProps) {
  const { sessionId, blockKey } = await params;
  const supabase = await createClient();

  // Session laden (strategaize_admin hat admin_full RLS -> cross-tenant)
  const { data: session, error: sessionError } = await supabase
    .from("capture_session")
    .select("id, tenant_id, template_id, status")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    notFound();
  }

  // Template laden fuer Block-Titel
  const { data: template } = await supabase
    .from("template")
    .select("blocks")
    .eq("id", session.template_id)
    .single();

  const blocks = (template?.blocks ?? []) as Array<{
    key: string;
    title: Record<string, string>;
  }>;
  const block = blocks.find((b) => b.key === blockKey);

  if (!block) {
    notFound();
  }

  // Knowledge Units fuer diesen Block laden
  const { data: knowledgeUnits, error: kuError } = await supabase
    .from("knowledge_unit")
    .select(
      "id, unit_type, source, title, body, confidence, evidence_refs, status, created_at, updated_at"
    )
    .eq("capture_session_id", sessionId)
    .eq("block_key", blockKey)
    .order("created_at", { ascending: true });

  if (kuError) {
    throw new Error(`Fehler beim Laden der Knowledge Units: ${kuError.message}`);
  }

  // Validation-Layer-Eintraege laden (Audit-Trail)
  const kuIds = (knowledgeUnits ?? []).map((ku) => ku.id);
  let validationEntries: Array<{
    id: string;
    knowledge_unit_id: string;
    action: string;
    previous_status: string | null;
    new_status: string | null;
    note: string | null;
    created_at: string;
  }> = [];

  if (kuIds.length > 0) {
    const { data: vlData } = await supabase
      .from("validation_layer")
      .select(
        "id, knowledge_unit_id, action, previous_status, new_status, note, created_at"
      )
      .in("knowledge_unit_id", kuIds)
      .order("created_at", { ascending: true });

    validationEntries = vlData ?? [];
  }

  // Check if block is already finalized (has meeting_final checkpoint)
  // Also load quality_report for backspelling status
  const { data: blockCheckpoints } = await supabase
    .from("block_checkpoint")
    .select("id, checkpoint_type, quality_report")
    .eq("capture_session_id", sessionId)
    .eq("block_key", blockKey)
    .order("created_at", { ascending: false });

  const isAlreadyFinalized = (blockCheckpoints ?? []).some(
    (cp) => cp.checkpoint_type === "meeting_final"
  );

  // Extract quality report from latest checkpoint that has one
  const latestQualityReport = (blockCheckpoints ?? []).find(
    (cp) => cp.quality_report != null
  )?.quality_report as Record<string, unknown> | null;

  // Load gap questions for backspelling status
  const checkpointIds = (blockCheckpoints ?? []).map((cp) => cp.id);
  let gapQuestionStats = { pending: 0, answered: 0, skipped: 0, maxRound: 0 };

  if (checkpointIds.length > 0) {
    const { data: gapData } = await supabase
      .from("gap_question")
      .select("status, backspelling_round")
      .in("block_checkpoint_id", checkpointIds);

    if (gapData && gapData.length > 0) {
      for (const g of gapData) {
        if (g.status === "pending") gapQuestionStats.pending++;
        else if (g.status === "answered" || g.status === "recondensed") gapQuestionStats.answered++;
        else if (g.status === "skipped") gapQuestionStats.skipped++;
        if (g.backspelling_round > gapQuestionStats.maxRound) {
          gapQuestionStats.maxRound = g.backspelling_round;
        }
      }
    }
  }

  const blockTitle = block.title?.de ?? block.title?.en ?? blockKey;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Debrief: {blockTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Session {sessionId.slice(0, 8)}… · Block {blockKey} ·{" "}
          {knowledgeUnits?.length ?? 0} Knowledge Units
        </p>
      </div>

      <DebriefBlockClient
        sessionId={sessionId}
        blockKey={blockKey}
        knowledgeUnits={knowledgeUnits ?? []}
        validationEntries={validationEntries}
        hasKnowledgeUnits={(knowledgeUnits?.length ?? 0) > 0}
        isAlreadyFinalized={isAlreadyFinalized}
        qualityReport={latestQualityReport}
        gapQuestionStats={gapQuestionStats}
      />
    </div>
  );
}
