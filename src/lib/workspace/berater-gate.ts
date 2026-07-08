// V10.4 SLC-188 (FEAT-105) — Geteilter strategaize_berater-Re-Gate.
//
// Muster 1:1 aus src/lib/workspace/admin-gate.ts (assertStrategaizeAdmin, SLC-184).
// Server-Actions und API-Routes sind eigenstaendige Entry-Points — das Page-/Layout-Gate
// schuetzt sie NICHT. Jeder Berater-Loader/-Action MUSS vor createAdminClient-Zugriff
// re-gaten (R-183-1 / security-audit-fable5-standard, DEC-269 Query-Layer-Durchsetzung).
//
// De-Drift: EINE Gate-Definition statt einer Kopie pro Action/Route.

import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Re-Gate auf strategaize_berater. Liefert den authentifizierten User oder null.
 * MUSS vor jedem createAdminClient-Zugriff in einer Berater-Action/Route laufen.
 */
export async function assertStrategaizeBerater(): Promise<User | null> {
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

  if (!profile || profile.role !== "strategaize_berater") return null;
  return user;
}
