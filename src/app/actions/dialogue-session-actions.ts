"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJitsiJwt } from "@/lib/jitsi/jwt";
import type {
  DialogueSession,
  CreateDialogueSessionInput,
  DialogueSessionStatus,
} from "@/types/dialogue-session";

/**
 * Fetch a single dialogue session by ID.
 */
export async function fetchDialogueSession(
  dialogueSessionId: string
): Promise<{ data: DialogueSession | null; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Nicht authentifiziert" };

  const { data, error } = await supabase
    .from("dialogue_session")
    .select("*")
    .eq("id", dialogueSessionId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as DialogueSession | null, error: null };
}

/**
 * Fetch all dialogue sessions for a capture session.
 */
export async function fetchDialogueForSession(
  captureSessionId: string
): Promise<{ data: DialogueSession[]; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: [], error: "Nicht authentifiziert" };

  const { data, error } = await supabase
    .from("dialogue_session")
    .select("*")
    .eq("capture_session_id", captureSessionId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as DialogueSession[], error: null };
}

/**
 * Create a new dialogue session via RPC.
 * Generates a unique Jitsi room name server-side.
 */
export async function createDialogueSession(
  input: CreateDialogueSessionInput
): Promise<{ data: DialogueSession | null; error: string | null }> {
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

  if (
    !profile ||
    !["tenant_admin", "strategaize_admin"].includes(profile.role)
  ) {
    return {
      data: null,
      error: "Nur tenant_admin oder strategaize_admin darf Dialogue Sessions erstellen",
    };
  }

  // Use RPC to create the session (generates room name server-side)
  const { data: sessionId, error: rpcError } = await supabase.rpc(
    "rpc_create_dialogue_session",
    {
      p_tenant_id: profile.tenant_id,
      p_capture_session_id: input.capture_session_id,
      p_meeting_guide_id: input.meeting_guide_id ?? null,
      p_participant_a: input.participant_a_user_id,
      p_participant_b: input.participant_b_user_id,
      p_created_by: user.id,
    }
  );

  if (rpcError) return { data: null, error: rpcError.message };

  // Fetch the created session to return full data
  const { data, error } = await supabase
    .from("dialogue_session")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as DialogueSession, error: null };
}

/**
 * Update dialogue session status via RPC (validates transitions).
 */
export async function updateDialogueStatus(
  dialogueSessionId: string,
  newStatus: DialogueSessionStatus
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht authentifiziert" };

  const { error } = await supabase.rpc("rpc_update_dialogue_status", {
    p_dialogue_session_id: dialogueSessionId,
    p_new_status: newStatus,
    p_caller_id: user.id,
  });

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Update DSGVO consent for the current user.
 */
export async function updateDialogueConsent(
  dialogueSessionId: string,
  consent: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht authentifiziert" };

  const { error } = await supabase.rpc("rpc_update_dialogue_consent", {
    p_dialogue_session_id: dialogueSessionId,
    p_user_id: user.id,
    p_consent: consent,
  });

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Generate a Jitsi JWT for the current user to join a dialogue session.
 */
export async function generateDialogueJwt(
  dialogueSessionId: string
): Promise<{ jwt: string | null; domain: string | null; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { jwt: null, domain: null, error: "Nicht authentifiziert" };

  // Fetch the dialogue session
  const { data: session, error: sessionError } = await supabase
    .from("dialogue_session")
    .select("*")
    .eq("id", dialogueSessionId)
    .single();

  if (sessionError || !session) {
    return { jwt: null, domain: null, error: "Dialogue Session nicht gefunden" };
  }

  // Check user is a participant
  const isParticipantA = session.participant_a_user_id === user.id;
  const isParticipantB = session.participant_b_user_id === user.id;

  if (!isParticipantA && !isParticipantB) {
    // Check if strategaize_admin (can join any session)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "strategaize_admin") {
      return { jwt: null, domain: null, error: "Nur Teilnehmer koennen beitreten" };
    }
  }

  // Get user display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? user.email ?? "Teilnehmer";
  const email = profile?.email ?? user.email ?? "";

  // Participant A is moderator (initiator)
  const isModerator = isParticipantA;

  const jwt = generateJitsiJwt({
    roomName: session.jitsi_room_name,
    userId: user.id,
    displayName,
    email,
    isModerator,
  });

  const domain = process.env.NEXT_PUBLIC_JITSI_DOMAIN ?? "";

  return { jwt, domain, error: null };
}

/**
 * Save recording info after Jibri finalize (service_role only).
 * Called by the recording-ready webhook handler.
 */
export async function saveRecordingInfo(
  dialogueSessionId: string,
  storagePath: string,
  durationSeconds?: number
): Promise<{ error: string | null }> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("dialogue_session")
    .update({
      recording_storage_path: storagePath,
      recording_duration_s: durationSeconds ?? null,
    })
    .eq("id", dialogueSessionId);

  if (error) return { error: error.message };
  return { error: null };
}
