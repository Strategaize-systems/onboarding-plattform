import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DialogueMeetingView } from "./dialogue-meeting-view";
import type { MeetingGuideTopic } from "@/types/meeting-guide";

interface Props {
  params: Promise<{ sessionId: string; dialogueId: string }>;
}

export default async function DialogueMeetingPage({ params }: Props) {
  const { sessionId, dialogueId } = await params;
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load dialogue session
  const { data: dialogue } = await supabase
    .from("dialogue_session")
    .select("*")
    .eq("id", dialogueId)
    .single();

  if (!dialogue) redirect(`/admin/session/${sessionId}`);

  // Load meeting guide if linked
  let guideTopics: MeetingGuideTopic[] = [];
  let guideGoal: string | null = null;

  if (dialogue.meeting_guide_id) {
    const { data: guide } = await supabase
      .from("meeting_guide")
      .select("goal, topics")
      .eq("id", dialogue.meeting_guide_id)
      .single();

    if (guide) {
      guideTopics = (guide.topics as MeetingGuideTopic[]) || [];
      guideGoal = guide.goal;
    }
  }

  // Get user profile for display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  const displayName = profile?.email?.split("@")[0] ?? user.email ?? "Teilnehmer";

  // Determine if current user is participant A (moderator)
  const isParticipantA = dialogue.participant_a_user_id === user.id;
  const isParticipantB = dialogue.participant_b_user_id === user.id;
  const hasConsent = isParticipantA
    ? dialogue.consent_a
    : isParticipantB
    ? dialogue.consent_b
    : true; // strategaize_admin bypass

  return (
    <DialogueMeetingView
      dialogueId={dialogueId}
      sessionId={sessionId}
      status={dialogue.status}
      hasConsent={hasConsent}
      displayName={displayName}
      guideTopics={guideTopics}
      guideGoal={guideGoal}
    />
  );
}
