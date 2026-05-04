"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, FileText, Video } from "lucide-react";
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
import { ThisPageTab } from "@/components/learning-center/this-page-tab";
import { type Tutorial } from "@/config/tutorials";
import type { HelpPageKey } from "@/lib/help/load";

type Tab = "videos" | "guide" | "this-page";

interface LearningCenterPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMirror?: boolean;
  /**
   * Page-Key fuer den "Diese Seite"-Tab. null = keine bekannte Seite, Tab zeigt
   * Fallback. Per usePathname() vom Parent abgeleitet (pageKeyFromPathname).
   */
  currentPageKey?: HelpPageKey | null;
  /**
   * Default-Tab beim Oeffnen. Wenn nicht gesetzt: "this-page" wenn currentPageKey
   * vorhanden, sonst "videos".
   */
  initialTab?: Tab;
}

export function LearningCenterPanel({
  open,
  onOpenChange,
  isMirror = false,
  currentPageKey = null,
  initialTab,
}: LearningCenterPanelProps) {
  const t = useTranslations("learning");
  const defaultTab: Tab =
    initialTab ?? (currentPageKey ? "this-page" : "videos");
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);

  // Help-Markdown-Cache fuer "Diese Seite"-Tab.
  const [helpMarkdown, setHelpMarkdown] = useState<string | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpError, setHelpError] = useState<string | null>(null);

  // Reset Tab beim Oeffnen, damit Default-Tab pro pageKey greift.
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
    // open is the trigger; defaultTab depends on currentPageKey + initialTab
    // and is intentionally re-evaluated when LC opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentPageKey, initialTab]);

  // Fetch Help-Markdown wenn this-page-Tab aktiv und pageKey bekannt.
  useEffect(() => {
    if (!open || activeTab !== "this-page" || !currentPageKey) {
      return;
    }
    let cancelled = false;
    setHelpLoading(true);
    setHelpError(null);
    fetch(`/api/help/${currentPageKey}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.text();
      })
      .then((md) => {
        if (!cancelled) {
          setHelpMarkdown(md);
          setHelpLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setHelpError(String(err));
          setHelpMarkdown(null);
          setHelpLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeTab, currentPageKey]);

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
                setActiveTab("this-page");
              }}
              className={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition-all duration-200 ${
                activeTab === "this-page"
                  ? "text-brand-primary border-b-2 border-brand-primary bg-brand-primary/5"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <FileText className="h-4 w-4" />
              {t("tabThisPage")}
            </button>
            <button
              onClick={() => {
                setActiveTab("videos");
                setSelectedTutorial(null);
              }}
              className={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition-all duration-200 ${
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
              className={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition-all duration-200 ${
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
                {activeTab === "this-page" && (
                  <ThisPageTab
                    pageKey={currentPageKey}
                    markdown={helpMarkdown}
                    loading={helpLoading}
                    error={helpError}
                  />
                )}
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
