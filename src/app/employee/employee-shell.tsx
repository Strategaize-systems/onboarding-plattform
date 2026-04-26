"use client";

import { usePathname } from "next/navigation";
import { EmployeeSidebar } from "@/components/employee-sidebar";

interface Props {
  email?: string;
  children: React.ReactNode;
}

/**
 * SLC-037 — Employee-Shell (analog TenantAdminShell).
 *
 * Persistent linke Sidebar auf den Listen-Routen (`lg:relative` + 280px) plus
 * scrollbarer Main-Bereich. Auf Block-Detail-Routen wird die Shell komplett
 * uebersprungen — der QuestionnaireWorkspace rendert fullscreen mit eigener
 * Sidebar und eigener "Zurueck zur Uebersicht"-Navigation. Das vermeidet
 * Doppel-Sidebar-Optik und gibt dem Workspace den vollen Viewport.
 */
export function EmployeeShell({ email, children }: Props) {
  const pathname = usePathname();
  const isBlockDetail = /^\/employee\/capture\/[^/]+\/block\/[^/]+/.test(pathname);

  if (isBlockDetail) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar (always visible at lg+, never on this app variant) */}
      <aside className="hidden lg:block w-[280px] flex-shrink-0">
        <EmployeeSidebar email={email} />
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
