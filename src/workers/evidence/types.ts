// Evidence Extraction + Mapping Types

/** A single mapping suggestion from LLM for a chunk */
export interface MappingSuggestion {
  question_id: string;
  block_key: string;
  question_text: string;
  confidence: number; // 0.0 - 1.0
  relevant_excerpt: string;
}

/** Evidence chunk ready for DB insertion */
export interface EvidenceChunkInsert {
  chunk_index: number;
  chunk_text: string;
  mapping_suggestion: MappingSuggestion[] | null;
  mapping_status: "pending" | "suggested";
}

/** Job payload for evidence_extraction */
export interface EvidenceJobPayload {
  evidence_file_id: string;
  session_id: string;
}

/** Template question for mapping prompt */
export interface TemplateQuestion {
  id: string;
  block_key: string;
  text: string;
}
