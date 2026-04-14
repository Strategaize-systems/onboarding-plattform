"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowLeft, Video } from "lucide-react";
import { type Tutorial, getTutorialVideoPath } from "@/config/tutorials";

interface VideoPlayerProps {
  tutorial: Tutorial;
  onBack: () => void;
}

export function VideoPlayer({ tutorial, onBack }: VideoPlayerProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [hasError, setHasError] = useState(false);

  const videoSrc = getTutorialVideoPath(tutorial.id, locale);

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-brand-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("learning.backToList")}
      </button>

      {/* Title */}
      <h3 className="mb-3 text-base font-semibold text-slate-900">
        {t(tutorial.titleKey)}
      </h3>

      {/* Player or fallback */}
      {hasError ? (
        <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
          <Video className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">
            {t("learning.videoNotReady")}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {t(tutorial.descriptionKey)}
          </p>
        </div>
      ) : (
        <video
          key={videoSrc}
          controls
          className="w-full rounded-xl bg-black"
          poster={tutorial.thumbnailPath}
          onError={() => setHasError(true)}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
