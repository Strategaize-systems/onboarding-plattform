// V7.5 SLC-145 — Demo-Mode-Banner fuer strategaize_admin auf Mandanten-Pages.
//
// Wird nur fuer Rolle strategaize_admin gerendert. Erinnert den Admin, dass er
// sich gerade in der Mandanten-Funnel-Sicht befindet (Demo-Mode via tenant_id-
// Verortung) und bietet schnellen Weg zurueck ins Admin-Cockpit.
//
// Wird NICHT fuer echte tenant_admin / tenant_member / employee gerendert —
// dort ist die Sicht der Normalzustand, kein Banner noetig.

import Link from "next/link";
import { Eye, ArrowLeft } from "lucide-react";

interface AdminDemoBannerProps {
  role: string;
  tenantName?: string | null;
}

export function AdminDemoBanner({ role, tenantName }: AdminDemoBannerProps) {
  if (role !== "strategaize_admin") return null;

  return (
    <div className="sticky top-0 z-40 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5" />
          <span>
            <strong>Demo-Modus</strong> — du siehst die Mandanten-Sicht
            {tenantName ? (
              <>
                {" "}als <strong>{tenantName}</strong>
              </>
            ) : null}
            . EditableText-Pencil-Icons + Helper-Modals sind aktiv.
          </span>
        </div>
        <Link
          href="/admin/tenants"
          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 font-medium text-amber-900 transition hover:bg-amber-100"
        >
          <ArrowLeft className="h-3 w-3" />
          Zurueck ins Admin-Cockpit
        </Link>
      </div>
    </div>
  );
}
