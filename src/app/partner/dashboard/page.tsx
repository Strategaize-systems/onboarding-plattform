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
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users } from "lucide-react";
import { captureException } from "@/lib/logger";

/**
 * V6 SLC-102 MT-4 — Partner-Admin-Dashboard.
 *
 * Sektionen:
 *   1. Begruessung mit partner_organization.display_name
 *   2. Mandanten-Karte (V6 leer — Mandanten-Einladung kommt mit SLC-103)
 *   3. Stammdaten-Karte (legal_name + display_name + contact_email + country
 *      mit Link zu /partner/dashboard/stammdaten — Edit-Page kommt mit MT-5)
 *
 * Auth-Gate: nur partner_admin, durch das partner/layout.tsx schon erzwungen.
 * Hier zusaetzlich Inline-Check (Defense-in-Depth + sauberer Fail-Pfad falls
 * das Layout-Routing einen Edge-Case verfehlt).
 */

const COUNTRY_LABELS: Record<string, string> = {
  DE: "Deutschland",
  NL: "Niederlande",
};

export default async function PartnerDashboardPage() {
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

  // Stammdaten
  const { data: partner, error: partnerErr } = await admin
    .from("partner_organization")
    .select(
      "tenant_id, legal_name, display_name, contact_email, contact_phone, country, partner_kind",
    )
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();

  if (partnerErr) {
    captureException(partnerErr, {
      source: "partner/dashboard/loadPartner",
      userId: user.id,
      metadata: { tenantId: profile.tenant_id },
    });
  }

  // Mandanten-Count fuer "noch keine Mandanten"-State (V6 typisch 0)
  let acceptedClientCount = 0;
  try {
    const { count, error: cErr } = await admin
      .from("partner_client_mapping")
      .select("id", { count: "exact", head: true })
      .eq("partner_tenant_id", profile.tenant_id)
      .eq("invitation_status", "accepted");
    if (cErr) throw cErr;
    acceptedClientCount = count ?? 0;
  } catch (err) {
    captureException(err, {
      source: "partner/dashboard/countClients",
      userId: user.id,
      metadata: { tenantId: profile.tenant_id },
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Willkommen{partner?.display_name ? `, ${partner.display_name}` : ""}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Dein Partner-Bereich. Verwalte Mandanten, Stammdaten und Branding.
        </p>
      </div>

      {!partner && (
        <Alert variant="destructive">
          <AlertDescription>
            Stammdaten konnten nicht geladen werden. Bitte spaeter erneut
            versuchen oder Strategaize kontaktieren.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Meine Mandanten</CardTitle>
          <CardDescription>
            {acceptedClientCount === 0
              ? "Noch keinen Mandanten eingeladen."
              : `${acceptedClientCount} aktive${acceptedClientCount === 1 ? "r Mandant" : " Mandanten"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {acceptedClientCount === 0 ? (
            <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-slate-100 p-3">
                  <Users className="h-5 w-5 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    Sie haben noch keinen Mandanten eingeladen.
                  </p>
                  <p className="text-sm text-slate-500">
                    Mandanten-Einladungen werden mit dem naechsten Update
                    freigeschaltet.
                  </p>
                </div>
              </div>
              <Button disabled title="Verfuegbar nach SLC-103-Deploy">
                Mandant einladen (verfuegbar nach SLC-103)
              </Button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Du hast {acceptedClientCount} aktive{acceptedClientCount === 1 ? "n" : ""} Mandanten. Die
              Detailansicht folgt mit dem naechsten Update.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
          <CardDescription>
            Kanzlei-Informationen, die Strategaize ueber dich gespeichert hat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {partner ? (
            <div className="space-y-4">
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
                    Anzeigename
                  </dt>
                  <dd className="mt-1 text-sm text-slate-900">
                    {partner.display_name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Kontakt-E-Mail
                  </dt>
                  <dd className="mt-1 text-sm text-slate-900">
                    {partner.contact_email}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Telefon
                  </dt>
                  <dd className="mt-1 text-sm text-slate-900">
                    {partner.contact_phone ?? "—"}
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
              <div className="pt-2">
                <Link href="/partner/dashboard/stammdaten">
                  <Button variant="outline">Stammdaten bearbeiten</Button>
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Stammdaten sind aktuell nicht verfuegbar.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
