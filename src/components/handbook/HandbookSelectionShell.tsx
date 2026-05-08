"use client";

// SLC-044 Iter-1 Bug 2 — Snapshot-Auswahl-Page mit DashboardSidebar wrappen.
//
// Analog dashboard-client.tsx Layout-Pattern: 2-Pane mit Sidebar links und
// Mobile-Toggle. Die Reader-Detail-Page (/dashboard/handbook/[snapshotId])
// behaelt bewusst ihre eigene 2-Pane-Reader-Shell (kein DashboardSidebar) —
// dort dient die linke Spalte den Section-/Snapshot-Listen.

import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

import { DashboardSidebar } from "@/components/dashboard-sidebar";

interface HandbookSelectionShellProps {
  profile: { email: string; role: string; tenant_id?: string | null };
  children: ReactNode;
}

export function HandbookSelectionShell({
  profile,
  children,
}: HandbookSelectionShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-white p-2 shadow-md lg:hidden"
        aria-label={sidebarOpen ? "Sidebar schliessen" : "Sidebar oeffnen"}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[280px] transform transition-transform duration-300 lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <DashboardSidebar profile={profile} activePage="capture" />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-8 py-8 pl-14 lg:pl-8">
          {children}
        </div>
      </div>
    </div>
  );
}
