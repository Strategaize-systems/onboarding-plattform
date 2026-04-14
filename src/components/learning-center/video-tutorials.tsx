"use client";

import { useTranslations } from "next-intl";
import { Play } from "lucide-react";
import { TUTORIALS, type Tutorial } from "@/config/tutorials";

interface VideoTutorialsProps {
  onSelect: (tutorial: Tutorial) => void;
}

export function VideoTutorials({ onSelect }: VideoTutorialsProps) {
  const t = useTranslations();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {TUTORIALS.map((tutorial) => (
        <button
          key={tutorial.id}
          onClick={() => onSelect(tutorial)}
          className="group relative overflow-hidden rounded-xl border border-slate-200/60 bg-white text-left transition-all duration-200 hover:border-brand-primary/30 hover:shadow-md"
        >
          {/* Thumbnail */}
          <div className="relative aspect-video w-full bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tutorial.thumbnailPath}
              alt={t(tutorial.titleKey)}
              className="h-full w-full object-cover"
            />
            {/* Play overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/10">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-md transition-transform duration-200 group-hover:scale-110">
                <Play className="h-4 w-4 text-brand-primary ml-0.5" />
              </div>
            </div>
          </div>

          {/* Text */}
          <div className="p-3">
            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-brand-primary transition-colors">
              {t(tutorial.titleKey)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 line-clamp-2">
              {t(tutorial.descriptionKey)}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
