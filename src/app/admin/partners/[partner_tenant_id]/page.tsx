import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvitePartnerAdminForm } from "./InvitePartnerAdminForm";
import { captureException } from "@/lib/logger";

/**
 * V6 SLC-102 MT-3 — Strategaize-Admin-UI: Partner-Detail-Page.
 *
 * Sektionen:
 *   1. Stammdaten (read-only — Edit-Modal kommt mit MT-5/V6.1, AC #6 fordert
 *      nur Anzeige).
 *   2. Owner-Einladung — Form fuer invitePartnerAdmin + Liste der pending +
 *      angenommenen Einladungen mit role_hint='partner_admin'.
 *   3. Mandanten — Liste der via partner_client_mapping verknuepften
 *      Tenants (V6 oft leer, weil Mandanten-Einladung erst SLC-103).
 *
 * Auth-Gate Defense-in-Depth: strategaize_admin-only. admin/layout erlaubt
 * tenant_admin auch — daher hier zusaetzlicher Inline-Check.
 */

interface InvitationRow {
  id: string;
  email: string;
  display_name: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

interface ClientMappingRow {
  client_tenant_id: string;
  client_name: string;
  invitation_status: "invited" | "accepted" | "revoked";
  invited_at: string;
  accepted_at: string | null;
}

const COUNTRY_LABELS: Record<string, string> = {
  DE: "Deutschland",
  NL: "Niederlande",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("de-DE");
}

interface PageProps {
  params: Promise<{ partner_tenant_id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminPartnerDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { partner_tenant_id: partnerTenantId } = await params;
  const sp = (await searchParams) ?? {};
  const created = sp.created === "1";
  const invited = sp.invited === "1";
  const emailFailed = sp.emailFailed === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") {
    redirect("/admin/tenants");
  }

  const admin = createAdminClient();

  // Stammdaten laden + tenant_kind-Cross-Check.
  const { data: partner, error: partnerErr } = await admin
    .from("partner_organization")
    .select(
      "tenant_id, legal_name, display_name, partner_kind, contact_email, contact_phone, country, created_at, updated_at",
    )
    .eq("tenant_id", partnerTenantId)
    .maybeSingle();

  if (partnerErr) {
    captureException(partnerErr, {
      source: "admin/partners/detailPage/loadPartner",
      userId: user.id,
      metadata: { partnerTenantId },
    });
  }
  if (!partner) {
    notFound();
  }

  // Owner-Einladungen mit role_hint='partner_admin'.
  let invitations: InvitationRow[] = [];
  try {
    const { data, error } = await admin
      .from("employee_invitation")
      .select(
        "id, email, display_name, status, expires_at, accepted_at, created_at, role_hint",
      )
      .eq("tenant_id", partnerTenantId)
      .eq("role_hint", "partner_admin")
      .order("created_at", { ascending: false });
    if (error) throw error;
    invitations = (data ?? []) as InvitationRow[];
  } catch (err) {
    captureException(err, {
      source: "admin/partners/detailPage/loadInvitations",
      userId: user.id,
      metadata: { partnerTenantId },
    });
  }

  // Mandanten via partner_client_mapping JOIN tenants.
  let clients: ClientMappingRow[] = [];
  try {
    const { data: mappings, error: mErr } = await admin
      .from("partner_client_mapping")
      .select(
        "client_tenant_id, invitation_status, invited_at, accepted_at",
      )
      .eq("partner_tenant_id", partnerTenantId)
      .order("invited_at", { ascending: false });
    if (mErr) throw mErr;

    const ids = (mappings ?? []).map((m) => m.client_tenant_id as string);
    let nameById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: tenants, error: tErr } = await admin
        .from("tenants")
        .select("id, name")
        .in("id", ids);
      if (tErr) throw tErr;
      for (const t of tenants ?? []) {
        nameById.set(t.id as string, t.name as string);
      }
    }

