// V6.3 SLC-105 MT-7 — Diagnose-Werkzeug Lade-Screen.
//
// Server-Component:
//   - Auth-Gate: Tenant-Match auf capture_session.
//   - Wenn Session bereits finalized: direkt zu /bericht.
//   - Wenn open/in_progress: zurueck zu /run (Mandant hat noch nicht eingereicht).
//   - Wenn submitted: rendert BerichtPendingPoller (Client-Component) der
//     alle 3s einen Status-Check macht.
//   - Wenn failed: Hinweis-Banner mit Re-Try-Optionen.
//
// Ref: docs/ARCHITECTURE.md V6.3 Phase 5 (Bericht-pending Polling).

import { redirect, notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BerichtPendingPoller } from "@/components/diagnose/BerichtPendingPoller";
import { TextOverrideProvider } from "@/components/text-override/Provider";
import { resolvePartnerOrgIdForTenant } from "@/lib/text-override/partner-org";
import { EditableText } from "@/components/text-override/EditableText";

interface PageProps {
  params: Promise<{ capture_session_id: string }>;
}

export const metadata = {
  title: "Diagnose-Bericht wird erstellt | Strategaize-Onboarding",
};

export default async function BerichtPendingPage(props: PageProps) {
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
    .select("id, tenant_id, status")
    .eq("id", sessionId)
    .single();
  if (!session) notFound();
  if (session.tenant_id !== profile.tenant_id) notFound();

  if (session.status === "finalized") {
    redirect(`/dashboard/diagnose/${sessionId}/bericht`);
  }
  if (session.status === "open" || session.status === "in_progress") {
    redirect(`/dashboard/diagnose/run/${sessionId}`);
  }

  const partnerOrgId = await resolvePartnerOrgIdForTenant(
    supabase,
    profile.tenant_id,
  );

  // status='failed' (Light-Pipeline-Fehler aus runLightPipeline.logFailure)
  if (session.status === "failed") {
    return (
      <TextOverrideProvider partnerOrgId={partnerOrgId} locale="de">
        <main className="mx-auto max-w-2xl px-6 py-16">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-red-600" />
                <CardTitle>
                  <EditableText
                    keyPath="diagnose.bericht_pending.failed.title"
                    defaultText="Bericht konnte nicht erstellt werden"
                  />
                </CardTitle>
              </div>
              <CardDescription>
                <EditableText
                  keyPath="diagnose.bericht_pending.failed.description"
                  defaultText="Bei der Verdichtung Ihrer Antworten ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut — Ihre Antworten sind weiterhin gespeichert."
                  multiline
                />
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild>
                <Link href={`/dashboard/diagnose/run/${sessionId}`}>
                  <EditableText
                    keyPath="diagnose.bericht_pending.failed.button"
                    defaultText="Zur Diagnose zurueck"
                  />
                </Link>
              </Button>
              <p className="text-xs text-slate-400">
                <EditableText
                  keyPath="diagnose.bericht_pending.failed.contact_hint"
                  defaultText="Wenn das Problem bestehen bleibt, kontaktieren Sie Strategaize."
                  multiline
                />
              </p>
            </CardContent>
          </Card>
        </main>
      </TextOverrideProvider>
    );
  }

  // status='submitted' → Polling im Client.
  return (
    <TextOverrideProvider partnerOrgId={partnerOrgId} locale="de">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
              <CardTitle>
                <EditableText
                  keyPath="diagnose.bericht_pending.title"
                  defaultText="Strategaize verdichtet Ihre Antworten"
                />
              </CardTitle>
            </div>
            <CardDescription>
              <EditableText
                keyPath="diagnose.bericht_pending.description"
                defaultText="Das dauert ueblicherweise 15-30 Sekunden. Wir erstellen einen kommentierten Bericht ueber sechs Bausteine — Sie werden gleich automatisch weitergeleitet."
                multiline
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BerichtPendingPoller sessionId={sessionId} />
            <p className="mt-4 text-xs text-slate-400">
              <EditableText
                keyPath="diagnose.bericht_pending.continue_hint"
                defaultText="Sie koennen diese Seite offen lassen oder spaeter zurueckkehren — sobald der Bericht fertig ist, ist er ueber das Dashboard erreichbar."
                multiline
              />
            </p>
          </CardContent>
        </Card>
      </main>
    </TextOverrideProvider>
  );
}
