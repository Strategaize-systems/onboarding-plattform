"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Check, X, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MappingSuggestion {
  question_id: string;
  block_key: string;
  question_text: string;
  confidence: number;
  relevant_excerpt: string;
}

interface EvidenceChunk {
  id: string;
  chunk_text: string;
  mapping_suggestion: MappingSuggestion[] | null;
  mapping_status: string;
  confirmed_question_id: string | null;
}

interface MappingReviewProps {
  sessionId: string;
  blockKey: string;
  refreshKey?: number;
  onMappingConfirmed?: (questionId: string, excerpt: string) => void;
}

export function MappingReview({
  sessionId,
  blockKey,
  refreshKey = 0,
  onMappingConfirmed,
}: MappingReviewProps) {
  const [chunks, setChunks] = useState<EvidenceChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadChunks() {
      const supabase = createClient();

      // Get evidence files for this block
      const { data: files } = await supabase
        .from("evidence_file")
        .select("id")
        .eq("capture_session_id", sessionId)
        .eq("block_key", blockKey)
        .eq("extraction_status", "extracted");

      if (cancelled || !files || files.length === 0) {
        if (!cancelled) {
          setChunks([]);
          setLoading(false);
        }
        return;
      }

      const fileIds = files.map((f) => f.id);

      // Get chunks with suggested mappings
      const { data: chunkData } = await supabase
        .from("evidence_chunk")
        .select(
          "id, chunk_text, mapping_suggestion, mapping_status, confirmed_question_id"
        )
        .in("evidence_file_id", fileIds)
        .in("mapping_status", ["suggested", "confirmed"])
        .order("chunk_index", { ascending: true });

      if (!cancelled) {
        setChunks(chunkData ?? []);
        setLoading(false);
      }
    }

    loadChunks();
    return () => {
      cancelled = true;
    };
  }, [sessionId, blockKey, refreshKey]);

  const handleConfirm = async (
    chunkId: string,
    suggestion: MappingSuggestion
  ) => {
    const supabase = createClient();

    startTransition(async () => {
      const { error } = await supabase.rpc("rpc_confirm_evidence_mapping", {
        p_chunk_id: chunkId,
        p_question_id: suggestion.question_id,
        p_block_key: suggestion.block_key,
      });

      if (!error) {
        setChunks((prev) =>
          prev.map((c) =>
            c.id === chunkId
              ? {
                  ...c,
                  mapping_status: "confirmed",
                  confirmed_question_id: suggestion.question_id,
                }
              : c
          )
        );
        onMappingConfirmed?.(suggestion.question_id, suggestion.relevant_excerpt);
      }
    });
  };

  const handleReject = async (chunkId: string) => {
    const supabase = createClient();

    startTransition(async () => {
      const { error } = await supabase.rpc("rpc_reject_evidence_mapping", {
        p_chunk_id: chunkId,
      });

      if (!error) {
        setChunks((prev) => prev.filter((c) => c.id !== chunkId));
      }
    });
  };

  if (loading) {
    return null;
  }

  // Only show chunks with suggestions
  const suggestedChunks = chunks.filter(
    (c) => c.mapping_status === "suggested" && c.mapping_suggestion?.length
  );
  const confirmedChunks = chunks.filter(
    (c) => c.mapping_status === "confirmed"
  );

  if (suggestedChunks.length === 0 && confirmedChunks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Suggested Mappings */}
      {suggestedChunks.length > 0 && (
        <>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            KI-Zuordnungsvorschlaege ({suggestedChunks.length})
          </h4>
          {suggestedChunks.map((chunk) => (
            <div key={chunk.id} className="space-y-2">
              {(chunk.mapping_suggestion ?? []).map((suggestion, si) => (
                <div
                  key={`${chunk.id}-${si}`}
                  className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-600">
                        {suggestion.question_text}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-3">
                        &bdquo;{suggestion.relevant_excerpt}&ldquo;
                      </p>
                    </div>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        suggestion.confidence >= 0.8
                          ? "bg-green-100 text-green-700"
                          : suggestion.confidence >= 0.5
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {Math.round(suggestion.confidence * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                      disabled={isPending}
                      onClick={() => handleConfirm(chunk.id, suggestion)}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Bestaetigen
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                      disabled={isPending}
                      onClick={() => handleReject(chunk.id)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Ablehnen
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* Confirmed count */}
      {confirmedChunks.length > 0 && (
        <p className="text-xs text-green-600 font-medium">
          {confirmedChunks.length} Zuordnung{confirmedChunks.length !== 1 ? "en" : ""} bestaetigt
        </p>
      )}
    </div>
  );
}
