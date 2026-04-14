"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, Video } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VideoTutorials } from "@/components/learning-center/video-tutorials";
import { VideoPlayer } from "@/components/learning-center/video-player";
import { UserGuide } from "@/components/learning-center/user-guide";
import { type Tutorial } from "@/config/tutorials";

interface LearningCenterPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMirror?: boolean;
}

type Tab = "videos" | "guide";

export function LearningCenterPanel({ open, onOpenChange, isMirror = false }: LearningCenterPanelProps) {
  const t = useTranslations("learning");
  const [activeTab, setActiveTab] = useState<Tab>("videos");
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-200/60 flex-shrink-0">
          <SheetTitle className="text-lg font-bold text-slate-900">
            {t("title")}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("title")}
          </SheetDescription>
        </SheetHeader>

        {/* Tab Navigation — hidden for mirror respondents */}
        {!isMirror && (
          <div className="flex border-b border-slate-200/60 flex-shrink-0">
            <button
              onClick={() => {
                setActiveTab("videos");
                setSelectedTutorial(null);
              }}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                activeTab === "videos"
                  ? "text-brand-primary border-b-2 border-brand-primary bg-brand-primary/5"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Video className="h-4 w-4" />
              {t("tabVideos")}
            </button>
            <button
              onClick={() => setActiveTab("guide")}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                activeTab === "guide"
                  ? "text-brand-primary border-b-2 border-brand-primary bg-brand-primary/5"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              {t("tabGuide")}
            </button>
          </div>
        )}

        {/* Tab Content */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            {isMirror ? (
              /* Mirror-specific content: simplified guide */
              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">{t("mirror.howToAnswer")}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{t("mirror.howToAnswerText")}</p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">{t("mirror.aiAssistant")}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{t("mirror.aiAssistantText")}</p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">{t("mirror.confidentiality")}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{t("mirror.confidentialityText")}</p>
                </div>
              </div>
            ) : (
              <>
                {activeTab === "videos" && (
                  selectedTutorial ? (
                    <VideoPlayer
                      tutorial={selectedTutorial}
                      onBack={() => setSelectedTutorial(null)}
                    />
                  ) : (
                    <VideoTutorials onSelect={setSelectedTutorial} />
                  )
                )}
                {activeTab === "guide" && (
                  <UserGuide />
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
