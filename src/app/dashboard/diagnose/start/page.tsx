// V6.3 SLC-105 MT-6 — Diagnose-Werkzeug Start-Page.
// V7.3 SLC-140 MT-2 — Look-Polish nach Style Guide V2:
//   HeroSection + ThreeStepsBlock + StartCTA als separate Components.
//   Auth-Gate-Logik + Tenant-Kind-Check + Redirect-Handling UNVERAENDERT.
//
// Server-Component mit Auth-Gate:
//   - User eingeloggt + Profil vorhanden
//   - role='tenant_admin' (kein Strategaize-Admin, kein Employee)
//   - Tenant-Kind = 'partner_client' (Direkt-Kunden sehen Hinweis-Page)
//
// Bei Bestand einer laufenden Diagnose: Re-Direct in den passenden
// Folge-Pfad (start/run/bericht-pending/bericht — abhaengig vom Status).
//
// Layout: Partner-Branding-Header (Logo + Steuerberater-Name) + Hero +
// 3-Schritte-Block + Start-CTA mit Loading-Indicator. Direkt-Kunden-Gate
// bleibt minimaler Card-Hinweis (kein voller Polish noetig).
//
// Ref: docs/ARCHITECTURE.md V6.3 Phase 1 (Run-Flow Auth-Gate + Branding).
// Ref: slices/SLC-140-look-feel-polish.md MT-2.

import { redirect } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBrandingForTenant } from "@/lib/branding/resolve";
import { TextOverrideProvider } from "@/components/text-override/Provider";
import { resolvePartnerOrgIdForTenant } from "@/lib/text-override/partner-org";
import { EditableText } from "@/components/text-override/EditableText";
import { HeroSection } from "./components/HeroSection";
import { ThreeStepsBlock } from "./components/ThreeStepsBlock";
import { StartCTA } from "./components/StartCTA";
import { AdminDemoBanner } from "@/components/admin/AdminDemoBanner";
import { MandantHeader } from "@/components/dashboard/MandantHeader";

export const metadata = {
  title: "Strategaize-Diagnose | Onboarding",
  description:
    "Strukturierte Diagnose Ihrer Unternehmens-Reife — 24 Fragen, ca. 8-12 Minuten.",
};

export default async function DiagnoseStartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, role, email")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");

  const admin = createAdminClient();
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("name, tenant_kind, parent_partner_tenant_id")
    .eq("id", profile.tenant_id ?? "")
    .single();

  // Direkt-Kunden-Hinweis (kein partner_client → Diagnose nicht verfuegbar).
  // V7.5 SLC-145: strategaize_admin mit zugewiesenem partner_client-Tenant
  // wird wie tenant_admin behandelt (Demo-Mode mit EditableText-Pencils).
  const isPartnerClientMember =
    (profile.role === "tenant_admin" || profile.role === "strategaize_admin") &&
    !!tenantRow &&
    tenantRow.tenant_kind === "partner_client";
  if (!isPartnerClientMember) {
    const partnerOrgIdGate = await resolvePartnerOrgIdForTenant(
      supabase,
      profile.tenant_id,
    );
    return (
      <TextOverrideProvider partnerOrgId={partnerOrgIdGate} locale="de">
        <MandantHeader email={profile.email} role={profile.role} />
        <main className="mx-auto max-w-2xl px-6 py-16">
          <Card>
            <CardHeader>
              <CardTitle>
                <EditableText
                  keyPath="diagnose.start.gate.title"
                  defaultText="Diagnose-Werkzeug"
                />
              </CardTitle>
              <CardDescription>
                <EditableText
                  keyPath="diagnose.start.gate.description"
                  defaultText="Aktuell nur fuer Mandanten ueber einen Partner-Steuerberater verfuegbar."
                  multiline
                />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">
                <EditableText
                  keyPath="diagnose.start.gate.hint"
                  defaultText="Direkt-Kunden erhalten die Diagnose in einer kuenftigen Version. Bei Fragen wenden Sie sich an Strategaize."
                  multiline
                />
              </p>
            </CardContent>
          </Card>
        </main>
      </TextOverrideProvider>
    );
  }

  // Bestehende Diagnose-Session re-using (status-spezifischer Redirect).
  // V6.4 SLC-130: Lookup auf "newest version pro slug" — Migration 096 erlaubt
  // mehrere Template-Versions. Neue Sessions verwenden immer die juengste.
  const { data: template } = await admin
    .from("template")
    .select("id")
    .eq("slug", "partner_diagnostic")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (template?.id) {
    const { data: existing } = await admin
      .from("capture_session")
      .select("id, status")
      .eq("tenant_id", profile.tenant_id ?? "")
      .eq("template_id", template.id)
      .in("status", ["submitted", "finalized"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.status === "submitted") {
      redirect(`/dashboard/diagnose/${existing.id}/bericht-pending`);
    }
    if (existing?.status === "finalized") {
      redirect(`/dashboard/diagnose/${existing.id}/bericht`);
    }
  }

  // Partner-Branding fuer Header (Reuse SLC-104 Resolver).
  const branding = await resolveBrandingForTenant(
    supabase,
    profile.tenant_id ?? "",
  );

  const partnerOrgId = await resolvePartnerOrgIdForTenant(
    supabase,
    profile.tenant_id,
  );

  return (
    <TextOverrideProvider partnerOrgId={partnerOrgId} locale="de">
      <AdminDemoBanner role={profile.role} tenantName={tenantRow?.name as string | undefined} />
      <MandantHeader email={profile.email} role={profile.role} />
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6 sm:py-12">
        {branding.displayName ? (
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                <Image
                  src={branding.logoUrl}
                  alt={`${branding.displayName} Logo`}
                  width={48}
                  height={48}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              </div>
            ) : null}
            <span className="text-sm text-slate-500">
              <EditableText
                keyPath="diagnose.start.steuerberater_label"
                defaultText="Ihr Steuerberater:"
              />{" "}
              <span className="font-medium text-slate-700">
                {branding.displayName}
              </span>
            </span>
          </div>
        ) : null}

        <HeroSection />

        <ThreeStepsBlock />

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <StartCTA />
        </div>
      </main>
    </TextOverrideProvider>
  );
}
