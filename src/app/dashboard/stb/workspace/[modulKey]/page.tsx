// StB-Modul-Workspace — Detail (SLC-175, OP V10).
//
// Server-Boundary: Auth + RLS-scoped Datenladen EINES Moduls (MIG-124) +
// Template-Name fuer den Titel (best-effort). Das Rendering (Triple-Cards,
// KI-Hebel, Print, States, i18n) delegiert an die Client-View
// (ModulWorkspaceView). Env-gated via dashboard/stb/layout.

import { redirect, notFound } from "next/navigation";

import { ModulWorkspaceView } from "@/components/stb/ModulWorkspaceView";
import { createClient } from "@/lib/supabase/server";
import { getTemplateBySlug } from "@/lib/db/template-queries";
import { isValidModulKey, modulKeyToSlug } from "@/lib/stb-vertikale/modul-capture";
import {
  readModulOutputsForModul,
  groupModuleOutputs,
  modulKeyToLabel,
  type ModuleWorkspaceData,
} from "@/lib/stb-vertikale/workspace-read";

export default async function StbWorkspaceDetailPage({
  params,
}: {
  params: Promise<{ modulKey: string }>;
}) {
  const { modulKey } = await params;
  if (!isValidModulKey(modulKey)) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Template-Name fuer den Titel (best-effort; faellt auf das Label zurueck).
  const template = await getTemplateBySlug(supabase, modulKeyToSlug(modulKey));
  const heading = template?.name ?? modulKeyToLabel(modulKey);

  let data: ModuleWorkspaceData | null = null;
  let loadError = false;
  try {
    const rows = await readModulOutputsForModul(supabase, modulKey);
    data = groupModuleOutputs(modulKey, rows);
  } catch {
    loadError = true;
  }

  return (
    <ModulWorkspaceView
      heading={heading}
      modulLabel={modulKeyToLabel(modulKey)}
      data={data}
      loadError={loadError}
    />
  );
}
