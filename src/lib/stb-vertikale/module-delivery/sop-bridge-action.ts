"use server";

// StB-Vertikale SOP-Bruecke — Server-Action (SLC-181 MT-2, OP V10.1).
//
// Duenne Bruecke (DEC-253/D + DEC-256): nimmt die accepted, prozess-relevanten
// modul_output-Rows eines Moduls (standard + implementierungsschritt) und schreibt
// sie als SOP-Sektionen in die BESTEHENDE `sop`-Tabelle (MIG-042) — idempotent ueber
// die Provenance-Spalte source_modul_output_id (MIG-130). Der Legacy-`sop_generation`-
// Worker (src/workers/sop/*) bleibt UNBERUEHRT.
//
// Auswahl + Mapping sind pure (sop-bridge.ts, hermetisch getestet). Hier liegt nur
// die I/O-Schicht: auth -> Rolle -> Ownership -> Reads (RLS-Client, tenant-safe) ->
// block_key-Aufloesung -> Reife-Scoring (SLC-178-Reuse) -> service_role-Upsert.
// Trennung wie reife-ampel.ts <-> persist-ampel.ts.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTemplateById } from "@/lib/db/template-queries";
import { isValidModulKey } from "@/lib/stb-vertikale/modul-capture";
import {
  computeModulReifeAmpel,
  MODUL_DELIVERY_TRIGGER_HITS_META_KEY,
  type ReifeAmpelFlags,
} from "./reife-ampel";
import {
  mapModulOutputsToSopRows,
  SOP_BRIDGE_OUTPUT_KINDS,
  type BridgeInput,
  type BridgeModulOutput,
} from "./sop-bridge";

/** Nur diese Rollen duerfen SOP-Sektionen erzeugen (Standard-Write-Gate). */
const SOP_BRIDGE_ROLES = ["tenant_admin", "strategaize_admin"] as const;

export type BridgeModulOutputsToSopResult =
  | { ok: true; inserted: number }
  | { ok: false; error: string };

/**
 * Erzeugt SOP-Sektionen aus den accepted Prozess-Outputs eines Moduls (AC-181-1).
 * On-demand (per Modul aufrufbar). Idempotent: ein zweiter Lauf fuegt nichts
 * Neues ein (ON CONFLICT (source_modul_output_id) DO NOTHING, MIG-130).
 *
 * @returns inserted = Anzahl NEU angelegter SOP-Rows (Konflikte zaehlen nicht mit).
 */
export async function bridgeModulOutputsToSop(
  sessionId: string,
  modulKey: string,
): Promise<BridgeModulOutputsToSopResult> {
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
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  if (!profile?.tenant_id) {
    return { ok: false, error: "Profil/Tenant nicht gefunden" };
  }
  if (!SOP_BRIDGE_ROLES.includes(profile.role)) {
    return { ok: false, error: "Keine Berechtigung fuer SOP-Erzeugung" };
  }

  const isPlatformAdmin = profile.role === "strategaize_admin";

  // Session laden (Ownership + template + metadata fuer Scoring).
  const { data: session } = await supabase
    .from("capture_session")
    .select("tenant_id, template_id, metadata")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || (!isPlatformAdmin && session.tenant_id !== profile.tenant_id)) {
    return { ok: false, error: "Kein Zugriff auf diese Session" };
  }

  // Accepted Prozess-Outputs des Moduls (RLS-Client = tenant-scoped SELECT).
  const { data: outputs, error: outputsError } = await supabase
    .from("modul_output")
    .select(
      "id, tenant_id, capture_session_id, block_checkpoint_id, modul_key, output_kind, title, body, evidence_refs, status",
    )
    .eq("capture_session_id", sessionId)
    .eq("modul_key", modulKey)
    .eq("status", "accepted")
    .in("output_kind", SOP_BRIDGE_OUTPUT_KINDS as unknown as string[]);
  if (outputsError) {
    return { ok: false, error: `modul_output-Read fehlgeschlagen: ${outputsError.message}` };
  }
  if (!outputs || outputs.length === 0) {
    return { ok: true, inserted: 0 };
  }

  // block_key je Output aus dem Herkunfts-block_checkpoint aufloesen
  // (sop.block_key ist NOT NULL; modul_output haelt nur block_checkpoint_id).
  const checkpointIds = [
    ...new Set(
      outputs
        .map((o) => o.block_checkpoint_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const blockKeyByCheckpoint = new Map<string, string>();
  if (checkpointIds.length > 0) {
    const { data: checkpoints } = await supabase
      .from("block_checkpoint")
      .select("id, block_key")
      .in("id", checkpointIds);
    for (const cp of checkpoints ?? []) {
      if (cp.id && cp.block_key) blockKeyByCheckpoint.set(cp.id, cp.block_key);
    }
  }

  // Reife-Scoring (SLC-178-Reuse): Flags aus Template + Trigger-Hits aus metadata.
  const template = await getTemplateById(supabase, session.template_id);
  const flags: Record<string, ReifeAmpelFlags> = {};
  for (const block of template?.blocks ?? []) {
    for (const q of block.questions ?? []) {
      flags[q.frage_id] = {
        owner_dependency: q.owner_dependency,
        deal_blocker: q.deal_blocker,
        sop_trigger: q.sop_trigger,
        ko_hart: q.ko_hart,
        ko_soft: q.ko_soft,
      };
    }
  }
  const metadata = (session.metadata ?? {}) as Record<string, unknown>;
  const triggerHitsMap =
    (metadata[MODUL_DELIVERY_TRIGGER_HITS_META_KEY] as
      | Record<string, unknown>
      | undefined) ?? {};
  const rawHits = triggerHitsMap[modulKey];
  const triggerHits: string[] = Array.isArray(rawHits)
    ? rawHits.filter((x): x is string => typeof x === "string")
    : [];
  const reife = computeModulReifeAmpel(flags, triggerHits);

  // Pure Auswahl + Mapping.
  const inputs: BridgeInput[] = outputs.map((o) => ({
    output: o as BridgeModulOutput,
    blockKey: o.block_checkpoint_id
      ? blockKeyByCheckpoint.get(o.block_checkpoint_id) ?? ""
      : "",
  }));
  const rows = mapModulOutputsToSopRows(inputs, {
    reife,
    triggerHitCount: triggerHits.length,
  });
  if (rows.length === 0) {
    return { ok: true, inserted: 0 };
  }

  // service_role-Upsert (sop hat keine authenticated-INSERT-Policy). Idempotent
  // ueber source_modul_output_id (MIG-130); .select() liefert nur NEU eingefuegte Rows.
  const admin = createAdminClient();
  const { data: insertedRows, error: upsertError } = await admin
    .from("sop")
    .upsert(
      rows.map((r) => ({ ...r, created_by: user.id })),
      { onConflict: "source_modul_output_id", ignoreDuplicates: true },
    )
    .select("id");
  if (upsertError) {
    return { ok: false, error: `sop-Upsert fehlgeschlagen: ${upsertError.message}` };
  }

  return { ok: true, inserted: insertedRows?.length ?? 0 };
}
