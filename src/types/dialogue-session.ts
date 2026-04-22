export type DialogueSessionStatus =
  | "planned"
  | "in_progress"
  | "recording"
  | "completed"
  | "transcribing"
  | "processing"
  | "processed"
  | "failed";

export interface DialogueSession {
  id: string;
  tenant_id: string;
  capture_session_id: string;
  meeting_guide_id: string | null;
  jitsi_room_name: string;
  status: DialogueSessionStatus;
  participant_a_user_id: string;
  participant_b_user_id: string;
  recording_storage_path: string | null;
  recording_duration_s: number | null;
  transcript: string | null;
  transcript_model: string | null;
  summary: DialogueSummary | null;
  gaps: DialogueGap[] | null;
  extraction_model: string | null;
  extraction_cost_usd: number | null;
  consent_a: boolean;
  consent_b: boolean;
  started_at: string | null;
  ended_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DialogueSummary {
  topics: DialogueTopicSummary[];
  overall: string;
}

export interface DialogueTopicSummary {
  key: string;
  title: string;
  highlights: string[];
  decisions: string[];
  open_points: string[];
}

export interface DialogueGap {
  topic_key: string;
  topic_title: string;
  reason: string;
}

export interface CreateDialogueSessionInput {
  capture_session_id: string;
  meeting_guide_id?: string;
  participant_a_user_id: string;
  participant_b_user_id: string;
}

export interface UpdateDialogueStatusInput {
  dialogue_session_id: string;
  new_status: DialogueSessionStatus;
}
