import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { captureException } from "@/lib/logger";

/**
 * V6 SLC-102 MT-3 — Strategaize-Admin-UI: Partner-Organisationen Liste.
 *
 * Cross-Tenant-Sicht (Pattern aus FEAT-029 Admin-Tenants-Liste). Zeigt alle
 * Partner-Tenants (`tenant_kind='partner_organization'`) mit Stammdaten,
 * Anzahl aktiver Mandanten und akzeptierter Owner-Einladungen.
 *
 * Auth-Gate Defense-in-Depth: admin/layout erlaubt strategaize_admin UND
 * tenant_admin (TenantAdminShell). Partner-Verwaltung ist exklusiv
 * strategaize_admin — daher zusaetzliche Inline-Pruefung. Konsistent zur
 * RLS-Policy `po_all_strategaize_admin` und Server-Action-Auth aus MT-1.
 */

interface PartnerListRow {
  partnerTenantId: string;
  legalName: string;
  displayName: string;
  contactEmail: string;
  country: string;
  partnerKind: string;
  createdAt: string;
  acceptedClientCount: number;
  pendingOwnerInvitationCount: number;
  acceptedOwnerInvitationCount: number;
}

const COUNTRY_LABELS: Record<string, string> = {
  DE: "Deutschland",
  NL: "Niederlande",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("de-DE");
}

export default async function AdminPartnersListPage() {
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

  let rows: PartnerListRow[] = [];
  let loadError: string | null = null;
  try {
    const { data: partners, error: pErr } = await admin
      .from("partner_organization")
      .select(
        "tenant_id, legal_name, display_name, contact_email, country, partner_kind, created_at",
      )
      .order("created_at", { ascending: false });
    if (pErr) throw pErr;

    const partnerIds = (partners ?? []).map((p) => p.tenant_id);

    let acceptedByPartner = new Map<string, number>();
    let pendingInvByPartner = new Map<string, number>();
    let acceptedInvByPartner = new Map<string, number>();

    if (partnerIds.length > 0) {
      const { data: mappings, error: mErr } = await admin
        .from("partner_client_mapping")
        .select("partner_tenant_id, invitation_status")
        .in("partner_tenant_id", partnerIds);
      if (mErr) throw mErr;
      for (const row of mappings ?? []) {
        if (row.invitation_status === "accepted") {
          const id = row.partner_tenant_id as string;
          acceptedByPartner.set(id, (acceptedByPartner.get(id) ?? 0) + 1);
        }
      }

      const { data: invitations, error: invErr } = await admin
        .from("employee_invitation")
        .select("tenant_id, status, role_hint")
        .in("tenant_id", partnerIds)
        .eq("role_hint", "partner_admin");
      if (invErr) throw invErr;
      for (const row of invitations ?? []) {
        const id = row.tenant_id as string;
        if (row.status === "pending") {
          pendingInvByPartner.set(id, (pendingInvByPartner.get(id) ?? 0) + 1);
        } else if (row.status === "accepted") {
          acceptedInvByPartner.set(id, (acceptedInvByPartner.get(id) ?? 0) + 1);
        }
      }
    }

    rows = (partners ?? []).map((p) => ({
      partnerTenantId: p.tenant_id as string,
      legalName: p.legal_name as string,
      displayName: p.display_name as string,
      contactEmail: p.contact_email as string,
      country: p.country as string,
      partnerKind: p.partner_kind as string,
      createdAt: p.created_at as string,
      acceptedClientCount: acceptedByPartner.get(p.tenant_id as string) ?? 0,
      pendingOwnerInvitationCount:
        pendingInvByPartner.get(p.tenant_id as string) ?? 0,
      acceptedOwnerInvitationCount:
        acceptedInvByPartner.get(p.tenant_id as string) ?? 0,
    }));
  } catch (err) {
    captureException(err, {
      source: "admin/partners/listPage",
      userId: user.id,
    });
    loadError = "Partner-Liste konnte nicht geladen werden.";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Partner-Organisationen
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Steuerberater-Kanzleien und ihre Mandanten verwalten.
          </p>
        </div>
        <Link href="/admin/partners/new">
          <Button>Neue Partner-Organisation</Button>
        </Link>
      </div>

      {loadError && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-red-600">{loadError}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Alle Partner</CardTitle>
          <CardDescription>
            {rows.length === 0
              ? "Noch keine Partner-Organisation angelegt."
              : `${rows.length} Partner-Organisation${rows.length === 1 ? "" : "en"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">
              Lege eine neue Partner-Organisation ueber den Button oben rechts
              an. Der Owner erhaelt dann eine Einladungs-E-Mail.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kanzlei</TableHead>
                  <TableHead>Land</TableHead>
                  <TableHead>Kontakt</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Mandanten</TableHead>
                  <TableHead>Angelegt</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const ownerLabel =
                    p.acceptedOwnerInvitationCount > 0
                      ? "Aktiv"
                      : p.pendingOwnerInvitationCount > 0
                        ? "Eingeladen"
                        : "Kein Owner";
                  const ownerVariant =
                    p.acceptedOwnerInvitationCount > 0
                      ? "default"
                      : p.pendingOwnerInvitationCount > 0
                        ? "secondary"
                        : "outline";
                  return (
                    <TableRow key={p.partnerTenantId}>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {p.displayName}
                        </div>
                        {p.displayName !== p.legalName && (
                          <div className="text-xs text-slate-500">
                            {p.legalName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {COUNTRY_LABELS[p.country] ?? p.country}
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {p.contactEmail}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ownerVariant}>{ownerLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-slate-500">
                        {p.acceptedClientCount}
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {formatDate(p.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/admin/partners/${p.partnerTenantId}`}
                          className="text-sm font-medium text-brand-primary hover:underline"
                        >
                          Details
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
