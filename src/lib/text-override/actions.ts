"use server";

// V7.1 SLC-136 MT-3 — Save/Reset-Server-Actions fuer Text-Overrides (FEAT-055, DEC-148).
//
// saveTextOverride: UPSERT in text_override + INSERT in text_override_history
//                   (action='create' bei neuem Key, action='update' bei bestehendem).
// resetTextOverride: DELETE in text_override + INSERT in text_override_history
//                    (action='delete'). No-Op wenn Row nicht existiert.
//
// Autorisierung via RLS (Migration 101 DEC-148):
//   - strategaize_admin: schreibt alle Scopes (global/template/partner=any)
//   - partner_admin:     schreibt nur scope='partner' mit scope_id=own-partner-org
//   - tenant-*:          KEIN Schreibrecht (RLS blockt + Inline-Auth-Check)
//
// Cache-Invalidate: invalidateOverrideCache(scope_id, locale) + revalidatePath.
//
// Audit-Pflicht (DSGVO + DEC-148): jede Save/Reset-Operation schreibt eine
// history-Row mit editor_id + editor_role + action + old_value + new_value.

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { invalidateOverrideCache, type TextOverrideScope } from "./resolver";
import type { UserRole } from "@/types/db";

// ============================================================
// Konstanten + Validation
// ============================================================

const TEXT_KEY_REGEX = /^[a-z0-9._]{1,200}$/;
const MAX_VALUE_LEN = 8000;
const VALID_SCOPES: ReadonlyArray<TextOverrideScope> = ["global", "template", "partner"];
const EDITOR_ROLES: ReadonlyArray<UserRole> = ["strategaize_admin", "partner_admin"];

export type SaveTextOverrideInput = {
  scope: TextOverrideScope;
  scopeId: string | null;
  textKey: string;
  newValue: string;
  locale?: string;
};

export type ResetTextOverrideInput = {
  scope: TextOverrideScope;
  scopeId: string | null;
  textKey: string;
  locale?: string;
};

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ============================================================
// Inputs validieren (lokal, vor RLS — schoenere Fehlermeldungen)
// ============================================================

function validateScope(input: { scope: unknown; scopeId: unknown }):
  | { ok: true; scope: TextOverrideScope; scopeId: string | null }
  | { ok: false; error: string } {
  if (!VALID_SCOPES.includes(input.scope as TextOverrideScope)) {
    return { ok: false, error: "invalid_scope" };
  }
  const scope = input.scope as TextOverrideScope;
  const scopeIdRaw = input.scopeId;
  const scopeId = typeof scopeIdRaw === "string" && scopeIdRaw.length > 0 ? scopeIdRaw : null;

  if (scope === "global" && scopeId !== null) {
    return { ok: false, error: "scope_id_must_be_null_for_global" };
  }
  if (scope !== "global" && scopeId === null) {
    return { ok: false, error: "scope_id_required_for_template_or_partner" };
  }
  return { ok: true, scope, scopeId };
}

function validateTextKey(textKey: unknown):
  | { ok: true; textKey: string }
  | { ok: false; error: string } {
  if (typeof textKey !== "string" || !TEXT_KEY_REGEX.test(textKey)) {
    return { ok: false, error: "invalid_text_key" };
  }
  return { ok: true, textKey };
}

function validateValueLength(value: string): { ok: true } | { ok: false; error: string } {
  if (value.length > MAX_VALUE_LEN) {
    return { ok: false, error: "value_too_long" };
  }
  return { ok: true };
}

// ============================================================
// Auth-Check: nur strategaize_admin + partner_admin duerfen editieren
// ============================================================

type EditorContext = {
  userId: string;
  role: UserRole;
  tenantId: string | null;
};

async function requireEditor(): Promise<
  { ok: true; editor: EditorContext } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (error || !profile) return { ok: false, error: "profile_not_found" };
  const role = profile.role as UserRole | undefined;
  if (!role || !EDITOR_ROLES.includes(role)) return { ok: false, error: "forbidden" };

  return {
    ok: true,
    editor: { userId: user.id, role, tenantId: (profile.tenant_id as string | null) ?? null },
  };
}

// ============================================================
// Path-Revalidation: Diagnose + Bericht + alle Override-haltigen Pages
// ============================================================
//
// V7.1-Scope: Diagnose-Run-Page + Bericht-Page + (kuenftig) Partner-Landing.
// Layout-Level revalidation, damit Server-Component-Reload Overrides
// neu laedt. Sehr breit — bewusst akzeptiert weil Edits selten sind und
// breaking-cache am Slice-Ende-Smoke verifiziert wird.

function revalidateOverridePaths(): void {
  revalidatePath("/dashboard/diagnose", "layout");
  revalidatePath("/diagnose", "layout");
  revalidatePath("/p", "layout");
  revalidatePath("/admin/text-overrides", "layout");
}

// ============================================================
// saveTextOverride: UPSERT + History (create | update)
// ============================================================

