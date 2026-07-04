// V10.2 SLC-184 — Geteilter strategaize_admin-Re-Gate fuer den Berater-Workspace.
//
// Extrahiert aus src/app/admin/mein-tag/actions.ts (SLC-183). BEIDE Workspace-Actions
// (Report-Load/Fazit + RAG) und die Admin-Transcribe-Route MUESSEN vor jedem
// createAdminClient-/Whisper-Zugriff re-gaten: Server-Actions und API-Routes sind
// eigenstaendige Entry-Points, das Page-Gate (/admin/mein-tag) schuetzt sie NICHT
// (R-183-1 / security-audit-fable5-standard).
//
// De-Drift: EINE Gate-Definition statt einer Kopie pro Action/Route
// (Pre-Merge-Re-Check Pattern-Drift, git-release.md).

import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Re-Gate auf strategaize_admin. Liefert den authentifizierten User oder null.
 * MUSS vor jedem createAdminClient-/Whisper-Zugriff in einer Action/Route laufen.
 */
export async function assertStrategaizeAdmin(): Promise<User | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") return null;
  return user;
}
