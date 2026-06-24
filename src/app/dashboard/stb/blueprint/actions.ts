"use server";

// StB-Vertikale Kanzlei-Blueprint Server-Actions — SLC-172 MT-1 (FEAT-092, OP V10).
//
// Port-Vorbild: src/app/dashboard/stb/modul/[modulKey]/actions.ts (SLC-173) —
// Session-Start ist 1:1 dasselbe find-or-resume-Muster (createCaptureSession +
// setStbVerticalStage), nur auf das Blueprint-Template (stb_blueprint_kanzlei).
// NEU hier: assessAnswerAmpel (adaptive Vertiefung, Choice A / DEC-249).
//
// Tier: capture_session.tier defaultet auf 'handbook' (MIG-121, rank 2) >=
// 'blueprint' (rank 1, min-tier von diagnosis_generation) -> der spaetere
// Diagnose-Trigger (MT-2) ist by-default freigeschaltet, kein tier-Set noetig
// (identisch zum Modul-Flow, der module_output_synthesis [blueprint] enqueued).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatWithLLM } from "@/lib/llm";
import { getTemplateBySlug, getTemplateById } from "@/lib/db/template-queries";
import { createCaptureSession } from "@/lib/db/capture-session-queries";
import { setStbVerticalStage } from "@/lib/stb-vertikale/tenant-marker";
import {
  BLUEPRINT_SLUG,
  BLUEPRINT_BASE_PATH,
  parseAmpel,
  type Ampel,
} from "@/lib/stb-vertikale/blueprint";

// Klassischer Capture-Mode (Default-Pfad). Die StB-Vertikale-Kennung lebt im
// metadata-Marker (DEC-243), nicht im capture_mode.
const STB_BLUEPRINT_CAPTURE_MODE = "questionnaire";

/** JSONB-Key unter capture_session.metadata fuer die adaptiven Live-Ampeln. */
const ADAPTIVE_AMPEL_KEY = "blueprint_adaptive_ampel" as const;

/** error_log-Source der Audit-Eintraege (data-residency.md Nachweispflicht). */
const ASSESS_AUDIT_SOURCE = "blueprint_adaptive_ampel" as const;

/**
 * Startet oder setzt die Blueprint-Capture-Session des StB fuer die eigene
 * Kanzlei fort (find-or-resume, idempotent) und leitet in den Wizard-Overview
 * um. Per Form-Button aufgerufen (POST, kein Prefetch) -> sicher fuer DB-Writes.
 */
export async function startOrResumeBlueprintSession(
  _formData?: FormData
): Promise<void> {
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

  const template = await getTemplateBySlug(supabase, BLUEPRINT_SLUG);
  if (!template) {
    // Blueprint noch nicht geseedet (vor SLC-170b) -> zurueck zur Uebersicht.
    redirect("/dashboard/stb");
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
      capture_mode: STB_BLUEPRINT_CAPTURE_MODE,
    });
    sessionId = session.id;
  }

  // Ownership ist hier garantiert (Session fuer eigenen Tenant erzeugt bzw. per
  // tenant_id+owner_user_id gefiltert geladen) -> Marker-Set ist sicher (L-2).
  await setStbVerticalStage(sessionId);

  redirect(`${BLUEPRINT_BASE_PATH}/${sessionId}`);
}

export type AssessAmpelResult =
  | { ok: true; ampel: Ampel }
  | { ok: false; error: string };

/**
 * Adaptive Vertiefung (Choice A, DEC-249): bewertet eine einzelne Kern-Antwort
 * live als Ampel. Bei gelb/rot blendet der Wizard die gekoppelte Vertiefungs-
 * frage ein (Kopplung via gemeinsames `unterbereich`, siehe blueprint.ts). Die
 * Ampel ist NUR UX-Steuerung — die finale Diagnose (block_diagnosis) bewertet
 * der diagnosis_generation-Worker eigenstaendig (DEC-244).
 *
 * Non-blocking: bei LLM-/Parse-Fehler fail-open auf 'yellow' (lieber nachfragen
 * als eine noetige Vertiefung unterdruecken) — die Capture laeuft weiter.
 * Audit in error_log (provider/region/model, data-residency.md); KEIN
 * ai_cost_ledger in V1 (Mikro-Kosten, ISSUE-107).
 */
