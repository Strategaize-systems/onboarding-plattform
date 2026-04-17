"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Save a single answer into capture_session.answers JSONB.
 * Key format: "${blockKey}.${questionId}"
 *
 * Uses jsonb_set for atomic merge — no overwrite of other keys.
 * RLS on capture_session ensures tenant isolation.
 */
export async function saveAnswer(
  sessionId: string,
  blockKey: string,
  questionId: string,
  value: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Nicht authentifiziert" };
  }

  // Verify ownership via profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return { error: "Profil nicht gefunden" };
  }

  // Load current session to verify tenant match + get current answers
  const { data: session, error: sessionError } = await supabase
    .from("capture_session")
    .select("id, tenant_id, answers")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return { error: "Session nicht gefunden" };
  }

  if (session.tenant_id !== profile.tenant_id) {
    return { error: "Kein Zugriff" };
  }

  // Merge the new answer into existing JSONB
  const answerKey = `${blockKey}.${questionId}`;
  const currentAnswers = (session.answers as Record<string, string>) ?? {};
  const updatedAnswers = { ...currentAnswers, [answerKey]: value };

  const { error: updateError } = await supabase
    .from("capture_session")
    .update({ answers: updatedAnswers })
    .eq("id", sessionId);

  if (updateError) {
    return { error: `Speicherfehler: ${updateError.message}` };
  }

  // Update session status to in_progress if still open
  if (!currentAnswers || Object.keys(currentAnswers).length === 0) {
    await supabase
      .from("capture_session")
      .update({ status: "in_progress" })
      .eq("id", sessionId)
      .eq("status", "open");
  }

  return {};
}
