"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { logout } from "@/app/login/actions";
import { PlusCircle, LogOut, ArrowLeft } from "lucide-react";

interface DashboardSidebarProps {
  profile: {
    email: string;
    role: string;
  };
  activePage: "capture";
}

function getBackLink(pathname: string): string | null {
  if (pathname === "/dashboard") return null;

  if (pathname === "/capture/new") return "/dashboard";

  const captureFinal = pathname.match(/^(\/capture\/[^/]+\/block\/[^/]+)\/final$/);
  if (captureFinal) return captureFinal[1];

  const captureBlock = pathname.match(/^(\/capture\/[^/]+)\/block\/[^/]+$/);
  if (captureBlock) return captureBlock[1];

  if (/^\/capture\/[^/]+$/.test(pathname)) return "/dashboard";

  const dialogueNew = pathname.match(/^(\/admin\/session\/[^/]+\/dialogue)\/new$/);
  if (dialogueNew) return dialogueNew[1];

  const dialogueDetail = pathname.match(/^(\/admin\/session\/[^/]+\/dialogue)\/[^/]+$/);
  if (dialogueDetail) return dialogueDetail[1];

  if (/^\/admin\/session\/[^/]+\/dialogue$/.test(pathname)) return "/dashboard";

  if (/^\/admin\/session\/[^/]+\/meeting-guide$/.test(pathname)) return "/dashboard";

  return null;
}

export function DashboardSidebar({ profile, activePage }: DashboardSidebarProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const backHref = getBackLink(pathname);

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
      {/* Assessment title block */}
      <div className="mx-3 mt-2 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-4 text-center">
        <div className="text-sm font-bold text-white">{t("sidebar.title")}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{t("sidebar.subtitle")}</div>
      </div>
      <div className="h-3" />

      {/* Back link — context-dependent, hidden on dashboard */}
      {backHref && (
        <div className="px-3 pb-2">
          <Link
            href={backHref}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 transition-all hover:bg-white/[0.06] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("sidebar.back")}
          </Link>
        </div>
      )}

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1.5">
        {/* Neue Erhebung — primary action for V1 */}
        {profile.role === "tenant_admin" && (
          <Link
            href="/capture/new"
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all duration-200 ${
              activePage === "capture"
                ? "bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.35)]"
                : "text-slate-300 hover:bg-white/[0.06]"
            }`}
          >
            <PlusCircle className="h-4 w-4" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-snug">Neue Erhebung</div>
              <div className={`text-[10px] uppercase tracking-wider font-semibold mt-0.5 ${activePage === "capture" ? "text-white/50" : "text-slate-500"}`}>
                Session starten
              </div>
            </div>
          </Link>
        )}
        {/* Legacy Blueprint Runs — hidden for V1, will be replaced by capture session list */}
        {/* Legacy Mirror-Teilnehmer — hidden for V1, concept preserved for V2+ */}
      </div>

      {/* User + Profile + Logout */}
      <div className="border-t border-white/[0.06] px-4 py-4">
        <div className="mb-2 truncate px-2 text-xs text-slate-500" title={profile.email}>
          {profile.email}
        </div>
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
