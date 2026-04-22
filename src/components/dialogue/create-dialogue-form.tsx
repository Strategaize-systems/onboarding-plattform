"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createDialogueSession } from "@/app/actions/dialogue-session-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Member {
  id: string;
  display_name: string | null;
  email: string;
  role: string;
}

interface MeetingGuideInfo {
  id: string;
  goal: string | null;
  topics: unknown[];
}

interface Props {
  sessionId: string;
  currentUserId: string;
  members: Member[];
  meetingGuide: MeetingGuideInfo | null;
}

export function CreateDialogueForm({
  sessionId,
  currentUserId,
  members,
  meetingGuide,
}: Props) {
  const t = useTranslations("dialogue");
  const router = useRouter();
  const [participantA, setParticipantA] = useState(currentUserId);
  const [participantB, setParticipantB] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!participantA || !participantB) {
      setError(t("selectBothParticipants"));
      return;
    }
    if (participantA === participantB) {
      setError(t("differentParticipants"));
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: createError } = await createDialogueSession({
      capture_session_id: sessionId,
      meeting_guide_id: meetingGuide?.id,
      participant_a_user_id: participantA,
      participant_b_user_id: participantB,
    });

    setLoading(false);

    if (createError || !data) {
      setError(createError ?? t("createError"));
      return;
    }

    router.push(`/admin/session/${sessionId}/dialogue/${data.id}`);
  };

  const getMemberLabel = (m: Member) =>
    m.display_name || m.email.split("@")[0];

  return (
    <Card className="p-6 max-w-lg space-y-6">
      {/* Participant A (Moderator) */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {t("participantA")} ({t("moderator")})
        </label>
        <Select value={participantA} onValueChange={setParticipantA}>
          <SelectTrigger>
            <SelectValue placeholder={t("selectParticipant")} />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {getMemberLabel(m)}
                {m.role === "strategaize_admin" && (
                  <span className="ml-2 text-xs text-slate-400">Admin</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Participant B */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {t("participantB")}
        </label>
        <Select value={participantB} onValueChange={setParticipantB}>
          <SelectTrigger>
            <SelectValue placeholder={t("selectParticipant")} />
          </SelectTrigger>
          <SelectContent>
            {members
              .filter((m) => m.id !== participantA)
              .map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {getMemberLabel(m)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Meeting Guide Info */}
      {meetingGuide && (
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary">{t("guideLinked")}</Badge>
          </div>
          {meetingGuide.goal && (
            <p className="text-slate-600">{meetingGuide.goal}</p>
          )}
          <p className="text-slate-400 text-xs mt-1">
            {(meetingGuide.topics as unknown[]).length} {t("topics")}
          </p>
        </div>
      )}

      {!meetingGuide && (
        <p className="text-sm text-amber-600">
          {t("noGuideWarning")}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <Button onClick={handleSubmit} disabled={loading} className="w-full">
        {loading ? t("creating") : t("createSession")}
      </Button>
    </Card>
  );
}
