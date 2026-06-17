"use server";

// V9.75 SLC-V9.75-A MT-3 — Tier-Verwaltungs-Action.
//
// Einziger legitimer Schreibpfad auf capture_session.tier. Der
// capture_session_tier_change_guard-Trigger (Migration 121) erlaubt tier-Changes
// NUR fuer service_role; daher schreibt diese Action via createAdminClient()
// (service_role), nachdem sie strategaize_admin im User-Kontext verifiziert hat.
//
// DEC-219-Refinement: bewusst KEINE SECURITY-DEFINER-RPC — eine DEFINER-Funktion
// laeuft als Owner `postgres`, den der service_role-aware Trigger ebenso blockt
// wie `authenticated`. Reuse des BS-`profiles.role`-changeRole-Musters
// ([[strategaize-pattern-reuse]]): Rollen-Check im TS + service_role-Write.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_TIERS = ["free", "blueprint", "handbook"] as const;
type Tier = (typeof VALID_TIERS)[number];

export async function setCaptureSessionTier(
  sessionId: string,
  tier: string,
): Promise<{ success: boolean; error?: string }> {
  if (!VALID_TIERS.includes(tier as Tier)) {
    return { success: false, error: `Ungueltige Stufe: ${tier}` };
  }

  // 1. Auth — nur strategaize_admin darf die Stufe setzen.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Nicht authentifiziert" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") {
    return {
      success: false,
      error: "Nur strategaize_admin kann die Stufe aendern",
    };
  }

  // 2. Schreiben via service_role (passt am Change-Guard-Trigger vorbei).
  const admin = createAdminClient();
  const { error } = await admin
    .from("capture_session")
    .update({ tier })
    .eq("id", sessionId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
