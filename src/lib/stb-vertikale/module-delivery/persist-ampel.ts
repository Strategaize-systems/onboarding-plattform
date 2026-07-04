// StB-Vertikale Modul-Reife-Ampel — Persist-Layer (SLC-178 MT-2, OP V10.1).
//
// Schreibt die deterministisch berechnete Reife-Ampel eines Moduls nach
// `capture_session.metadata.modul_delivery_ampel[modulKey]`. Kein Schema-Touch —
// exakt das metadata-fetch-merge-write-Muster aus
// `src/app/dashboard/stb/blueprint/actions.ts` (assessAnswerAmpel, DEC-249).
//
// Aufgerufen am Modul-Abschluss-Pfad (nach `enqueueModulOutput`). Ohne SLC-179
// existieren keine Trigger-Hits -> Ampel green (sichere Baseline, DEC-253/C).

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTemplateById } from "@/lib/db/template-queries";
import type { Ampel } from "@/lib/stb-vertikale/blueprint";
import {
  computeModulReifeAmpel,
  MODUL_DELIVERY_AMPEL_META_KEY,
  MODUL_DELIVERY_TRIGGER_HITS_META_KEY,
  type ReifeAmpelFlags,
} from "./reife-ampel";

export type PersistAmpelResult =
  | { ok: true; ampel: Ampel }
  | { ok: false; error: string };

/**
 * Berechnet die Modul-Reife-Ampel (DEC-253/C) aus den Template-Flags + den in
 * `metadata` vermerkten Trigger-Hits (SLC-179) und persistiert sie additiv in
 * `metadata.modul_delivery_ampel[modulKey]`. Idempotent (re-berechenbar).
 *
 * Non-blocking gedacht: der Caller wertet das Ergebnis nur informativ aus — ein
 * Fehler hier darf den Modul-Abschluss nicht abbrechen.
 */
export async function persistModulReifeAmpel(
  sessionId: string,
  modulKey: string,
): Promise<PersistAmpelResult> {
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

  // Flag-Map (frage_id -> Flags) aus dem Session-Template (MIG-129).
  const template = await getTemplateById(supabase, session.template_id);
  if (!template) {
    return { ok: false, error: "Template fuer diese Session nicht gefunden" };
  }
  const flags: Record<string, ReifeAmpelFlags> = {};
  for (const block of template.blocks) {
    for (const q of block.questions) {
      flags[q.frage_id] = {
        owner_dependency: q.owner_dependency,
        deal_blocker: q.deal_blocker,
        sop_trigger: q.sop_trigger,
        ko_hart: q.ko_hart,
        ko_soft: q.ko_soft,
      };
    }
  }

  // metadata frisch via admin lesen: Trigger-Hits (SLC-179) + bestehende Ampeln.
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("capture_session")
    .select("metadata")
    .eq("id", sessionId)
    .single();
  const currentMeta = (row?.metadata ?? {}) as Record<string, unknown>;

  const triggerHitsMap =
    (currentMeta[MODUL_DELIVERY_TRIGGER_HITS_META_KEY] as
      | Record<string, unknown>
      | undefined) ?? {};
  const rawHits = triggerHitsMap[modulKey];
  const triggerHits: string[] = Array.isArray(rawHits)
    ? rawHits.filter((x): x is string => typeof x === "string")
    : [];

  const ampel = computeModulReifeAmpel(flags, triggerHits);

  const currentAmpeln =
    (currentMeta[MODUL_DELIVERY_AMPEL_META_KEY] as
      | Record<string, string>
      | undefined) ?? {};
  await admin
    .from("capture_session")
    .update({
      metadata: {
        ...currentMeta,
        [MODUL_DELIVERY_AMPEL_META_KEY]: {
          ...currentAmpeln,
          [modulKey]: ampel,
        },
      },
    })
    .eq("id", sessionId);

  return { ok: true, ampel };
}
