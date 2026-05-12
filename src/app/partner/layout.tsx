import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PartnerShell } from "./partner-shell";

/**
 * V6 SLC-102 MT-4 — Partner-Layout mit Rollen-Guard und Sidebar.
 *
 * V6 Strict-Mode: nur `partner_admin` darf in `/partner/*`. `strategaize_admin`
 * wird zur Cross-Tenant-Sicht `/admin/partners` weitergeleitet (V7+ kommt
 * Impersonate-Switch mit Tenant-Picker, das ist V6 nicht).
 *
 * Andere Rollen (`tenant_admin`, `tenant_member`, `employee`) werden auf ihre
 * eigene Landing-Page umgeleitet — die Middleware deckt das fuer den ersten
 * Request bereits ab, dieser Inline-Check ist Defense-in-Depth.
 *
 * Die `partner_organization`-Stammdaten werden hier (Layout) einmal gelesen
 * und an die Sidebar weitergereicht (display_name als Untertitel im
 * Title-Block). Service-role Client, weil wir hier zu einem fruehen Zeitpunkt
 * stabil lesen wollen — RLS-Variante ueber `createClient()` wuerde gleiche
 * Row liefern (`po_select_own_partner_admin` matched), aber das Service-Role-
 * Lookup ist robuster gegen Cookie-/Session-Anomalien beim ersten Login.
 */
export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email, tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");

  if (profile.role === "strategaize_admin") redirect("/admin/partners");
  if (profile.role === "tenant_admin") redirect("/dashboard");
  if (profile.role === "tenant_member") redirect("/dashboard");
  if (profile.role === "employee") redirect("/employee");
  if (profile.role !== "partner_admin") redirect("/login");
  if (!profile.tenant_id) redirect("/login");

  // Stammdaten via service-role lesen (RLS waere fuer partner_admin auch
  // OK, aber service-role bleibt cookie-/session-unabhaengig stabil).
  const admin = createAdminClient();
  const { data: partner } = await admin
    .from("partner_organization")
    .select("display_name")
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();

  return (
    <PartnerShell
      email={profile.email ?? undefined}
      partnerDisplayName={partner?.display_name ?? undefined}
    >
      {children}
    </PartnerShell>
  );
}
