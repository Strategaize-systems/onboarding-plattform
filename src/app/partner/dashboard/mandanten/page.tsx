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
import { MandantenListe, type MandantRow } from "./MandantenListe";

/**
 * V6 SLC-103 MT-4 — Mandanten-Liste (partner_admin).
 *
 * Server-Component:
 *   - Auth-Gate: partner_admin (Defense-in-Depth — Layout enforced bereits).
 *   - Lade alle partner_client_mappings unter partner_tenant_id JOIN tenants.
 *   - Render Tabelle mit Status-Badges + Revoke-Button (Client-Component) fuer invited.
 *
 * Flash-Messages via Query-Params (?invited=1 / ?revoked=1 / ?emailFailed=1).
 */

interface MandantenPageProps {
  searchParams: Promise<{
    invited?: string;
    revoked?: string;
    emailFailed?: string;
  }>;
}

export default async function PartnerMandantenPage({
  searchParams,
}: MandantenPageProps) {
  const params = await searchParams;
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

  // 1) Alle Mappings unter dem Partner laden
  const { data: mappings, error: mapErr } = await admin
    .from("partner_client_mapping")
    .select(
      "id, client_tenant_id, invitation_status, invited_at, accepted_at, revoked_at",
    )
    .eq("partner_tenant_id", profile.tenant_id)
    .order("invited_at", { ascending: false });

  if (mapErr) {
    captureException(new Error(mapErr.message), {
      source: "partner/dashboard/mandanten/loadMappings",
      userId: user.id,
      metadata: { tenantId: profile.tenant_id },
    });
  }

  // 2) Tenant-Namen + zugehoerige pending invitations
  const clientIds = (mappings ?? []).map((m) => m.client_tenant_id);
  const tenantsById = new Map<string, { name: string }>();
  const pendingInvByTenant = new Map<string, { email: string }>();

  if (clientIds.length > 0) {
    const { data: tenants } = await admin
      .from("tenants")
      .select("id, name")
      .in("id", clientIds);
    for (const t of tenants ?? []) {
      tenantsById.set(t.id as string, { name: t.name as string });
    }

    const { data: invs } = await admin
      .from("employee_invitation")
      .select("tenant_id, email, status, role_hint")
      .in("tenant_id", clientIds)
      .eq("role_hint", "tenant_admin");
    for (const i of invs ?? []) {
      // Bei mehreren historischen Invitations: letzte gewinnt — Reihenfolge ist
      // hier unwichtig, wir zeigen nur eine E-Mail pro Mandanten-Tenant.
      pendingInvByTenant.set(i.tenant_id as string, {
        email: i.email as string,
      });
    }
  }

  const rows: MandantRow[] = (mappings ?? []).map((m) => ({
    mappingId: m.id as string,
    mandantTenantId: m.client_tenant_id as string,
    companyName:
      tenantsById.get(m.client_tenant_id as string)?.name ?? "—",
    invitationEmail:
      pendingInvByTenant.get(m.client_tenant_id as string)?.email ?? "—",
    invitationStatus: m.invitation_status as
      | "invited"
      | "accepted"
      | "revoked",
    invitedAt: m.invited_at as string,
    acceptedAt: (m.accepted_at as string | null) ?? null,
    revokedAt: (m.revoked_at as string | null) ?? null,
  }));

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Meine Mandanten</h1>
          <p className="mt-2 text-sm text-slate-500">
            Verwalte Einladungen, sieh Status und widerrufe ausstehende
            Einladungen.
          </p>
        </div>
        <Link href="/partner/dashboard/mandanten/neu">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Mandant einladen
          </Button>
        </Link>
      </div>

      {params.invited === "1" && params.emailFailed === "1" && (
        <Alert variant="destructive">
          <AlertDescription>
            Einladung wurde angelegt, aber die E-Mail konnte nicht zugestellt
            werden. Bitte spaeter erneut versenden (Resend kommt mit V6.1).
          </AlertDescription>
        </Alert>
      )}
      {params.invited === "1" && params.emailFailed !== "1" && (
        <Alert>
          <AlertDescription>
            Einladung versandt. Der Mandant erhaelt einen Magic-Link per E-Mail.
          </AlertDescription>
        </Alert>
      )}
      {params.revoked === "1" && (
        <Alert>
          <AlertDescription>Einladung widerrufen.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mandanten ({rows.length})</CardTitle>
          <CardDescription>
            Alle Mandanten, die du bisher eingeladen hast — sortiert nach
            Einladungs-Datum.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-slate-100 p-3">
                  <Users className="h-5 w-5 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    Noch keinen Mandanten eingeladen.
                  </p>
                  <p className="text-sm text-slate-500">
                    Mit der ersten Einladung erscheint hier eine Liste mit
                    Status.
                  </p>
                </div>
              </div>
              <Link href="/partner/dashboard/mandanten/neu">
                <Button>Mandant einladen</Button>
              </Link>
            </div>
          ) : (
            <MandantenListe rows={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
