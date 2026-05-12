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
import { Plus, Users } from "lucide-react";
import { captureException } from "@/lib/logger";

/**
 * V6 SLC-102 MT-4 — Partner-Admin-Dashboard.
 * V6 SLC-103 MT-6 — Echte Mandanten-Liste-Card (Top 5) + Counter +
 *                   "Mandant einladen"-Button.
 *
 * Sektionen:
 *   1. Begruessung mit partner_organization.display_name
 *   2. Mandanten-Karte mit Top-5 + offene-Einladungen-Counter +
 *      "Alle ansehen"-Link + "Mandant einladen"-Primary-Action.
 *   3. Stammdaten-Karte (legal_name + display_name + contact_email + country
 *      mit Link zu /partner/dashboard/stammdaten).
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

  // Mandanten-Aggregate (Counter + Top-5-Vorschau)
  let acceptedClientCount = 0;
  let invitedClientCount = 0;
  type RecentMandant = {
    mappingId: string;
    companyName: string;
    invitationStatus: "invited" | "accepted" | "revoked";
    invitedAt: string;
  };
  let recentMandanten: RecentMandant[] = [];

  try {
    const { count: acceptedCount, error: aErr } = await admin
      .from("partner_client_mapping")
      .select("id", { count: "exact", head: true })
      .eq("partner_tenant_id", profile.tenant_id)
      .eq("invitation_status", "accepted");
    if (aErr) throw aErr;
    acceptedClientCount = acceptedCount ?? 0;

    const { count: invitedCount, error: iErr } = await admin
      .from("partner_client_mapping")
      .select("id", { count: "exact", head: true })
      .eq("partner_tenant_id", profile.tenant_id)
      .eq("invitation_status", "invited");
    if (iErr) throw iErr;
    invitedClientCount = invitedCount ?? 0;

    const { data: recentRows, error: rErr } = await admin
      .from("partner_client_mapping")
      .select("id, client_tenant_id, invitation_status, invited_at")
      .eq("partner_tenant_id", profile.tenant_id)
      .order("invited_at", { ascending: false })
      .limit(5);
    if (rErr) throw rErr;

    const clientIds = (recentRows ?? []).map(
      (r) => r.client_tenant_id as string,
    );
    const tenantsById = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: tenants } = await admin
        .from("tenants")
        .select("id, name")
        .in("id", clientIds);
      for (const t of tenants ?? []) {
        tenantsById.set(t.id as string, t.name as string);
      }
    }
    recentMandanten = (recentRows ?? []).map((r) => ({
      mappingId: r.id as string,
      companyName: tenantsById.get(r.client_tenant_id as string) ?? "—",
      invitationStatus: r.invitation_status as "invited" | "accepted" | "revoked",
      invitedAt: r.invited_at as string,
    }));
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
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Meine Mandanten</CardTitle>
              <CardDescription>
                {acceptedClientCount === 0 && invitedClientCount === 0
                  ? "Noch keinen Mandanten eingeladen."
                  : `${acceptedClientCount} aktiv, ${invitedClientCount} offen.`}
              </CardDescription>
            </div>
            <Link href="/partner/dashboard/mandanten/neu">
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Mandant einladen
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentMandanten.length === 0 ? (
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
                    Sende eine Einladung — der Mandant erhaelt einen Magic-Link
                    und kann sofort starten.
                  </p>
                </div>
              </div>
              <Link href="/partner/dashboard/mandanten/neu">
                <Button>Erste Einladung versenden</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {recentMandanten.map((m) => (
                  <li
                    key={m.mappingId}
                    className="flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <div>
                      <div className="font-medium text-slate-900">
                        {m.companyName}
                      </div>
                      <div className="text-xs text-slate-500">
                        Eingeladen am{" "}
                        {new Date(m.invitedAt).toLocaleDateString("de-DE")}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.invitationStatus === "accepted"
                          ? "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-300/60"
                          : m.invitationStatus === "invited"
                            ? "bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-300/60"
                            : "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300/60"
                      }`}
                    >
                      {m.invitationStatus === "accepted"
                        ? "Aktiv"
                        : m.invitationStatus === "invited"
                          ? "Einladung offen"
                          : "Widerrufen"}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-end">
                <Link
                  href="/partner/dashboard/mandanten"
                  className="text-sm font-medium text-brand-primary hover:underline"
                >
                  Alle Mandanten ansehen →
                </Link>
              </div>
            </div>
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
