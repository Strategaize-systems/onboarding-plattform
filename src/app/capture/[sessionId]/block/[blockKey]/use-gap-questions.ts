"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface GapQuestion {
  id: string;
  question_text: string;
  context: string | null;
  subtopic: string | null;
  priority: "required" | "nice_to_have";
  status: "pending" | "answered" | "skipped" | "recondensed";
  answer_text: string | null;
  answered_at: string | null;
  backspelling_round: number;
  created_at: string;
}

interface UseGapQuestionsResult {
  gaps: GapQuestion[];
  loading: boolean;
  pendingCount: number;
  refresh: () => void;
}

export function useGapQuestions(
  sessionId: string,
  blockKey: string
): UseGapQuestionsResult {
  const [gaps, setGaps] = useState<GapQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGaps = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Load checkpoints for this block to get checkpoint IDs
      const { data: checkpoints } = await supabase
        .from("block_checkpoint")
        .select("id")
        .eq("capture_session_id", sessionId)
        .eq("block_key", blockKey);

      if (!checkpoints || checkpoints.length === 0) {
        setGaps([]);
        return;
      }

      const checkpointIds = checkpoints.map((cp) => cp.id);

      const { data, error } = await supabase
        .from("gap_question")
        .select(
          "id, question_text, context, subtopic, priority, status, answer_text, answered_at, backspelling_round, created_at"
        )
        .in("block_checkpoint_id", checkpointIds)
        .order("priority", { ascending: true }) // required first
        .order("created_at", { ascending: true });

      if (error) {
        console.error("useGapQuestions: load failed:", error);
        setGaps([]);
        return;
      }

      setGaps((data as GapQuestion[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [sessionId, blockKey]);

  useEffect(() => {
    loadGaps();
  }, [loadGaps]);

  const pendingCount = gaps.filter((g) => g.status === "pending").length;

  return { gaps, loading, pendingCount, refresh: loadGaps };
}
