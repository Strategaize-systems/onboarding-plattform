import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { DebriefBlockClient } from "./DebriefBlockClient";
import type { SopContent } from "@/workers/sop/types";
import type { DiagnosisContent } from "@/workers/diagnosis/types";
import type { DialogueSummary, DialogueGap } from "@/types/dialogue-session";

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
    .select("id, tenant_id, template_id, status, capture_mode")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    notFound();
  }

  // Load dialogue session data if this is a dialogue capture
  let dialogueSummary: DialogueSummary | null = null;
  let dialogueGaps: DialogueGap[] = [];
  let dialogueTranscript: string | null = null;

  if ((session as Record<string, unknown>).capture_mode === "dialogue") {
    const { data: dialogueSession } = await supabase
      .from("dialogue_session")
      .select("summary, gaps, transcript, status")
      .eq("capture_session_id", sessionId)
      .eq("status", "processed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dialogueSession) {
      dialogueSummary = (dialogueSession.summary as DialogueSummary) ?? null;
      dialogueGaps = (dialogueSession.gaps as DialogueGap[]) ?? [];
      dialogueTranscript = dialogueSession.transcript;
    }
  }

  // Template laden fuer Block-Titel + Diagnosis-Schema (fuer Subtopic→Frage-Mapping)
  const { data: template } = await supabase
    .from("template")
    .select("blocks, diagnosis_schema")
    .eq("id", session.template_id)
    .single();

  const blocks = (template?.blocks ?? []) as Array<{
    key: string;
    title: Record<string, string>;
    questions?: Array<{
      id: string;
      frage_id: string;
      text: string;
    }>;
  }>;
  const block = blocks.find((b) => b.key === blockKey);

  // diagnosis_schema for subtopic→question_keys mapping
  const diagnosisSchema = template?.diagnosis_schema as {
    blocks?: Record<
      string,
      {
        subtopics: Array<{
          key: string;
          name: string;
          question_keys: string[];
        }>;
      }
    >;
  } | null;

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

  // Load raw answers from latest checkpoint content
  const latestCheckpointWithContent = (blockCheckpoints ?? []).find(
    (cp) => cp.checkpoint_type === "questionnaire_submit" || cp.checkpoint_type === "backspelling_recondense"
  );

  // Load answers from capture_session.answers for this block
  const { data: sessionAnswers } = await supabase
    .from("capture_session")
    .select("answers")
    .eq("id", sessionId)
    .single();

  const allSessionAnswers = (sessionAnswers?.answers ?? {}) as Record<
    string,
    string
  >;

  // Build question map from template block
  const blockQuestions = (block?.questions ?? []) as Array<{
    id: string;
    frage_id: string;
    text: string;
  }>;

  // Build answer data: match template questions with session answers
  const sourceAnswers = blockQuestions.map((q) => {
    const answerKey = `${blockKey}.${q.frage_id}`;
    return {
      questionId: q.frage_id,
      questionText: q.text,
      answer: allSessionAnswers[answerKey] ?? "",
    };
  });

  // Build subtopic→answers mapping from diagnosis_schema
  const subtopicDefs =
    diagnosisSchema?.blocks?.[blockKey]?.subtopics ?? [];

  const answersBySubtopic: Record<
    string,
    Array<{ questionId: string; questionText: string; answer: string }>
  > = {};
  const subtopicLabels: Record<string, string> = {};

  for (const st of subtopicDefs) {
    subtopicLabels[st.key] = st.name;
    answersBySubtopic[st.key] = sourceAnswers.filter((a) =>
      st.question_keys.includes(a.questionId)
    );
  }

  // Load evidence files for this session (optionally scoped to block)
  const { data: evidenceFiles } = await supabase
    .from("evidence_file")
    .select(
      "id, original_filename, mime_type, file_size_bytes, extraction_status, block_key"
    )
    .eq("capture_session_id", sessionId)
    .order("created_at", { ascending: false });

  // Filter: show evidence for this block OR unscoped evidence
  const blockEvidence = (evidenceFiles ?? []).filter(
    (ef) => !ef.block_key || ef.block_key === blockKey
  );

  // Load existing diagnosis for this block
  const { data: diagnosisData } = await supabase
    .from("block_diagnosis")
    .select("id, content, status, created_at, updated_at")
    .eq("capture_session_id", sessionId)
    .eq("block_key", blockKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const diagnosisRow = diagnosisData
    ? {
        id: diagnosisData.id as string,
        content: diagnosisData.content as DiagnosisContent,
        status: diagnosisData.status as "draft" | "reviewed" | "confirmed",
        created_at: diagnosisData.created_at as string,
        updated_at: diagnosisData.updated_at as string,
      }
    : null;

  // Load existing SOP for this block
  const { data: sopData } = await supabase
    .from("sop")
    .select("id, content, created_at, updated_at")
    .eq("capture_session_id", sessionId)
    .eq("block_key", blockKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sopRow = sopData
    ? {
        id: sopData.id as string,
        content: sopData.content as SopContent,
        created_at: sopData.created_at as string,
        updated_at: sopData.updated_at as string,
      }
    : null;

  // Get the latest checkpoint ID (needed for SOP generation trigger)
  const latestCheckpointId = (blockCheckpoints ?? [])[0]?.id ?? null;

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
        initialSop={sopRow}
        initialDiagnosis={diagnosisRow}
        checkpointId={latestCheckpointId}
        sourceAnswers={sourceAnswers}
        answersBySubtopic={answersBySubtopic}
        subtopicLabels={subtopicLabels}
        evidenceFiles={blockEvidence.map((ef) => ({
          id: ef.id,
          original_filename: ef.original_filename,
          mime_type: ef.mime_type,
          file_size_bytes: ef.file_size_bytes,
          extraction_status: ef.extraction_status,
        }))}
        dialogueSummary={dialogueSummary}
        dialogueGaps={dialogueGaps}
        dialogueTranscript={dialogueTranscript}
      />
    </div>
  );
}
