// V10.4 SLC-189 MT-3 — Admin-UI: strategaize_berater anlegen + Tenants zuweisen.
// URL: /admin/berater. Exklusiv strategaize_admin.
//
// Auth-Gate Defense-in-Depth: admin/layout erlaubt strategaize_admin UND
// tenant_admin (TenantAdminShell). Berater-Verwaltung ist exklusiv
// strategaize_admin — daher zusaetzliche Inline-Pruefung (Pattern aus
// admin/partners/page.tsx). Die Server-Actions re-gaten zusaetzlich (actions.ts).
//
// Zuweisbare Tenants = Kanzlei (partner_organization) + Direkt-Kunde
// (direct_client). Mandanten (partner_client) werden NICHT einzeln angeboten —
// sie folgen automatisch der Kanzlei-Zuweisung (Cascade, DEC-268).

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/logger";
import { BeraterAdmin } from "./BeraterAdmin";

const TENANT_KIND_LABELS: Record<string, string> = {
  partner_organization: "Kanzlei",
  direct_client: "Direkt-Kunde",
};

export default async function AdminBeraterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") {
    redirect("/admin/tenants");
  }

  const admin = createAdminClient();

  let berater: Array<{ id: string; email: string; createdAt: string | null }> = [];
  let tenants: Array<{ id: string; name: string; kindLabel: string }> = [];
  let assignments: Array<{ beraterUserId: string; tenantId: string }> = [];
  let loadError: string | null = null;

  try {
    const [beraterRes, tenantsRes, assignmentsRes] = await Promise.all([
      admin
        .from("profiles")
        .select("id, email, created_at")
        .eq("role", "strategaize_berater")
        .order("created_at", { ascending: false }),
      admin
        .from("tenants")
        .select("id, name, tenant_kind")
        .in("tenant_kind", ["partner_organization", "direct_client"])
        .order("name", { ascending: true }),
      admin
        .from("berater_tenant_assignments")
        .select("berater_user_id, tenant_id"),
    ]);

    if (beraterRes.error) throw beraterRes.error;
    if (tenantsRes.error) throw tenantsRes.error;
    if (assignmentsRes.error) throw assignmentsRes.error;

    berater = (beraterRes.data ?? []).map((b) => ({
      id: b.id as string,
      email: b.email as string,
      createdAt: (b.created_at as string | null) ?? null,
    }));
    tenants = (tenantsRes.data ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      kindLabel: TENANT_KIND_LABELS[t.tenant_kind as string] ?? (t.tenant_kind as string),
    }));
    assignments = (assignmentsRes.data ?? []).map((a) => ({
      beraterUserId: a.berater_user_id as string,
      tenantId: a.tenant_id as string,
    }));
  } catch (err) {
    captureException(err, { source: "admin/berater/listPage", userId: user.id });
    loadError = "Berater-Daten konnten nicht geladen werden.";
  }

  return (
    <BeraterAdmin
      berater={berater}
      tenants={tenants}
      assignments={assignments}
      loadError={loadError}
    />
  );
}
