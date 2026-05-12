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
import { EditStammdatenForm } from "./EditStammdatenForm";

/**
 * V6 SLC-102 MT-5 — Partner-Stammdaten-Edit-Page (partner_admin).
 *
 * Editierbar (per updatePartnerStammdaten Server Action):
 *   - display_name
 *   - contact_email
 *   - contact_phone
 *
 * Read-only (nur strategaize_admin via /admin/partners/[id]):
 *   - legal_name
 *   - country
 *   - partner_kind
 *
 * Defense-in-Depth: Layout enforced bereits partner_admin-only — hier
 * zusaetzlich Inline-Check und Tenant-Filter im Lookup.
 */

const COUNTRY_LABELS: Record<string, string> = {
  DE: "Deutschland",
  NL: "Niederlande",
};

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PartnerStammdatenPage({ searchParams }: PageProps) {
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

  const admin = createAdminClient();
  const { data: partner, error: partnerErr } = await admin
    .from("partner_organization")
    .select(
      "tenant_id, legal_name, display_name, contact_email, contact_phone, country, partner_kind",
    )
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();

  if (partnerErr) {
    captureException(partnerErr, {
      source: "partner/dashboard/stammdaten/loadPartner",
      userId: user.id,
      metadata: { tenantId: profile.tenant_id },
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div>
        <Link
          href="/partner/dashboard"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Zurueck zum Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Stammdaten bearbeiten
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Du kannst Anzeigename, Kontakt-E-Mail und Telefon aktualisieren.
          Rechtlicher Name und Land werden zentral von Strategaize gepflegt.
        </p>
      </div>

      {updated && (
        <Alert>
          <AlertDescription>Stammdaten gespeichert.</AlertDescription>
        </Alert>
      )}

      {!partner ? (
        <Alert variant="destructive">
          <AlertDescription>
            Stammdaten konnten nicht geladen werden. Bitte spaeter erneut
            versuchen oder Strategaize kontaktieren.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Strategaize-zentral</CardTitle>
              <CardDescription>
                Diese Felder werden zentral gepflegt und sind hier nur zur
                Referenz sichtbar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Kanzlei (rechtlich)
                  </dt>
                  <dd className="mt-1 text-sm text-slate-900">
                    {partner.legal_name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Land
                  </dt>
                  <dd className="mt-1 text-sm text-slate-900">
                    {COUNTRY_LABELS[partner.country] ?? partner.country}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Partner-Typ
                  </dt>
                  <dd className="mt-1 text-sm text-slate-900">
                    {partner.partner_kind === "tax_advisor"
                      ? "Steuerberater"
                      : partner.partner_kind}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bearbeitbar</CardTitle>
              <CardDescription>
                Diese Felder kannst du selbst aendern.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EditStammdatenForm
                initialDisplayName={partner.display_name}
                initialContactEmail={partner.contact_email}
                initialContactPhone={partner.contact_phone ?? ""}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
