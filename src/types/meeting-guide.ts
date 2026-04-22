/**
 * Meeting Guide types — V3 Dialogue-Mode (SLC-026)
 * Maps to meeting_guide table + topics JSONB structure.
 */

export interface MeetingGuideTopic {
  key: string;
  title: string;
  description: string;
  questions: string[];
  block_key: string | null;
  order: number;
}

export interface MeetingGuide {
  id: string;
  tenant_id: string;
  capture_session_id: string;
  goal: string | null;
  context_notes: string | null;
  topics: MeetingGuideTopic[];
  ai_suggestions_used: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMeetingGuideInput {
  capture_session_id: string;
  goal?: string;
  context_notes?: string;
  topics?: MeetingGuideTopic[];
}

export interface UpdateMeetingGuideInput {
  goal?: string;
  context_notes?: string;
  topics?: MeetingGuideTopic[];
  ai_suggestions_used?: boolean;
}
