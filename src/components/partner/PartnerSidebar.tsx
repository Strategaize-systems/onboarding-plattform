"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import {
  Building2,
  IdCard,
  LayoutDashboard,
  LogOut,
  Palette,
  Users,
} from "lucide-react";

interface PartnerSidebarProps {
  email?: string;
  partnerDisplayName?: string;
}

/**
 * V6 SLC-102 MT-4 — PartnerSidebar (analog EmployeeSidebar / AdminSidebar).
 *
 * V2-Sidebar-Pattern (feedback_v2_sidebar_pflicht): persistent dark-gradient
 * Sidebar mit Logo-Block, Partner-Title-Block, Navigation, User-Email +
 * Abmelden. Wird in /partner/layout.tsx fuer alle partner_admin-Routen
 * gerendert.
 *
 * Stub-Status:
 *   - "Meine Mandanten" → SLC-103 (Mandanten-Einladung). Verlinkt aktuell
 *     dorthin, Page selbst ist Stub mit Coming-Soon-Hinweis.
 *   - "Branding" → SLC-104. Verlinkt analog.
 */
export function PartnerSidebar({
  email,
  partnerDisplayName,
}: PartnerSidebarProps) {
  const pathname = usePathname();

  async function handleLogout() {
    await logout();
  }

  const isDashboardActive = pathname === "/partner/dashboard";
  const isMandantenActive = pathname.startsWith("/partner/dashboard/mandanten");
  const isBrandingActive = pathname.startsWith("/partner/dashboard/branding");
  const isStammdatenActive = pathname.startsWith(
    "/partner/dashboard/stammdaten",
  );

  return (
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--gradient-sidebar)" }}
    >
      {/* Logo block */}
      <div className="mx-3 mt-3 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-5 text-center">
        <div className="mx-auto w-fit rounded-2xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-full.png"
            alt="StrategAIze"
            className="h-12 w-auto"
          />
        </div>
      </div>

      {/* Partner-Title block */}
      <div className="mx-3 mt-2 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-4 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <Building2 className="h-3 w-3 text-slate-400" />
          <span className="text-sm font-bold text-white">Partner-Bereich</span>
        </div>
        <div
          className="text-[11px] text-slate-500 mt-0.5 truncate"
          title={partnerDisplayName ?? undefined}
        >
          {partnerDisplayName ?? "Steuerberater-Kanzlei"}
        </div>
      </div>
      <div className="h-3" />

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3">
        <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Bereich
        </div>
        <Link
          href="/partner/dashboard"
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
            isDashboardActive
              ? "bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.35)]"
              : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
          }`}
        >
          <LayoutDashboard
            className={`h-4 w-4 ${isDashboardActive ? "text-white" : ""}`}
          />
          Mein Dashboard
        </Link>
        <Link
          href="/partner/dashboard/mandanten"
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
            isMandantenActive
              ? "bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.35)]"
              : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
          }`}
          title="Verfuegbar nach SLC-103"
        >
          <Users
            className={`h-4 w-4 ${isMandantenActive ? "text-white" : ""}`}
          />
          Meine Mandanten
        </Link>
        <Link
          href="/partner/dashboard/branding"
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
            isBrandingActive
              ? "bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.35)]"
              : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
          }`}
          title="Verfuegbar nach SLC-104"
        >
          <Palette
            className={`h-4 w-4 ${isBrandingActive ? "text-white" : ""}`}
          />
          Branding
        </Link>
        <Link
          href="/partner/dashboard/stammdaten"
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
            isStammdatenActive
              ? "bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.35)]"
              : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
          }`}
        >
          <IdCard
            className={`h-4 w-4 ${isStammdatenActive ? "text-white" : ""}`}
          />
          Stammdaten
        </Link>
      </nav>

      {/* User info + Logout */}
      <div className="border-t border-white/[0.06] px-3 py-4">
        {email && (
          <div
            className="mb-2 truncate px-3 text-xs text-slate-500"
            title={email}
          >
            {email}
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition-all duration-200 hover:bg-white/[0.06] hover:text-slate-300"
        >
          <LogOut className="h-4 w-4" />
          Abmelden
        </button>
      </div>
    </div>
  );
}
