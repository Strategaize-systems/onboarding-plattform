"use server";

// StB-Vertikale Modul-Capture Server-Actions — SLC-173 (FEAT-093, OP V10).
//
// Reuse: createCaptureSession + rpc_create_block_checkpoint-Flow (capture/),
// setStbVerticalStage (SLC-171), rpc_enqueue_module_output (SLC-169).
// Ownership-Disziplin (L-2): setStbVerticalStage nutzt den Admin-Client
// (BYPASSRLS, kein interner Ownership-Check) — daher MUSS der Caller die
// Session-Zugehoerigkeit garantieren, BEVOR der Marker gesetzt wird. Hier ist
// das gegeben: die Session wird entweder fuer den eigenen Tenant erzeugt oder
// per (tenant_id, owner_user_id) gefiltert geladen.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTemplateBySlug } from "@/lib/db/template-queries";
import {
  createCaptureSession,
  setCaptureSessionEntitledTier,
} from "@/lib/db/capture-session-queries";
import { setStbVerticalStage } from "@/lib/stb-vertikale/tenant-marker";
import {
  isValidModulKey,
  modulKeyToSlug,
  modulBasePath,
} from "@/lib/stb-vertikale/modul-capture";
import { persistModulReifeAmpel } from "@/lib/stb-vertikale/module-delivery/persist-ampel";

// Klassischer Capture-Mode (StubComponent=null -> Default-Pfad). Die StB-
// Vertikale-Kennung lebt im metadata-Marker (DEC-243), nicht im capture_mode.
const STB_MODUL_CAPTURE_MODE = "questionnaire";

export type EnqueueModulOutputResult =
  | { ok: true; jobId: string; deduplicated: boolean }
  | { ok: false; error: string };

/**
 * Startet oder setzt die Modul-Capture-Session des StB fuer die eigene Kanzlei
 * fort (find-or-resume, idempotent) und leitet in den Wizard-Overview um.
 * Per Form-Button aufgerufen (POST, kein Prefetch) -> sicher fuer DB-Writes.
 */
export async function startOrResumeModulSession(
  modulKey: string,
  _formData?: FormData
): Promise<void> {
  if (!isValidModulKey(modulKey)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile?.tenant_id) {
    redirect("/login");
  }

  const template = await getTemplateBySlug(supabase, modulKeyToSlug(modulKey));
  if (!template) {
    // Modul noch nicht geseedet (z.B. M-06 vor SLC-170b) -> zurueck zur Uebersicht.
    redirect(modulBasePath(modulKey));
  }

  // Resume: bestehende, nicht-finalisierte Session des eigenen Tenants/Owners.
  const { data: existing } = await supabase
    .from("capture_session")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .eq("template_id", template.id)
    .eq("owner_user_id", user.id)
    .neq("status", "finalized")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sessionId: string;
  if (existing) {
    sessionId = existing.id;
  } else {
    const session = await createCaptureSession(supabase, {
      tenant_id: profile.tenant_id,
      template_id: template.id,
      template_version: template.version,
      owner_user_id: user.id,
      capture_mode: STB_MODUL_CAPTURE_MODE,
    });
    sessionId = session.id;
    // V20 SLC-193 MT-2 (DEC-279): entitled tier per service_role. MIG-133 senkt den
    // DEFAULT auf 'free' + coerced den authenticated INSERT auf 'free'. Modul-Output
    // (module_output_synthesis) ist blueprint-gated (DEC-239) -> 'blueprint'.
    await setCaptureSessionEntitledTier(sessionId, "blueprint");
  }

  // Ownership ist hier garantiert (Session fuer eigenen Tenant erzeugt bzw.
  // per tenant_id+owner_user_id gefiltert geladen) -> Marker-Set ist sicher (L-2).
  await setStbVerticalStage(sessionId);

  redirect(`${modulBasePath(modulKey)}/${sessionId}`);
}

/**
 * Enqueued den Modul-Output-Synthese-Job (SLC-174) fuer einen Capture-Run.
 * Ownership + Tier-Gate werden zusaetzlich im SECURITY-DEFINER-RPC
 * `rpc_enqueue_module_output` (auth.user_tenant_id()) erzwungen; der
 * Pre-Check hier ist Defense-in-Depth + saubere Fehlermeldung.
 */
export async function enqueueModulOutput(
  sessionId: string,
  modulKey: string
): Promise<EnqueueModulOutputResult> {
  if (!isValidModulKey(modulKey)) {
    return { ok: false, error: "Ungueltiger Modul-Schluessel" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Nicht authentifiziert" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile?.tenant_id) {
    return { ok: false, error: "Profil/Tenant nicht gefunden" };
  }

  // Defense-in-Depth: Session muss dem eigenen Tenant gehoeren.
  const { data: session } = await supabase
    .from("capture_session")
    .select("tenant_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Kein Zugriff auf diese Session" };
  }

  const { data, error } = await supabase.rpc("rpc_enqueue_module_output", {
    p_capture_session_id: sessionId,
    p_modul_key: modulKey,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const result = (data ?? {}) as { job_id?: string; deduplicated?: boolean };
  if (!result.job_id) {
    return { ok: false, error: "Enqueue fehlgeschlagen (keine Job-ID)" };
  }

  // Modul-Abschluss: Reife-Ampel deterministisch berechnen + stashen (SLC-178).
  // Non-blocking — ein Fehler hier darf den Enqueue-Erfolg nicht kippen.
  await persistModulReifeAmpel(sessionId, modulKey);

  return {
    ok: true,
    jobId: result.job_id,
    deduplicated: Boolean(result.deduplicated),
  };
}
