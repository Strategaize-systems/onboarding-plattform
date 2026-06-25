"use server";

// StB-Vertikale Kanzlei-Blueprint — Diagnose-Trigger (SLC-172 MT-2, FEAT-092, OP V10).
//
// Self-service-Klon von triggerDiagnosisGeneration
// (src/app/admin/debrief/[sessionId]/[blockKey]/diagnosis-actions.ts) mit drei
// Deltas (DEC-244/249/250):
//   - tenant-scoped statt strategaize_admin-only (Blueprint = Gratis-Test des StB
//     fuer die eigene Kanzlei),
//   - seedet zuerst die Diagnose-Inputs A–G atomar via
//     rpc_seed_blueprint_diagnosis_input (MIG-127) — der Blueprint-Capture liefert
//     keine condensation-KUs, der Worker wuerde sonst pro Block werfen,
//   - enqueued danach je Diagnose-Block einen diagnosis_generation-Job.
// Der Worker handle-diagnosis-job bleibt 1:1 reused/unangetastet.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSessionTierAllows } from "@/lib/auth/assert-session-tier";

export interface TriggerBlueprintDiagnosisResult {
  success: boolean;
  /** Anzahl enqueuter diagnosis_generation-Jobs (= Diagnose-Bloecke A–G). */
  enqueued?: number;
  error?: string;
}

interface SeededBlock {
  block_key: string;
  checkpoint_id: string;
}

interface SeedResult {
  session_id: string;
  block_count: number;
  ku_count: number;
  blocks: SeededBlock[];
}

/**
 * Startet die Blueprint-Diagnose fuer die eigene Kanzlei-Session des StB:
 * KU-Inputs A–G atomar seeden (MIG-127) -> je Diagnose-Block einen
 * diagnosis_generation-Job enqueuen. Idempotent re-aufrufbar (re-seedet + setzt
 * offene Jobs zurueck). Tenant-scoped + tier-gated (>= blueprint).
 */
export async function triggerBlueprintDiagnosis(
  sessionId: string
): Promise<TriggerBlueprintDiagnosisResult> {
  const supabase = await createClient();

  // 1. Auth — eingeloggter StB (kein strategaize_admin noetig).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Nicht authentifiziert" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile?.tenant_id) {
    return { success: false, error: "Profil/Tenant nicht gefunden" };
  }

  // 2. Session laden + Tenant-Scope (Defense-in-Depth zusaetzlich zu RLS).
  const { data: session } = await supabase
    .from("capture_session")
    .select("tenant_id, owner_user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.tenant_id !== profile.tenant_id) {
    return { success: false, error: "Kein Zugriff auf diese Session" };
  }

  // 3. Tier-Gate (Schicht 1) — diagnosis_generation verlangt >= blueprint.
  const gate = await assertSessionTierAllows(
    supabase,
    sessionId,
    "diagnosis_generation"
  );
  if (!gate.allowed) {
    return {
      success: false,
      error:
        "Diagnose ist fuer die aktuelle Stufe nicht freigeschaltet (tier_gate_denied)",
    };
  }

  const admin = createAdminClient();

  // 4. KU-Inputs A–G atomar seeden (MIG-127, idempotent via CASCADE-Re-Seed).
  const { data: seedRaw, error: seedError } = await admin.rpc(
    "rpc_seed_blueprint_diagnosis_input",
    { p_session_id: sessionId }
  );
  if (seedError) {
    return {
      success: false,
      error: `KU-Seed fehlgeschlagen: ${seedError.message}`,
    };
  }
  const seed = seedRaw as SeedResult | null;
  if (!seed || !Array.isArray(seed.blocks) || seed.blocks.length === 0) {
    return { success: false, error: "KU-Seed lieferte keine Diagnose-Bloecke" };
  }

  // 5. Enqueue-Idempotenz: offene (pending) diagnosis_generation-Jobs dieser
  //    Session zuruecksetzen, damit ein Re-Trigger keine Doubletten anhaeuft.
  //    Laufende/abgeschlossene Jobs bleiben unberuehrt.
  await admin
    .from("ai_jobs")
    .delete()
    .eq("job_type", "diagnosis_generation")
    .eq("status", "pending")
    .filter("payload->>session_id", "eq", sessionId);

  // 6. Je Diagnose-Block A–G einen diagnosis_generation-Job (Worker-Reuse). Der
  //    session_tier-Stempel speist die Worker-Defense (MIG-121 Insert-Guard).
  const rows = seed.blocks.map((b) => ({
    tenant_id: session.tenant_id,
    job_type: "diagnosis_generation",
    payload: {
      block_checkpoint_id: b.checkpoint_id,
      block_key: b.block_key,
      session_id: sessionId,
    },
    status: "pending",
    session_tier: gate.tier,
  }));

  const { error: jobError } = await admin.from("ai_jobs").insert(rows);
  if (jobError) {
    return {
      success: false,
      error: `Job-Enqueue fehlgeschlagen: ${jobError.message}`,
    };
  }

  return { success: true, enqueued: rows.length };
}
