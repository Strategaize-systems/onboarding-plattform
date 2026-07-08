// V10.2 SLC-184 MT-2 — Server-Actions fuer die RAG-Frage-Antwort im Berater-Workspace.
//
// Zwei Actions: askRagAction (Frage → Antwort+Quellen+Coverage) und reembedTenantAction
// (Coverage-Luecke schliessen). BEIDE re-gaten strategaize_admin VOR createAdminClient
// (R-184-4 / security-audit-fable5-standard: Server-Actions sind eigenstaendige
// Entry-Points). Der tenant_id wird server-seitig gegen die tenants-Tabelle validiert
// und NIE ungeprueft aus dem Client uebernommen (DEC-258, fail-closed).

"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveWorkspaceScope } from "@/lib/workspace/workspace-scope";
import {
  askRag,
  reembedTenantKnowledge,
  type RagCoverage,
  type RagSource,
} from "@/lib/workspace/rag";

export type AskRagActionResult =
  | {
      ok: true;
      answer: string | null;
      sources: RagSource[];
      coverage: RagCoverage;
    }
  | { ok: false; error: "unauthorized" | "no_tenant" | "empty_question" | "failed" };

/**
 * Validiert, dass der uebergebene tenantId ein echter Mandant ist. Fail-closed:
 * leerer/unbekannter tenantId → null (DEC-258; nie ungeprueft aus dem Client).
 *
 * V10.4 SLC-190: Bei gesetztem `allowedTenantIds` (Berater) muss der Tenant
 * zusaetzlich in der Zuweisungs-Menge liegen — sonst null (fail-closed, DEC-270).
 * undefined (Admin) => keine zusaetzliche Einschraenkung.
 */
async function bindTenant(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: unknown,
  allowedTenantIds: string[] | undefined,
): Promise<string | null> {
  if (typeof tenantId !== "string" || tenantId.trim().length === 0) return null;
  if (allowedTenantIds !== undefined && !allowedTenantIds.includes(tenantId)) {
    return null;
  }
  const { data } = await admin
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .maybeSingle();
  return data ? tenantId : null;
}

export async function askRagAction(
  tenantId: string,
  question: string,
): Promise<AskRagActionResult> {
  const scope = await resolveWorkspaceScope();
  if (!scope) return { ok: false, error: "unauthorized" };

  const trimmed = typeof question === "string" ? question.trim() : "";
  if (trimmed.length === 0) return { ok: false, error: "empty_question" };

  const admin = createAdminClient();
  const boundTenant = await bindTenant(admin, tenantId, scope.allowedTenantIds);
  if (!boundTenant) return { ok: false, error: "no_tenant" };

  const outcome = await askRag(admin, boundTenant, trimmed);
  if (!outcome.ok) return { ok: false, error: "failed" };

  return {
    ok: true,
    answer: outcome.result.answer,
    sources: outcome.result.sources,
    coverage: outcome.result.coverage,
  };
}

export type ReembedActionResult =
  | { ok: true; embedded: number }
  | { ok: false; error: "unauthorized" | "no_tenant" | "failed" };

export async function reembedTenantAction(
  tenantId: string,
): Promise<ReembedActionResult> {
  const scope = await resolveWorkspaceScope();
  if (!scope) return { ok: false, error: "unauthorized" };

  const admin = createAdminClient();
  const boundTenant = await bindTenant(admin, tenantId, scope.allowedTenantIds);
  if (!boundTenant) return { ok: false, error: "no_tenant" };

  const res = await reembedTenantKnowledge(admin, boundTenant);
  if (!res.ok) return { ok: false, error: "failed" };
  return { ok: true, embedded: res.embedded };
}