export async function assessAnswerAmpel(
  sessionId: string,
  frageId: string,
  answer: string
): Promise<AssessAmpelResult> {
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
    .select("tenant_id, template_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Kein Zugriff auf diese Session" };
  }

  // Frage-Kontext (Text + Unterthema) aus dem Session-Template laden.
  const template = await getTemplateById(supabase, session.template_id);
  if (!template || template.slug !== BLUEPRINT_SLUG) {
    return { ok: false, error: "Kein Blueprint-Template fuer diese Session" };
  }
  const question = template.blocks
    .flatMap((b) => b.questions)
    .find((q) => q.frage_id === frageId);
  if (!question) {
    return { ok: false, error: "Frage nicht gefunden" };
  }

  const admin = createAdminClient();
  const region =
    process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? "eu-central-1";
  const model = process.env.LLM_MODEL ?? "bedrock-default";

  // --- LLM-Assessment (fail-open) ---
  let ampel: Ampel;
  let auditLevel: "info" | "warning" = "info";
  try {
    const raw = await chatWithLLM(
      [
        {
          role: "system",
          content:
            "Du bewertest EINE Selbstauskunft eines Steuerberaters zur eigenen " +
            "Kanzlei und stufst sie als Ampel ein: green (solide/kein Handlungs" +
            "bedarf), yellow (Luecke/Beobachtung), red (klarer Handlungsbedarf/" +
            "Risiko). Im Zweifel yellow. Antworte AUSSCHLIESSLICH mit JSON: " +
            '{"ampel":"green|yellow|red"} — keine Erklaerung.',
        },
        {
          role: "user",
          content: `Unterthema: ${question.unterbereich}\nFrage: ${question.text}\nAntwort des StB: ${answer}`,
        },
      ],
      { temperature: 0, maxTokens: 64 }
    );
    ampel = parseAmpel(raw);
  } catch (e) {
    ampel = "yellow"; // fail-open
    auditLevel = "warning";
    await admin.from("error_log").insert({
      level: "warning",
      source: ASSESS_AUDIT_SOURCE,
      message: `assessAnswerAmpel LLM-Fehler fuer ${frageId} (fail-open yellow): ${
        e instanceof Error ? e.message : String(e)
      }`,
      metadata: { capture_session_id: sessionId, frage_id: frageId, provider: "aws-bedrock", region, model },
    });
  }

  // --- Audit-Trail (data-residency.md) ---
  if (auditLevel === "info") {
    await admin.from("error_log").insert({
      level: "info",
      source: ASSESS_AUDIT_SOURCE,
      message: `Blueprint-Ampel ${ampel} fuer ${frageId} (session ${sessionId})`,
      metadata: { capture_session_id: sessionId, frage_id: frageId, provider: "aws-bedrock", region, model, ampel },
    });
  }

  // --- Ampel in capture_session.metadata stashen (fetch-merge-write, additiv) ---
  // NICHT in answers (record<string,string> -> nested object brache das Schema).
  const { data: row } = await admin
    .from("capture_session")
    .select("metadata")
    .eq("id", sessionId)
    .single();
  const currentMeta = (row?.metadata ?? {}) as Record<string, unknown>;
  const currentAmpel =
    (currentMeta[ADAPTIVE_AMPEL_KEY] as Record<string, string> | undefined) ?? {};
  await admin
    .from("capture_session")
    .update({
      metadata: {
        ...currentMeta,
        [ADAPTIVE_AMPEL_KEY]: { ...currentAmpel, [frageId]: ampel },
      },
    })
    .eq("id", sessionId);

  return { ok: true, ampel };
}
