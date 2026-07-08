// V10.4 SLC-190 (FEAT-107) MT-2 — Gefilterte Sidebar fuer strategaize_berater.
//
// Teilmenge der AdminSidebar (src/components/admin-sidebar.tsx): NUR "Mein Tag"
// plus eine read-only Liste der zugewiesenen Mandanten. KEINE Partner-Verwaltung,
// Funnel-Analytics, Text-Overrides, Templates, Tenants-Cockpit (DEC-270). Der
// Berater arbeitet ausschliesslich im gescopten "Mein Tag"-Workspace; die anderen
// /admin-Unterseiten re-gaten serverseitig auf strategaize_admin und redirecten ihn.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import { Sparkles, LogOut, Menu, X, Shield, Building2 } from "lucide-react";
import { useState } from "react";

export interface BeraterAssignedTenant {
  id: string;
  name: string;
}

const NAV_ITEMS = [
  { href: "/admin/mein-tag", label: "Mein Tag", icon: Sparkles },
];

export function BeraterSidebar({
  email,
  assignedTenants,
}: {
  email?: string;
  assignedTenants: BeraterAssignedTenant[];
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await logout();
  }

  const sidebarContent = (
    <div className="flex h-full flex-col" style={{ background: "var(--gradient-sidebar)" }}>
      {/* Logo block */}
      <div className="mx-3 mt-3 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-5 text-center">
        <div className="mx-auto w-fit rounded-2xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-full.png" alt="StrategAIze" className="h-12 w-auto" />
        </div>
      </div>
      {/* Beratung block */}
      <div className="mx-3 mt-2 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-4 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <Shield className="h-3 w-3 text-slate-400" />
          <span className="text-sm font-bold text-white">Beratung</span>
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">Meine Mandanten</div>
      </div>
      <div className="h-3" />

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Workspace
        </div>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.35)]"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-white" : ""}`} />
              {item.label}
            </Link>
          );
        })}

        {/* Read-only Liste der zugewiesenen Mandanten (keine Verwaltung). */}
        <div className="mb-2 mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Zugewiesene Mandanten
        </div>
        {assignedTenants.length === 0 ? (
          <div className="px-3 py-2 text-xs text-slate-500">
            Noch keine Mandanten zugewiesen.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {assignedTenants.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300"
              >
                <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="truncate" title={t.name}>
                  {t.name}
                </span>
              </li>
            ))}
          </ul>
        )}
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

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-slate-900 p-2 text-white shadow-lg lg:hidden"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
