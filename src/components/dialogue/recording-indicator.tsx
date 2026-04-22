"use client";

import { useTranslations } from "next-intl";

interface Props {
  isRecording: boolean;
}

export function RecordingIndicator({ isRecording }: Props) {
  const t = useTranslations("dialogue");

  if (!isRecording) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-full text-xs font-medium animate-pulse">
      <span className="h-2 w-2 rounded-full bg-white" />
      {t("recordingActive")}
    </div>
  );
}
