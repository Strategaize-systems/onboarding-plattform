"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KnowledgeUnitList } from "./KnowledgeUnitList";
import { MeetingModeBar } from "./MeetingModeBar";

interface KnowledgeUnit {
  id: string;
  unit_type: string;
  source: string;
  title: string;
  body: string;
  confidence: string;
  evidence_refs: unknown[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface ValidationEntry {
  id: string;
  knowledge_unit_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  note: string | null;
  created_at: string;
}

interface DebriefBlockClientProps {
  sessionId: string;
  blockKey: string;
  knowledgeUnits: KnowledgeUnit[];
  validationEntries: ValidationEntry[];
  hasKnowledgeUnits: boolean;
  isAlreadyFinalized: boolean;
}

export function DebriefBlockClient({
  sessionId,
  blockKey,
  knowledgeUnits,
  validationEntries,
  hasKnowledgeUnits,
  isAlreadyFinalized: initialFinalized,
}: DebriefBlockClientProps) {
  const [isFinalized, setIsFinalized] = useState(initialFinalized);
  const router = useRouter();

  function handleSnapshotCreated(checkpointId: string) {
    setIsFinalized(true);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <MeetingModeBar
        sessionId={sessionId}
        blockKey={blockKey}
        hasKnowledgeUnits={hasKnowledgeUnits}
        isAlreadyFinalized={isFinalized}
        onSnapshotCreated={handleSnapshotCreated}
      />

      <KnowledgeUnitList
        sessionId={sessionId}
        blockKey={blockKey}
        knowledgeUnits={knowledgeUnits}
        validationEntries={validationEntries}
      />
    </div>
  );
}
