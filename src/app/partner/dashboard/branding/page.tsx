import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { captureException } from "@/lib/logger";
import { BrandingEditor } from "./BrandingEditor";

/**
 * V6 SLC-104 MT-8 — Partner-Branding-Edit-Page (partner_admin).
 *
 * Sektionen (BrandingEditor):
 *   - Logo: Upload (PNG/SVG/JPG max 500KB) + clientseitige Vorschau
 *   - Farben + Anzeigename: Primary-Hex (Default #4454b8 per DEC-113), Secondary-Hex,
 *     Display-Name. WCAG-AA-Contrast-Heuristik clientseitig (Warning bei < 4.5:1).
 *   - Live-Preview: Mini-Mockup eines Mandanten-Dashboards mit aktuellen Werten.
 *
 * Defense-in-Depth (zusaetzlich zur Layout-Auth):
 *   - Inline-Auth-Check (User existiert + role='partner_admin' + tenant_id)
 *   - Tenant-Filter im Branding-Lookup (partner_tenant_id = profile.tenant_id)
 *   - Falls Backfill nicht griff (Edge-Case): Page rendert mit DB-Default-Werten.
 */

const STRATEGAIZE_DEFAULT_PRIMARY = "#4454b8"; // DEC-113 / Migration 091a Style Guide V2

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PartnerBrandingPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const updated = sp.updated === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "partner_admin" || !profile.tenant_id) {
    redirect("/login");
  }

  const tenantId = profile.tenant_id;
  const admin = createAdminClient();

  const { data: branding, error: brandingErr } = await admin
    .from("partner_branding_config")
    .select("logo_url, primary_color, secondary_color, display_name, updated_at")
    .eq("partner_tenant_id", tenantId)
    .maybeSingle();

  if (brandingErr) {
    captureException(brandingErr, {
      source: "partner/dashboard/branding/loadBranding",
      userId: user.id,
      metadata: { tenantId },
    });
  }

  const initial = {
    logoUrl: branding?.logo_url ?? null,
    primaryColor: branding?.primary_color ?? STRATEGAIZE_DEFAULT_PRIMARY,
    secondaryColor: branding?.secondary_color ?? null,
    displayName: branding?.display_name ?? "",
  };

  // Cache-Buster aus updated_at-Timestamp (deterministisch, render-pure).
  // Stellt sicher, dass nach uploadLogo der neue Bild-Bytestream geladen wird,
  // statt das 1h-gecachete alte Bild aus MT-7-Proxy.
  const cacheBuster = branding?.updated_at
    ? new Date(branding.updated_at).getTime().toString()
    : "0";
  const logoSrc = initial.logoUrl
    ? `/api/partner-branding/${tenantId}/logo?v=${cacheBuster}`
    : null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <div>
        <Link
          href="/partner/dashboard"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Zurueck zum Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Branding bearbeiten
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Lege Logo, Akzentfarbe und Anzeigename fest. Deine Mandanten sehen
          dieses Branding ab dem naechsten Login.
        </p>
      </div>

      {updated && (
        <Alert>
          <AlertDescription>Branding gespeichert.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Aenderungen werden sofort fuer neue Sessions wirksam. Logos werden
            ueber einen geschuetzten Server-Proxy ausgeliefert.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandingEditor
            tenantId={tenantId}
            initialLogoSrc={logoSrc}
            initialPrimaryColor={initial.primaryColor}
            initialSecondaryColor={initial.secondaryColor}
            initialDisplayName={initial.displayName}
          />
        </CardContent>
      </Card>
    </div>
  );
}
