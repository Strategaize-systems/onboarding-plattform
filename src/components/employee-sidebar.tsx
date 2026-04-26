"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import { ClipboardList, LogOut, ArrowLeft, UserCircle2 } from "lucide-react";

interface EmployeeSidebarProps {
  email?: string;
}

/**
 * SLC-037 — Mitarbeiter-Sidebar (analog AdminSidebar / DashboardSidebar).
 *
 * Persistent dark-gradient Sidebar mit:
 *  - Logo-Block (StrategAIze)
 *  - "Mitarbeiter"-Title
 *  - Kontextueller Back-Link (in Capture-Detail-Routes)
 *  - Navigation: Aufgaben → /employee
 *  - User-Email + Abmelden
 *
 * Wird in /employee/layout.tsx auf allen Mitarbeiter-Routes gerendert.
 * Nur fuer role='employee' sichtbar — Layout-Guard pruft das.
 */
function getBackLink(pathname: string): string | null {
  if (pathname === "/employee") return null;

  // Block-Detail -> Block-Liste der Session
  const blockDetail = pathname.match(
    /^(\/employee\/capture\/[^/]+)\/block\/[^/]+$/
  );
  if (blockDetail) return blockDetail[1];

  // Block-Liste -> /employee
  if (/^\/employee\/capture\/[^/]+$/.test(pathname)) return "/employee";

  return null;
}

export function EmployeeSidebar({ email }: EmployeeSidebarProps) {
  const pathname = usePathname();
  const backHref = getBackLink(pathname);
  const isAufgabenActive = pathname === "/employee" || pathname.startsWith("/employee/capture");

  async function handleLogout() {
    await logout();
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--gradient-sidebar)" }}
    >
      {/* Logo block */}
      <div className="mx-3 mt-3 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-5 text-center">
        <div className="mx-auto w-fit rounded-2xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-full.png" alt="StrategAIze" className="h-12 w-auto" />
        </div>
      </div>

      {/* Mitarbeiter-Title block */}
      <div className="mx-3 mt-2 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-4 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <UserCircle2 className="h-3 w-3 text-slate-400" />
          <span className="text-sm font-bold text-white">Mitarbeiter</span>
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">Wissens-Erhebung</div>
      </div>
      <div className="h-3" />

      {/* Back link — context-dependent */}
      {backHref && (
        <div className="px-3 pb-2">
          <Link
            href={backHref}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 transition-all hover:bg-white/[0.06] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Zurück
          </Link>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3">
        <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Bereich
        </div>
        <Link
          href="/employee"
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
            isAufgabenActive
              ? "bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.35)]"
              : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
          }`}
        >
          <ClipboardList className={`h-4 w-4 ${isAufgabenActive ? "text-white" : ""}`} />
          Aufgaben
        </Link>
      </nav>

      {/* User info + Logout */}
      <div className="border-t border-white/[0.06] px-3 py-4">
        {email && (
          <div className="mb-2 truncate px-3 text-xs text-slate-500" title={email}>
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
