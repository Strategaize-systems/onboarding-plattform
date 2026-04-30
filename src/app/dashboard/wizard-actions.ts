"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// SLC-046 MT-2 — V4.2 Wizard Server-Actions
// DEC-051: nur tenant_admin darf den Wizard ausfuehren (Cross-Role-Check).
// DEC-052..056: Multi-Admin-Lock via atomares UPDATE mit WHERE state='pending'.
// State-Maschine: pending -> started -> (skipped|completed). step bewegt sich 1..4 nur in 'started'.
//
// Fix 2026-04-30: tenants-Tabelle hat KEINE UPDATE-RLS-Policy fuer tenant_admin
// (nur SELECT). UPDATEs durch tenant_admin returnen 0 Rows silent. Alle UPDATE-
// Aufrufe nutzen jetzt den Service-Role-Client; Auth-Check (Cross-Role) passiert
// vorher mit dem RLS-aware Client in requireTenantAdmin.

type ActionOk<T extends Record<string, unknown> = Record<string, unknown>> = {
  ok: true;
} & T;
type ActionErr = {
  ok: false;
  error:
    | "unauthenticated"
    | "profile_not_found"
    | "forbidden"
    | "tenant_not_found"
    | "step_invalid"
    | "wrong_state"
    | "update_failed";
};

type StartedResult = ActionOk<{ alreadyStarted: boolean }> | ActionErr;
type SimpleResult = { ok: true } | ActionErr;

/**
 * Liefert den authentifizierten tenant_admin + dessen tenant_id.
 * DEC-051 Cross-Role-Check: strategaize_admin / tenant_member / employee werden hier abgelehnt.
 */
async function requireTenantAdmin(): Promise<
  | { user: { id: string }; tenantId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { error: ActionErr["error"] }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "profile_not_found" };
  if (profile.role !== "tenant_admin") return { error: "forbidden" };
  if (!profile.tenant_id) return { error: "tenant_not_found" };

  return { user: { id: user.id }, tenantId: profile.tenant_id, supabase };
}

/**
 * Atomar: setzt onboarding_wizard_state='started' nur wenn aktuell 'pending'.
 * Multi-Admin-Lock-Race: zwei parallele Aufrufe → einer bekommt rowCount=1 (alreadyStarted=false),
 * der andere rowCount=0 (alreadyStarted=true).
 */
export async function setWizardStarted(): Promise<StartedResult> {
  const ctx = await requireTenantAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenants")
    .update({ onboarding_wizard_state: "started", onboarding_wizard_step: 1 })
    .eq("id", ctx.tenantId)
    .eq("onboarding_wizard_state", "pending")
    .select("id");

  if (error) return { ok: false, error: "update_failed" };

  const alreadyStarted = !data || data.length === 0;
  if (!alreadyStarted) revalidatePath("/dashboard");
  return { ok: true, alreadyStarted };
}

/**
 * Setzt onboarding_wizard_step. Nur in state='started' erlaubt.
 */
export async function setWizardStep(step: 1 | 2 | 3 | 4): Promise<SimpleResult> {
  if (![1, 2, 3, 4].includes(step)) return { ok: false, error: "step_invalid" };

  const ctx = await requireTenantAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenants")
    .update({ onboarding_wizard_step: step })
    .eq("id", ctx.tenantId)
    .eq("onboarding_wizard_state", "started")
    .select("id");

  if (error) return { ok: false, error: "update_failed" };
  if (!data || data.length === 0) return { ok: false, error: "wrong_state" };

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Setzt onboarding_wizard_state='skipped'. Erlaubt aus 'pending' oder 'started'.
 */
export async function setWizardSkipped(): Promise<SimpleResult> {
  const ctx = await requireTenantAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenants")
    .update({ onboarding_wizard_state: "skipped" })
    .eq("id", ctx.tenantId)
    .in("onboarding_wizard_state", ["pending", "started"])
    .select("id");

  if (error) return { ok: false, error: "update_failed" };
  if (!data || data.length === 0) return { ok: false, error: "wrong_state" };

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Setzt onboarding_wizard_state='completed' + completed_at=now(). Nur aus 'started' erlaubt.
 */
export async function setWizardCompleted(): Promise<SimpleResult> {
  const ctx = await requireTenantAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenants")
    .update({
      onboarding_wizard_state: "completed",
      onboarding_wizard_completed_at: new Date().toISOString(),
    })
    .eq("id", ctx.tenantId)
    .eq("onboarding_wizard_state", "started")
    .select("id");

  if (error) return { ok: false, error: "update_failed" };
  if (!data || data.length === 0) return { ok: false, error: "wrong_state" };

  revalidatePath("/dashboard");
  return { ok: true };
}
