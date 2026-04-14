"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { logout } from "@/app/login/actions";
import { Play, ShieldCheck, User, LogOut } from "lucide-react";

interface DashboardSidebarProps {
  profile: {
    email: string;
    role: string;
  };
  activePage: "runs" | "nominations";
}

export function DashboardSidebar({ profile, activePage }: DashboardSidebarProps) {
  const t = useTranslations();
  const isMirror = profile.role === "mirror_respondent";

  async function handleLogout() {
    await logout();
  }

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--gradient-sidebar)" }}>
      {/* Logo block */}
      <div className="mx-3 mt-3 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-5 text-center">
        <div className="mx-auto w-fit rounded-2xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-full.png" alt="StrategAIze" className="h-12 w-auto" />
        </div>
      </div>
      {/* Blueprint Assessment block */}
      <div className="mx-3 mt-2 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-4 text-center">
        <div className="text-sm font-bold text-white">Blueprint Assessment</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{t("sidebar.subtitle")}</div>
      </div>
      <div className="h-3" />

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1.5">
        <Link
          href="/dashboard"
          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all duration-200 ${
            activePage === "runs"
              ? "bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.35)]"
              : "text-slate-300 hover:bg-white/[0.06]"
          }`}
        >
          <Play className="h-4 w-4" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold leading-snug">{t("sidebar.runs")}</div>
            <div className={`text-[10px] uppercase tracking-wider font-semibold mt-0.5 ${activePage === "runs" ? "text-white/50" : "text-slate-500"}`}>
              {t("sidebar.runsDescription")}
            </div>
          </div>
        </Link>
        {profile.role === "tenant_admin" && (
          <Link
            href="/mirror/nominations"
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all duration-200 ${
              activePage === "nominations"
                ? "bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.35)]"
                : "text-slate-300 hover:bg-white/[0.06]"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-snug">{t("sidebar.mirrorNominations")}</div>
              <div className={`text-[10px] uppercase tracking-wider font-semibold mt-0.5 ${activePage === "nominations" ? "text-white/50" : "text-slate-500"}`}>
                {t("sidebar.mirrorNominationsDescription")}
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* User + Profile + Logout */}
      <div className="border-t border-white/[0.06] px-4 py-4">
        <div className="mb-2 truncate px-2 text-xs text-slate-500" title={profile.email}>
          {profile.email}
        </div>
        {isMirror ? (
          <Link
            href="/mirror/profile"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary/10 to-brand-primary-dark/10 px-3 py-2.5 text-sm font-medium text-slate-400 transition-all hover:from-brand-primary/20 hover:to-brand-primary-dark/20 hover:text-white mb-2"
          >
            <User className="h-4 w-4" />
            {t("mirror.profileTitle")}
          </Link>
        ) : (
          <Link
            href="/profile"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary/10 to-brand-primary-dark/10 px-3 py-2.5 text-sm font-medium text-slate-400 transition-all hover:from-brand-primary/20 hover:to-brand-primary-dark/20 hover:text-white mb-2"
          >
            <User className="h-4 w-4" />
            {t("profile.editProfile")}
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary/20 to-brand-primary-dark/20 px-3 py-3 text-sm font-semibold text-slate-300 transition-all hover:from-brand-primary/30 hover:to-brand-primary-dark/30 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          {t("common.logout")}
        </button>
      </div>
    </div>
  );
}
