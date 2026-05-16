// V6.3 SLC-105 MT-8 — Diagnose-Werkzeug Bericht-Page.
//
// Server-Component, drei Auth-Gates kompatibel:
//   1. Mandant selbst (tenant_admin + tenant_id-Match auf capture_session.tenant_id)
//   2. Partner-Admin (capture_session.tenant_id -> tenants.parent_partner_tenant_id == user.tenant_id)
//   3. Strategaize-Admin (role='strategaize_admin', cross-tenant)
//
// Daten-Load:
//   - capture_session + template (Blocks + metadata)
//   - knowledge_unit-Liste pro Block (status='accepted', source='questionnaire')
//   - Partner-Branding (Reuse SLC-104 Resolver)
//   - SLC-106 Lead-Push-Status fuer "Ich will mehr"-Karte
//
// Render via Client-Component BerichtRenderer (Print-Button erfordert "use client").
//
// Ref: docs/ARCHITECTURE.md V6.3 Phase 6 (Bericht-Page Render).

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBrandingForTenant, STRATEGAIZE_DEFAULT_BRANDING } from "@/lib/branding/resolve";
import { BerichtRenderer } from "@/components/diagnose/BerichtRenderer";
import type { TemplateBlock } from "@/workers/condensation/light-pipeline";

interface PageProps {
  params: Promise<{ capture_session_id: string }>;
}

export const metadata = {
  title: "Diagnose-Bericht | Strategaize-Onboarding",
};

export default async function BerichtPage(props: PageProps) {
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
    .select("id, tenant_id, template_id, status, updated_at")
    .eq("id", sessionId)
    .single();
  if (!session) notFound();
  if (session.status !== "finalized") {
    // Bericht nur sichtbar wenn Light-Pipeline durch ist.
    redirect(`/dashboard/diagnose/${sessionId}/bericht-pending`);
  }

  // Auth-Matrix: Mandant + Partner-Admin + Strategaize-Admin.
  let authorized = false;
  if (profile.role === "strategaize_admin") {
    authorized = true;
  } else if (session.tenant_id === profile.tenant_id) {
    authorized = true;
  } else if (profile.role === "tenant_admin" && profile.tenant_id) {
    const { data: ownerTenant } = await admin
      .from("tenants")
      .select("parent_partner_tenant_id")
      .eq("id", session.tenant_id)
      .single();
    if (
      ownerTenant?.parent_partner_tenant_id === profile.tenant_id
    ) {
      authorized = true;
    }
  }
  if (!authorized) notFound();

  // Template + KUs + Branding parallel laden.
  const [templateRes, kusRes, mandantTenantRes] = await Promise.all([
    admin
      .from("template")
      .select("name, blocks, metadata")
      .eq("id", session.template_id)
      .single(),
    admin
      .from("knowledge_unit")
      .select("block_key, title, body, metadata, created_at")
      .eq("capture_session_id", sessionId)
      .eq("status", "accepted")
      .order("created_at", { ascending: true }),
    admin
      .from("tenants")
      .select("name")
      .eq("id", session.tenant_id)
      .single(),
  ]);

  const template = templateRes.data as
    | {
        name: string;
        blocks: TemplateBlock[];
        metadata: { required_closing_statement?: string } & Record<string, unknown>;
      }
    | null;
  if (!template) notFound();

  const kus = (kusRes.data ?? []) as Array<{
    block_key: string;
    title: string;
    body: string;
    metadata: Record<string, unknown>;
  }>;

  // Branding via Mandant-tenant_id (SLC-104 Resolver traversiert ueber RPC zu
  // partner_organization). Wenn Partner- oder Strategaize-Admin den Bericht
  // oeffnet, soll trotzdem Partner-Branding des Mandanten gezeigt werden —
  // daher Branding immer fuer session.tenant_id, NICHT fuer profile.tenant_id.
  const branding = await resolveBrandingForTenant(supabase, session.tenant_id);
  const partnerDisplayName =
    branding.displayName &&
    branding.displayName !== STRATEGAIZE_DEFAULT_BRANDING.displayName
      ? branding.displayName
      : null;

  // Blocks zusammenstellen: Template-Reihenfolge + KU.score + KU.comment.
  const kuByBlock = new Map<string, { score: number; comment: string }>();
  for (const ku of kus) {
    const m = ku.metadata as { score?: number; comment?: string };
    if (typeof m.score === "number" && typeof m.comment === "string") {
      kuByBlock.set(ku.block_key, { score: m.score, comment: m.comment });
    }
  }

  const blockRows = template.blocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((block) => {
      const ku = kuByBlock.get(block.key);
      return {
        key: block.key,
        title: block.title,
        intro: block.intro,
        score: ku?.score ?? 0,
        comment: ku?.comment ?? "Keine Verdichtung verfuegbar.",
      };
    });

  // SLC-106 Lead-Push-Stub-Karte: zeige nur fuer den Mandanten selbst, nicht
  // fuer Partner-Admin/Strategaize-Admin (die haben keinen Lead-Push-Trigger).
  let ichWillMehrCaptureSessionId: string | null = null;
  if (session.tenant_id === profile.tenant_id) {
    const { data: existingConsent } = await admin
      .from("lead_push_consent")
      .select("id")
      .eq("capture_session_id", sessionId)
      .maybeSingle();
    if (!existingConsent) {
      ichWillMehrCaptureSessionId = sessionId;
    }
  }

  return (
    <BerichtRenderer
      mandantName={(mandantTenantRes.data?.name as string) ?? "Ihr Unternehmen"}
      partnerDisplayName={partnerDisplayName}
      partnerLogoUrl={branding.logoUrl}
      finalizedAt={session.updated_at as string}
      blocks={blockRows}
      closingStatement={
        template.metadata.required_closing_statement ?? ""
      }
      ichWillMehrCaptureSessionId={ichWillMehrCaptureSessionId}
    />
  );
}