export async function saveTextOverride(
  input: SaveTextOverrideInput,
): Promise<ActionResult<{ created: boolean }>> {
  const scopeCheck = validateScope({ scope: input.scope, scopeId: input.scopeId });
  if (!scopeCheck.ok) return { ok: false, error: scopeCheck.error };
  const keyCheck = validateTextKey(input.textKey);
  if (!keyCheck.ok) return { ok: false, error: keyCheck.error };
  if (typeof input.newValue !== "string") return { ok: false, error: "invalid_value" };
  const valueCheck = validateValueLength(input.newValue);
  if (!valueCheck.ok) return { ok: false, error: valueCheck.error };
  const locale = typeof input.locale === "string" && input.locale.length > 0 ? input.locale : "de";

  const authCheck = await requireEditor();
  if (!authCheck.ok) return { ok: false, error: authCheck.error };
  const { editor } = authCheck;

  const supabase = await createClient();

  // 1) Bestehende Row pro (scope, scope_id, text_key, locale) lesen, damit
  // History-Eintrag old_value + action='create'|'update' korrekt setzen kann.
  // RLS-Filter sorgen dafuer dass partner_admin nur eigene Rows sieht.
  const existingQuery = supabase
    .from("text_override")
    .select("id, text_value")
    .eq("scope", scopeCheck.scope)
    .eq("text_key", keyCheck.textKey)
    .eq("locale", locale);
  const existingResult = scopeCheck.scopeId === null
    ? await existingQuery.is("scope_id", null).maybeSingle()
    : await existingQuery.eq("scope_id", scopeCheck.scopeId).maybeSingle();
  if (existingResult.error) return { ok: false, error: existingResult.error.message };

  const existing = existingResult.data as { id: string; text_value: string } | null;
  const isCreate = existing === null;
  const oldValue = existing?.text_value ?? null;

  // 2) Falls newValue identisch ist und Row existiert: keine History-Spam-Row.
  if (!isCreate && oldValue === input.newValue) {
    return { ok: true, data: { created: false } };
  }

  // 3) UPSERT in text_override. INSERT bei neuer Row, UPDATE bei bestehender.
  let overrideId: string;
  if (isCreate) {
    const { data: inserted, error: insErr } = await supabase
      .from("text_override")
      .insert({
        scope: scopeCheck.scope,
        scope_id: scopeCheck.scopeId,
        text_key: keyCheck.textKey,
        text_value: input.newValue,
        locale,
        updated_by: editor.userId,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      return { ok: false, error: insErr?.message ?? "insert_failed" };
    }
    overrideId = inserted.id as string;
  } else {
    const { data: updated, error: updErr } = await supabase
      .from("text_override")
      .update({
        text_value: input.newValue,
        updated_by: editor.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing!.id)
      .select("id")
      .single();
    if (updErr || !updated) {
      return { ok: false, error: updErr?.message ?? "update_failed" };
    }
    overrideId = updated.id as string;
  }

  // 4) History-Audit-INSERT. RLS-Policy text_override_history_insert_self
  // verlangt editor_id = auth.uid().
  const { error: histErr } = await supabase.from("text_override_history").insert({
    text_override_id: overrideId,
    scope: scopeCheck.scope,
    scope_id: scopeCheck.scopeId,
    text_key: keyCheck.textKey,
    locale,
    old_value: oldValue,
    new_value: input.newValue,
    editor_id: editor.userId,
    editor_role: editor.role,
    action: isCreate ? "create" : "update",
  });
  if (histErr) {
    return { ok: false, error: histErr.message };
  }

  // 5) Cache invalidieren + revalidatePath
  invalidateOverrideCache(scopeCheck.scopeId, locale);
  revalidateOverridePaths();

  return { ok: true, data: { created: isCreate } };
}

// ============================================================
// resetTextOverride: DELETE + History (action='delete'). No-Op bei missing.
// ============================================================

export async function resetTextOverride(
  input: ResetTextOverrideInput,
): Promise<ActionResult<{ existed: boolean }>> {
  const scopeCheck = validateScope({ scope: input.scope, scopeId: input.scopeId });
  if (!scopeCheck.ok) return { ok: false, error: scopeCheck.error };
  const keyCheck = validateTextKey(input.textKey);
  if (!keyCheck.ok) return { ok: false, error: keyCheck.error };
  const locale = typeof input.locale === "string" && input.locale.length > 0 ? input.locale : "de";

  const authCheck = await requireEditor();
  if (!authCheck.ok) return { ok: false, error: authCheck.error };
  const { editor } = authCheck;

  const supabase = await createClient();

  // 1) Existierende Row lesen — RLS filtert auf Sichtbarkeitsbereich.
  const existingQuery = supabase
    .from("text_override")
    .select("id, text_value")
    .eq("scope", scopeCheck.scope)
    .eq("text_key", keyCheck.textKey)
    .eq("locale", locale);
  const existingResult = scopeCheck.scopeId === null
    ? await existingQuery.is("scope_id", null).maybeSingle()
    : await existingQuery.eq("scope_id", scopeCheck.scopeId).maybeSingle();
  if (existingResult.error) return { ok: false, error: existingResult.error.message };

  const existing = existingResult.data as { id: string; text_value: string } | null;
  if (existing === null) {
    // No-Op: kein Override fuer diesen Key vorhanden, kein History-Eintrag noetig.
    return { ok: true, data: { existed: false } };
  }

  // 2) DELETE. RLS-Policy stellt sicher dass partner_admin nur own-partner-rows
  // loeschen kann.
  const { error: delErr } = await supabase
    .from("text_override")
    .delete()
    .eq("id", existing.id);
  if (delErr) return { ok: false, error: delErr.message };

  // 3) History-Audit-INSERT mit action='delete'. text_override_id wird auf NULL
  // gesetzt (Row geloescht), Rest aus altem Snapshot.
  const { error: histErr } = await supabase.from("text_override_history").insert({
    text_override_id: null,
    scope: scopeCheck.scope,
    scope_id: scopeCheck.scopeId,
    text_key: keyCheck.textKey,
    locale,
    old_value: existing.text_value,
    new_value: null,
    editor_id: editor.userId,
    editor_role: editor.role,
    action: "delete",
  });
  if (histErr) return { ok: false, error: histErr.message };

  // 4) Cache invalidieren + revalidatePath
  invalidateOverrideCache(scopeCheck.scopeId, locale);
  revalidateOverridePaths();

  return { ok: true, data: { existed: true } };
}
