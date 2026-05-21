// V6.3 SLC-105 MT-6 — Diagnose-Werkzeug Start-Page.
//
// Server-Component mit Auth-Gate:
//   - User eingeloggt + Profil vorhanden
//   - role='tenant_admin' (kein Strategaize-Admin, kein Employee)
//   - Tenant-Kind = 'partner_client' (Direkt-Kunden sehen Hinweis-Page)
//
// Bei Bestand einer laufenden Diagnose: Re-Direct in den passenden
// Folge-Pfad (start/run/bericht-pending/bericht — abhaengig vom Status).
//
// Layout: Branding-Header (Partner-Logo + Display-Name) + Welcome-Text +
// "Diagnose starten"-Button (Server-Action `startDiagnoseRun`).
//
// Ref: docs/ARCHITECTURE.md V6.3 Phase 1 (Run-Flow Auth-Gate + Branding).

import { redirect } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBrandingForTenant } from "@/lib/branding/resolve";
import { startDiagnoseRun } from "../actions";
import { TextOverrideProvider } from "@/components/text-override/Provider";
import { resolvePartnerOrgIdForTenant } from "@/lib/text-override/partner-org";
import { EditableText } from "@/components/text-override/EditableText";

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
    .select("id, tenant_id, role")
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
  if (
    profile.role !== "tenant_admin" ||
    !tenantRow ||
    tenantRow.tenant_kind !== "partner_client"
  ) {
    const partnerOrgIdGate = await resolvePartnerOrgIdForTenant(
      supabase,
      profile.tenant_id,
    );
    return (
      <TextOverrideProvider partnerOrgId={partnerOrgIdGate} locale="de">
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
      <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
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

        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            <EditableText
              keyPath="diagnose.start.heading"
              defaultText="Strategaize-Diagnose"
            />
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            <EditableText
              keyPath="diagnose.start.subheading"
              defaultText="Strukturierte Selbsteinschaetzung Ihrer Unternehmens-Reife. Wir fragen 24 Punkte entlang sechs Bausteine, jeweils mit fertigen Antwort-Optionen — Sie waehlen, was am ehesten zutrifft."
              multiline
            />
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <EditableText
                keyPath="diagnose.start.ablauf.title"
                defaultText="Ablauf"
              />
            </CardTitle>
            <CardDescription>
              <EditableText
                keyPath="diagnose.start.ablauf.description"
                defaultText="6 Bausteine x 4 Fragen = 24 Antworten. Dauer ca. 8-12 Minuten. Sie koennen jederzeit unterbrechen — der Stand bleibt gespeichert. Nach dem Abschicken erstellt Strategaize automatisch einen kommentierten Bericht."
                multiline
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={startDiagnoseRun}>
              <Button type="submit">
                <EditableText
                  keyPath="diagnose.start.start_button"
                  defaultText="Diagnose starten"
                />
              </Button>
            </form>
            <p className="mt-3 text-xs text-slate-400">
              <EditableText
                keyPath="diagnose.start.privacy_hint"
                defaultText="Keine menschliche Pruefung — Sie erhalten den Bericht direkt nach der Verdichtung. Strategaize speichert Ihre Antworten nur zur Generierung dieses Berichts."
                multiline
              />
            </p>
          </CardContent>
        </Card>
      </main>
    </TextOverrideProvider>
  );
}
