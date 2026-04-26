"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { EmployeeSidebar } from "@/components/employee-sidebar";

interface Props {
  email?: string;
  children: React.ReactNode;
}

/**
 * SLC-037 — Employee-Shell (analog TenantAdminShell).
 *
 * Persistent linke Sidebar (`lg:relative` + 280px) plus scrollbarer Main-Bereich.
 * Mobile: Sidebar als Overlay mit Toggle-Button.
 *
 * Children sind die Page-Inhalte. Listen-Pages wrappen sich selbst in einen
 * max-w-Container; das Block-Detail rendert die fullscreen QuestionnaireWorkspace
 * direkt — beide funktionieren innerhalb der `flex-1`-Main-Spalte.
 */
export function EmployeeShell({ email, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-white p-2 shadow-md lg:hidden"
        aria-label={sidebarOpen ? "Sidebar schliessen" : "Sidebar oeffnen"}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[280px] transform transition-transform duration-300 lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <EmployeeSidebar email={email} />
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
