import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
import { InviteEmployeeDialog } from "./InviteEmployeeDialog";
import { InvitationActions } from "./InvitationActions";

/**
 * SLC-034 MT-5 — Mitarbeiter-Verwaltung fuer tenant_admin.
 * SLC-049 MT-4 — Filter `?filter=inactive` fuer Mitarbeiter-Liste.
 *
 * Zeigt:
 *   - aktive Mitarbeiter des Tenants (profiles.role='employee')
 *     mit Status (active/inactive), accepted_at, letzter Block-Submit
 *   - offene + angenommene + widerrufene Einladungen (employee_invitation)
 *
 * URL-State:
 *   - ohne Query: Tab "Alle" zeigt alle Mitarbeiter
 *   - ?filter=inactive: Tab "Inaktiv" zeigt nur Mitarbeiter ohne Block-Submit
 *
 * Aktionen:
 *   - Neue Einladung (InviteEmployeeDialog)
 *   - Pending-Invitation revoken (InvitationActions)
 *   - SMTP-Failure re-senden (InvitationActions)
 */

type InvitationRow = {
  id: string;
  email: string;
  display_name: string | null;
  role_hint: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  accepted_at: string | null;
  accepted_user_id: string | null;
  created_at: string;
};

type EmployeeRow = {
  id: string;
  email: string;
  created_at: string;
  acceptedAt: string | null;
  lastBlockSubmit: string | null;
};

type FilterValue = "all" | "inactive";

function parseFilter(value: string | string[] | undefined): FilterValue {
  if (Array.isArray(value)) return parseFilter(value[0]);
  return value === "inactive" ? "inactive" : "all";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("de-DE");
}

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminTeamPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const filter = parseFilter(params.filter);

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

  if (!profile || profile.role !== "tenant_admin" || !profile.tenant_id) {
    redirect("/dashboard");
  }

  const [invitationsRes, employeesRes] = await Promise.all([
    supabase
      .from("employee_invitation")
      .select(
        "id, email, display_name, role_hint, status, expires_at, accepted_at, accepted_user_id, created_at"
      )
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, email, created_at")
      .eq("tenant_id", profile.tenant_id)
      .eq("role", "employee")
      .order("created_at", { ascending: false }),
  ]);

  const invitations = (invitationsRes.data ?? []) as InvitationRow[];
  const baseEmployees = (employeesRes.data ?? []) as Array<{
    id: string;
    email: string;
    created_at: string;
  }>;

  // Map accepted_user_id -> accepted_at fuer Anreicherung
  const acceptedAtByUserId = new Map<string, string>();
  for (const inv of invitations) {
    if (
      inv.status === "accepted" &&
      inv.accepted_user_id &&
      inv.accepted_at
    ) {
      acceptedAtByUserId.set(inv.accepted_user_id, inv.accepted_at);
    }
  }

  // Letzter Block-Submit pro User aus block_checkpoint
  const employeeIds = baseEmployees.map((e) => e.id);
  let lastSubmitByUserId = new Map<string, string>();
  if (employeeIds.length > 0) {
    const { data: checkpoints } = await supabase
      .from("block_checkpoint")
      .select("created_by, created_at")
      .in("created_by", employeeIds)
      .order("created_at", { ascending: false });
    for (const cp of (checkpoints ?? []) as Array<{
      created_by: string;
      created_at: string;
    }>) {
      if (!lastSubmitByUserId.has(cp.created_by)) {
        lastSubmitByUserId.set(cp.created_by, cp.created_at);
      }
    }
  }

  const enrichedEmployees: EmployeeRow[] = baseEmployees.map((e) => ({
    id: e.id,
    email: e.email,
    created_at: e.created_at,
    acceptedAt: acceptedAtByUserId.get(e.id) ?? null,
    lastBlockSubmit: lastSubmitByUserId.get(e.id) ?? null,
  }));

  const visibleEmployees =
    filter === "inactive"
      ? enrichedEmployees.filter((e) => !e.lastBlockSubmit)
      : enrichedEmployees;

  const inactiveCount = enrichedEmployees.filter(
    (e) => !e.lastBlockSubmit
  ).length;

  const pending = invitations.filter((i) => i.status === "pending");
  const other = invitations.filter((i) => i.status !== "pending");

  const tabBase =
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
  const tabActive = "bg-slate-900 text-white";
  const tabIdle = "text-slate-600 hover:bg-slate-100";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mitarbeiter</h1>
          <p className="mt-1 text-sm text-slate-500">
            Mitarbeiter einladen und Einladungen verwalten.
          </p>
        </div>
        <InviteEmployeeDialog />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Aktive Mitarbeiter</CardTitle>
              <CardDescription>
                {enrichedEmployees.length} mit Login
                {inactiveCount > 0
                  ? ` — ${inactiveCount} ohne Block-Submit`
                  : ""}
              </CardDescription>
            </div>
            <div
              role="tablist"
              aria-label="Filter Mitarbeiter"
              className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1"
            >
              <Link
                role="tab"
                aria-selected={filter === "all"}
                href="/admin/team"
                className={`${tabBase} ${filter === "all" ? tabActive : tabIdle}`}
              >
                Alle
                <span className="ml-1.5 text-xs opacity-75">
                  ({enrichedEmployees.length})
                </span>
              </Link>
              <Link
                role="tab"
                aria-selected={filter === "inactive"}
                href="/admin/team?filter=inactive"
                className={`${tabBase} ${filter === "inactive" ? tabActive : tabIdle}`}
              >
                Inaktiv
                <span className="ml-1.5 text-xs opacity-75">
                  ({inactiveCount})
                </span>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {visibleEmployees.length === 0 ? (
            <p className="text-sm text-slate-500">
              {filter === "inactive"
                ? "Keine inaktiven Mitarbeiter — alle haben mindestens einen Block eingereicht."
                : "Noch keine Mitarbeiter. Lade einen ueber den Button oben rechts ein."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Beigetreten</TableHead>
                  <TableHead>Letzter Block-Submit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEmployees.map((e) => {
                  const isInactive = !e.lastBlockSubmit;
                  return (
                    <TableRow key={e.id}>
                      <TableCell>{e.email}</TableCell>
                      <TableCell>
                        <Badge variant={isInactive ? "secondary" : "default"}>
                          {isInactive ? "inaktiv" : "aktiv"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {formatDate(e.acceptedAt ?? e.created_at)}
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {formatDate(e.lastBlockSubmit)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Offene Einladungen</CardTitle>
          <CardDescription>
            {pending.length} ausstehend — Link ist 14 Tage gueltig
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-500">Keine offenen Einladungen.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead>Gueltig bis</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>{inv.display_name ?? "–"}</TableCell>
                    <TableCell>{inv.role_hint ?? "–"}</TableCell>
                    <TableCell className="text-slate-500">
                      {new Date(inv.expires_at).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell className="text-right">
                      <InvitationActions invitationId={inv.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {other.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Historie</CardTitle>
            <CardDescription>
              Angenommene, widerrufene und abgelaufene Einladungen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Datum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {other.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          inv.status === "accepted"
                            ? "default"
                            : inv.status === "revoked"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {inv.status === "accepted"
                          ? "angenommen"
                          : inv.status === "revoked"
                            ? "widerrufen"
                            : "abgelaufen"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {new Date(inv.accepted_at ?? inv.created_at).toLocaleDateString("de-DE")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
