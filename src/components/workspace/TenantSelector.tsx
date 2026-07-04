// SLC-184 MT-3 — Mandanten-Selector fuer die RAG-Frage-Antwort.
//
// Der Berater waehlt EINEN Mandanten, gegen dessen knowledge_chunks die freie Frage
// laeuft. Die Berichte (SLC-183) bleiben cross-Mandant und ignorieren diese Auswahl.
// Der tenant_id wird server-seitig re-validiert (DEC-258) — dieser Selector ist reine UX.
"use client";

import { Building2 } from "lucide-react";

export interface TenantOption {
  id: string;
  name: string;
}

interface TenantSelectorProps {
  tenants: TenantOption[];
  value: string | null;
  onChange: (tenantId: string | null) => void;
}

export function TenantSelector({ tenants, value, onChange }: TenantSelectorProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
      <label htmlFor="workspace-tenant" className="text-sm font-semibold text-slate-700">
        Mandant für Fragen
      </label>
      <select
        id="workspace-tenant"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
      >
        <option value="">— Mandant wählen —</option>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
