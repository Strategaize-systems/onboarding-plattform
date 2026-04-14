"use client";

import { useTranslations } from "next-intl";
import { MessageCircle, ClipboardList, MessageSquareHeart, Lock } from "lucide-react";

export type WorkspaceTab = "offen" | "questionnaire" | "feedback";

interface WorkspaceTabsProps {
  activeTab: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  disabledTabs?: WorkspaceTab[];
}

const TAB_CONFIG: { id: WorkspaceTab; icon: typeof MessageCircle; labelKey: string }[] = [
  { id: "offen", icon: MessageCircle, labelKey: "workspace.tabs.offen" },
  { id: "questionnaire", icon: ClipboardList, labelKey: "workspace.tabs.questionnaire" },
  { id: "feedback", icon: MessageSquareHeart, labelKey: "workspace.tabs.feedback" },
];

export function WorkspaceTabs({ activeTab, onChange, disabledTabs = [] }: WorkspaceTabsProps) {
  const t = useTranslations();

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-6 py-3 bg-white border-b border-slate-200/60">
      {TAB_CONFIG.map(({ id, icon: Icon, labelKey }) => {
        const isActive = activeTab === id;
        const disabled = disabledTabs.includes(id);
        return (
          <button
            key={id}
            onClick={() => {
              if (disabled) return;
              onChange(id);
            }}
            disabled={disabled}
            className={`
              relative flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold
              transition-all duration-200
              ${isActive
                ? "bg-gradient-to-r from-brand-primary-dark to-brand-primary text-white shadow-[0_4px_12px_-2px_rgba(68,84,184,0.35)]"
                : disabled
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }
            `}
          >
            <Icon className={`h-4 w-4 ${isActive ? "text-white" : disabled ? "text-slate-300" : "text-slate-500"}`} />
            <span>{t(labelKey)}</span>
            {disabled && (
              <Lock className="h-3 w-3 ml-0.5 text-slate-300" />
            )}
          </button>
        );
      })}
    </div>
  );
}
