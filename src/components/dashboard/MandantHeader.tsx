// V7.5 SLC-146 — Minimaler User-Header fuer Partner-Mandanten (BL-122 / ISSUE-083).
//
// Bisherige Luecke: Mandanten unter Partner-Steuerberatern (tenant_kind='partner_client')
// haben keine Sidebar — die Welcome-Page + Diagnose-Funnel-Pages rendern ohne
// Layout-Wrapper. Damit war Logout fuer Mandanten nicht zugaenglich
// (ISO27001-/DSGVO-relevant fuer Pilot-Partner).
//
// Loesung: dieser Header rendert sticky-top mit Email-Anzeige + Logout-Button.
// Pattern 1:1 portiert aus src/components/dashboard-sidebar.tsx:197-209 (handleLogout
// + LogOut-Icon + logout() Server-Action aus src/app/login/actions.ts:47).
//
// NICHT rendern fuer strategaize_admin — dort uebernimmt AdminDemoBanner die Rolle
// (Zurueck-zum-Admin-Cockpit-Link statt Logout, da Demo-Mode-Verlassen != Auth-Ende).
//
// Touch-Target >=44px (V7.4 DEC-151 Konsistenz).

"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";

interface MandantHeaderProps {
  email: string;
  role: string;
}

export function MandantHeader({ email, role }: MandantHeaderProps) {
  const [pending, startTransition] = useTransition();

  // Admin-Sicht hat AdminDemoBanner mit Zurueck-Link, kein Logout hier.
  if (role === "strategaize_admin") return null;

  function handleLogout() {
    startTransition(async () => {
      await logout();
    });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-4 py-2 sm:px-6">
        <span
          className="hidden text-xs text-slate-500 sm:inline-block sm:max-w-[260px] sm:truncate"
          title={email}
        >
          {email}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          disabled={pending}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          aria-label="Abmelden"
          data-testid="mandant-header-logout"
        >
          <LogOut className="h-4 w-4" />
          {pending ? "Abmelden..." : "Abmelden"}
        </button>
      </div>
    </header>
  );
}
