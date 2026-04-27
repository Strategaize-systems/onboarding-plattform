import { BookOpen, GitMerge, Users, ClipboardList, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * SLC-040 MT-6 — strategaize_admin Cross-Tenant-Sicht.
 *
 * Foundation-Variante (V4): Pro Tenant Status-Badges fuer Bridge + Handbuch +
 * Mitarbeiter-Count. Kein Drill-Down — der Klick auf den Tenant fuehrt in die
 * bestehende TenantsClient-Section unten auf derselben Seite.
 *
 * V4.2 wird das ausbauen (Detail-Cockpit pro Tenant, Cross-Tenant-Trends, etc.).
 */

export interface CrossTenantRow {
  tenant_id: string;
  tenant_name: string;
  employees_count: number;
  bridge_status: "none" | "running" | "completed" | "failed" | "stale";
  bridge_proposal_count: number;
  handbook_status: "none" | "generating" | "ready" | "failed";
  handbook_created_at: string | null;
  blocks_submitted: number;
  blocks_total: number;
}

interface Props {
  rows: CrossTenantRow[];
}

export function CrossTenantCockpit({ rows }: Props) {
  if (rows.length === 0) return null;

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Cross-Tenant Status</CardTitle>
        <p className="text-sm text-slate-500">
          Schneller Status-Ueberblick aller Tenants. Detail per Klick auf Tenant in
          der Liste unten.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-semibold">Tenant</th>
                <th className="pb-2 pr-4 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <ClipboardList className="h-3 w-3" /> Bloecke
                  </span>
                </th>
                <th className="pb-2 pr-4 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <GitMerge className="h-3 w-3" /> Bridge
                  </span>
                </th>
                <th className="pb-2 pr-4 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" /> Mitarbeiter
                  </span>
                </th>
                <th className="pb-2 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="h-3 w-3" /> Handbuch
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tenant_id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 font-medium text-slate-900">{r.tenant_name}</td>
                  <td className="py-3 pr-4 text-slate-700">
                    {r.blocks_total > 0
                      ? `${r.blocks_submitted} / ${r.blocks_total}`
                      : "–"}
                  </td>
                  <td className="py-3 pr-4">
                    <BridgeBadge
                      status={r.bridge_status}
                      proposalCount={r.bridge_proposal_count}
                    />
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{r.employees_count}</td>
                  <td className="py-3">
                    <HandbookBadge status={r.handbook_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function BridgeBadge({
  status,
  proposalCount,
}: {
  status: CrossTenantRow["bridge_status"];
  proposalCount: number;
}) {
  if (status === "none") return <span className="text-slate-400 text-xs">Kein Lauf</span>;
  if (status === "running") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Laeuft
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Fehler
      </Badge>
    );
  }
  if (status === "stale") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
        <AlertCircle className="h-3 w-3" /> Veraltet ({proposalCount})
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="gap-1">
      <CheckCircle2 className="h-3 w-3" /> {proposalCount} Vorschlaege
    </Badge>
  );
}

function HandbookBadge({ status }: { status: CrossTenantRow["handbook_status"] }) {
  if (status === "none") return <span className="text-slate-400 text-xs">Nicht erzeugt</span>;
  if (status === "generating") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> In Erzeugung
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Fehler
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="gap-1">
      <CheckCircle2 className="h-3 w-3" /> Bereit
    </Badge>
  );
}
