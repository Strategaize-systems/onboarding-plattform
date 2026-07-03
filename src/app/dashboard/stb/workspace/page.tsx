// StB-Modul-Workspace — Uebersicht (SLC-175, OP V10).
//
// Server-Boundary: Auth + RLS-scoped Datenladen (modul_output_tenant_read,
// MIG-124 — keine manuelle tenant-Filterung). Das Rendering (i18n, States)
// delegiert an die Client-View (WorkspaceOverview), analog zum Capture-Pattern
// (Server-Page -> Client-Workspace). Env-gated via dashboard/stb/layout.

import { redirect } from "next/navigation";

import { WorkspaceOverview } from "@/components/stb/WorkspaceOverview";
import { createClient } from "@/lib/supabase/server";
import {
  readWorkspaceOutputs,
  readModulDeliveryAmpeln,
  summarizeModulOutputs,
  type ModulSummary,
} from "@/lib/stb-vertikale/workspace-read";

export default async function StbWorkspacePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  let summaries: ModulSummary[] = [];
  let loadError = false;
  try {
    const rows = await readWorkspaceOutputs(supabase);
    summaries = summarizeModulOutputs(rows);
    // Reife-Ampel je Modul aus capture_session.metadata anreichern (SLC-178).
    // Fehlt/faellt aus -> Ampel bleibt null (Reader zeigt kein Signal), aber die
    // Uebersicht laedt trotzdem.
    try {
      const ampeln = await readModulDeliveryAmpeln(supabase);
      summaries = summaries.map((s) => ({
        ...s,
        ampel: ampeln[s.modulKey] ?? null,
      }));
    } catch {
      // Ampel-Anreicherung ist optional — Overview darf ohne sie rendern.
    }
  } catch {
    loadError = true;
  }

  return <WorkspaceOverview summaries={summaries} loadError={loadError} />;
}
