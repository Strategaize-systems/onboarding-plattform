// SLC-139 MT-2 (FEAT-058) — Event-Type-Union + Validation-Helpers.
// Shared zwischen Tracker-Lib (Client) und API-Endpoint (Server, MT-3).

export const DIAGNOSE_EVENT_TYPES = [
  "question_start",
  "question_answer",
  "question_skip",
  "helper_text_open",
  "session_paused",
  "session_resumed",
  "session_abandoned",
  "session_completed",
  "session_heartbeat",
] as const;

export type DiagnoseEventType = (typeof DIAGNOSE_EVENT_TYPES)[number];

export function isValidEventType(value: unknown): value is DiagnoseEventType {
  return typeof value === "string" && (DIAGNOSE_EVENT_TYPES as readonly string[]).includes(value);
}

export interface DiagnoseEventInput {
  type: DiagnoseEventType;
  questionKey?: string | null;
  payload?: Record<string, unknown>;
}

export interface DiagnoseEventEnvelope {
  capture_session_id: string;
  event_type: DiagnoseEventType;
  question_key: string | null;
  payload: Record<string, unknown>;
  is_test: boolean;
}

export interface DiagnoseSessionContext {
  captureSessionId: string;
  isTest: boolean;
}
