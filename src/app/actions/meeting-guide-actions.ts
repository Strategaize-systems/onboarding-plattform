"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  MeetingGuide,
  CreateMeetingGuideInput,
  UpdateMeetingGuideInput,
} from "@/types/meeting-guide";

/**
 * Fetch meeting guide for a capture session.
 * Returns null if none exists yet.
 */
export async function fetchMeetingGuide(
  captureSessionId: string
): Promise<{ data: MeetingGuide | null; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Nicht authentifiziert" };

  const { data, error } = await supabase
    .from("meeting_guide")
    .select("*")
    .eq("capture_session_id", captureSessionId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as MeetingGuide | null, error: null };
}

/**
 * Create a new meeting guide for a capture session.
 * Fails if one already exists (UNIQUE constraint).
 */
export async function createMeetingGuide(
  input: CreateMeetingGuideInput
): Promise<{ data: MeetingGuide | null; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Nicht authentifiziert" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["tenant_admin", "strategaize_admin"].includes(profile.role)) {
    return { data: null, error: "Nur tenant_admin oder strategaize_admin darf Meeting Guides erstellen" };
  }

  const { data, error } = await supabase
    .from("meeting_guide")
    .insert({
      tenant_id: profile.tenant_id,
      capture_session_id: input.capture_session_id,
      goal: input.goal ?? null,
      context_notes: input.context_notes ?? null,
      topics: input.topics ?? [],
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { data: null, error: "Meeting Guide existiert bereits fuer diese Session" };
    }
    return { data: null, error: error.message };
  }

  return { data: data as MeetingGuide, error: null };
}

/**
 * Update an existing meeting guide.
 */
export async function updateMeetingGuide(
  meetingGuideId: string,
  input: UpdateMeetingGuideInput
): Promise<{ data: MeetingGuide | null; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Nicht authentifiziert" };

  const updates: Record<string, unknown> = {};
  if (input.goal !== undefined) updates.goal = input.goal;
  if (input.context_notes !== undefined) updates.context_notes = input.context_notes;
  if (input.topics !== undefined) updates.topics = input.topics;
  if (input.ai_suggestions_used !== undefined) updates.ai_suggestions_used = input.ai_suggestions_used;

  if (Object.keys(updates).length === 0) {
    return { data: null, error: "Keine Aenderungen angegeben" };
  }

  const { data, error } = await supabase
    .from("meeting_guide")
    .update(updates)
    .eq("id", meetingGuideId)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as MeetingGuide, error: null };
}