    clients = (mappings ?? []).map((m) => ({
      client_tenant_id: m.client_tenant_id as string,
      client_name:
        nameById.get(m.client_tenant_id as string) ?? "(unbekannter Mandant)",
      invitation_status: m.invitation_status as ClientMappingRow["invitation_status"],
      invited_at: m.invited_at as string,
      accepted_at: m.accepted_at as string | null,
    }));
  } catch (err) {
    captureException(err, {
      source: "admin/partners/detailPage/loadClients",
      userId: user.id,
      metadata: { partnerTenantId },
    });
  }

  const pendingInvitations = invitations.filter((i) => i.status === "pending");
  const otherInvitations = invitations.filter((i) => i.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/partners"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Zurueck zur Partner-Liste
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {partner.display_name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {partner.legal_name} — {COUNTRY_LABELS[partner.country as string] ?? partner.country}
        </p>
      </div>

      {created && (
        <Alert>
          <AlertDescription>
            Partner-Organisation angelegt. Lade jetzt den Owner-Admin per
            Magic-Link ein.
          </AlertDescription>
        </Alert>
      )}
      {invited && !emailFailed && (
        <Alert>
          <AlertDescription>
            Einladung verschickt. Der Owner erhaelt jetzt eine E-Mail mit
            Magic-Link.
          </AlertDescription>
        </Alert>
      )}
      {invited && emailFailed && (
        <Alert variant="destructive">
          <AlertDescription>
            Einladung wurde angelegt, aber die E-Mail konnte nicht zugestellt
            werden. Bitte spaeter erneut versenden (Resend kommt mit V6.1).
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
          <CardDescription>
            Strategaize-internes Stammblatt. Bearbeitung folgt mit V6.1.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Kanzlei (rechtlich)
              </dt>
              <dd className="mt-1 text-sm text-slate-900">{partner.legal_name}</dd>
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
                {COUNTRY_LABELS[partner.country as string] ?? partner.country}
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
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Angelegt
              </dt>
              <dd className="mt-1 text-sm text-slate-900">
                {formatDate(partner.created_at)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owner-Admin einladen</CardTitle>
          <CardDescription>
            Der Owner erhaelt eine E-Mail mit Magic-Link und kann sich danach
            als <code>partner_admin</code> einloggen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvitePartnerAdminForm partnerTenantId={partnerTenantId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owner-Einladungen</CardTitle>
          <CardDescription>
            {pendingInvitations.length === 0
              ? "Keine offenen Owner-Einladungen."
              : `${pendingInvitations.length} ausstehend — Link 7 Tage gueltig.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-slate-500">
              Noch keine Owner-Einladung verschickt. Nutze das Formular oben.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gueltig bis</TableHead>
                  <TableHead>Verschickt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...pendingInvitations, ...otherInvitations].map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell className="text-slate-500">
                      {inv.display_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          inv.status === "accepted"
                            ? "default"
                            : inv.status === "pending"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {inv.status === "pending"
                          ? "ausstehend"
                          : inv.status === "accepted"
                            ? "angenommen"
                            : inv.status === "revoked"
                              ? "widerrufen"
                              : "abgelaufen"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {formatDate(inv.expires_at)}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {formatDate(inv.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mandanten</CardTitle>
          <CardDescription>
            Cross-Tenant-Sicht auf Mandanten dieses Partners.
            {clients.length === 0
              ? " Mandanten-Einladung folgt mit SLC-103."
              : ` ${clients.length} Mandant${clients.length === 1 ? "" : "en"} verknuepft.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm text-slate-500">
              Dieser Partner hat noch keine Mandanten eingeladen.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mandant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Eingeladen</TableHead>
                  <TableHead>Angenommen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.client_tenant_id}>
                    <TableCell className="font-medium text-slate-900">
                      {c.client_name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.invitation_status === "accepted"
                            ? "default"
                            : c.invitation_status === "invited"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {c.invitation_status === "invited"
                          ? "eingeladen"
                          : c.invitation_status === "accepted"
                            ? "aktiv"
                            : "widerrufen"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {formatDate(c.invited_at)}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {formatDate(c.accepted_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
