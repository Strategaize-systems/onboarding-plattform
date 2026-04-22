"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConsentScreen } from "@/components/dialogue/consent-screen";
import { JitsiMeeting } from "@/components/dialogue/jitsi-meeting";
import { MeetingGuideSidebar } from "@/components/dialogue/meeting-guide-sidebar";
import { RecordingIndicator } from "@/components/dialogue/recording-indicator";
import {
  generateDialogueJwt,
  updateDialogueStatus,
} from "@/app/actions/dialogue-session-actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MeetingGuideTopic } from "@/types/meeting-guide";
import type { DialogueSessionStatus } from "@/types/dialogue-session";

interface Props {
  dialogueId: string;
  sessionId: string;
  status: string;
  hasConsent: boolean;
  displayName: string;
  guideTopics: MeetingGuideTopic[];
  guideGoal: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  recording: "bg-red-100 text-red-700",
  completed: "bg-green-100 text-green-700",
  transcribing: "bg-amber-100 text-amber-700",
  processing: "bg-purple-100 text-purple-700",
  processed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

export function DialogueMeetingView({
  dialogueId,
  sessionId,
  status: initialStatus,
  hasConsent: initialConsent,
  displayName,
  guideTopics,
  guideGoal,
}: Props) {
  const t = useTranslations("dialogue");
  const router = useRouter();
  const [consentGiven, setConsentGiven] = useState(initialConsent);
  const [jwtData, setJwtData] = useState<{ jwt: string; domain: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConsentGiven = useCallback(async () => {
    setConsentGiven(true);
    setLoading(true);
    setError(null);

    // Generate JWT and join meeting
    const { jwt, domain, error: jwtError } = await generateDialogueJwt(dialogueId);

    if (jwtError || !jwt || !domain) {
      setError(jwtError ?? t("jwtError"));
      setLoading(false);
      return;
    }

    setJwtData({ jwt, domain });

    // Update status to in_progress
    if (status === "planned") {
      await updateDialogueStatus(dialogueId, "in_progress");
      setStatus("in_progress");
    }

    setLoading(false);
  }, [dialogueId, status, t]);

  const handleMeetingEnd = useCallback(async () => {
    // Update status to completed
    if (status === "in_progress" || status === "recording") {
      await updateDialogueStatus(dialogueId, "completed");
      setStatus("completed");
    }

    // Redirect to session overview after short delay
    setTimeout(() => {
      router.push(`/admin/session/${sessionId}/dialogue/${dialogueId}`);
      router.refresh();
    }, 1500);
  }, [dialogueId, sessionId, status, router]);

  const handleRecordingStatusChange = useCallback((active: boolean) => {
    setIsRecording(active);
    if (active && status === "in_progress") {
      updateDialogueStatus(dialogueId, "recording");
      setStatus("recording");
    }
  }, [dialogueId, status]);

  // Post-meeting states: show status instead of meeting
  if (["completed", "transcribing", "processing", "processed", "failed"].includes(status)) {
    return (
      <Card className="p-8 text-center space-y-4">
        <Badge className={STATUS_COLORS[status] ?? ""}>
          {t(`status.${status}`)}
        </Badge>
        <h2 className="text-lg font-semibold text-slate-900">
          {status === "completed" ? t("meetingEnded") : t("pipelineStatus")}
        </h2>
        <p className="text-sm text-slate-500">
          {status === "completed" && t("processingWillStart")}
          {status === "transcribing" && t("transcribing")}
          {status === "processing" && t("extracting")}
          {status === "processed" && t("processingDone")}
          {status === "failed" && t("processingFailed")}
        </p>
      </Card>
    );
  }

  // Consent not given: show consent screen
  if (!consentGiven) {
    return <ConsentScreen dialogueSessionId={dialogueId} onConsentGiven={handleConsentGiven} />;
  }

  // Loading JWT
  if (loading || !jwtData) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600 mx-auto" />
          <p className="text-sm text-slate-500">{t("joiningMeeting")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center space-y-4">
        <p className="text-red-600">{error}</p>
      </Card>
    );
  }

  // Active meeting
  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header bar with status + recording indicator */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50">
        <div className="flex items-center gap-3">
          <Badge className={STATUS_COLORS[status] ?? ""}>
            {t(`status.${status}`)}
          </Badge>
          <span className="text-sm text-slate-500">
            {displayName}
          </span>
        </div>
        <RecordingIndicator isRecording={isRecording} />
      </div>

      {/* Jitsi + Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <JitsiMeeting
          domain={jwtData.domain}
          roomName={dialogueId}
          jwt={jwtData.jwt}
          displayName={displayName}
          onMeetingEnd={handleMeetingEnd}
          onRecordingStatusChange={handleRecordingStatusChange}
        >
          {guideTopics.length > 0 && (
            <MeetingGuideSidebar topics={guideTopics} goal={guideGoal} />
          )}
        </JitsiMeeting>
      </div>
    </div>
  );
}
