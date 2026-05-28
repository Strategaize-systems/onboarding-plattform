// V6.3 SLC-105 MT-6 — Diagnose-Werkzeug Run-Page.
//
// Server-Component:
//   - Auth-Gate: tenant_admin + tenant_kind='partner_client' + Session-Owner-Match.
//   - Laedt capture_session + template + bestehende Antworten.
//   - Status-Routing: submitted → /bericht-pending, finalized → /bericht.
//   - Sonst: rendert QuestionFlow (Client-Component).
//
// Ref: docs/ARCHITECTURE.md V6.3 Phase 2 (Run-Page mit QuestionFlow).

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuestionFlow } from "@/components/diagnose/QuestionFlow";
import { DiagnoseTelemetryProvider } from "@/components/diagnose/DiagnoseTelemetryProvider";
import { TextOverrideProvider } from "@/components/text-override/Provider";
import { AdminDemoBanner } from "@/components/admin/AdminDemoBanner";
import { resolvePartnerOrgIdForTenant } from "@/lib/text-override/partner-org";
import { EditableText } from "@/components/text-override/EditableText";
import type {
  TemplateBlock,
} from "@/workers/condensation/light-pipeline";

interface PageProps {
  params: Promise<{ capture_session_id: string }>;
}

export const metadata = {
  title: "Diagnose laeuft | Strategaize-Onboarding",
};

export default async function DiagnoseRunPage(props: PageProps) {
  const { capture_session_id: sessionId } = await props.params;

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

  const { data: session } = await admin
    .from("capture_session")
    .select("id, tenant_id, template_id, owner_user_id, status, answers")
    .eq("id", sessionId)
    .single();
  if (!session) notFound();
  if (session.tenant_id !== profile.tenant_id) notFound();

  // Tenant-Kind guard (Direkt-Kunden duerfen die Run-Page nicht oeffnen
  // auch wenn jemand die URL kennt).
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("name, tenant_kind")
    .eq("id", profile.tenant_id ?? "")
    .single();
  if (!tenantRow || tenantRow.tenant_kind !== "partner_client") {
    notFound();
  }

  // Status-Routing: bei submitted → bericht-pending, bei finalized → bericht.
  if (session.status === "submitted") {
    redirect(`/dashboard/diagnose/${sessionId}/bericht-pending`);
  }
  if (session.status === "finalized") {
    redirect(`/dashboard/diagnose/${sessionId}/bericht`);
  }

  const { data: template } = await admin
    .from("template")
    .select("id, name, blocks, metadata")
    .eq("id", session.template_id)
    .single();
  if (!template) notFound();

  const blocks = template.blocks as TemplateBlock[];
  const answers = (session.answers as Record<string, string>) ?? {};

  const partnerOrgId = await resolvePartnerOrgIdForTenant(
    supabase,
    profile.tenant_id,
  );

  return (
    <TextOverrideProvider partnerOrgId={partnerOrgId} locale="de">
      <DiagnoseTelemetryProvider captureSessionId={sessionId}>
        <AdminDemoBanner role={profile.role} tenantName={tenantRow.name as string} />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          <header className="mb-6 sm:mb-8">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              <EditableText
                keyPath="template.partner_diagnostic.name"
                defaultText={template.name as string}
              />
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              <EditableText
                keyPath="diagnose.run.intro_text"
                defaultText="Beantworten Sie die Fragen ehrlich. Es gibt keine richtigen oder falschen Antworten — nur ein klareres Bild Ihrer Lage."
                multiline
              />
            </p>
          </header>

          <QuestionFlow
            sessionId={sessionId}
            blocks={blocks}
            initialAnswers={answers}
          />
        </main>
      </DiagnoseTelemetryProvider>
    </TextOverrideProvider>
  );
}
