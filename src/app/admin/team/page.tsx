import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
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
 *
 * Zeigt:
 *   - aktive Mitarbeiter des Tenants (profiles.role='employee')
 *   - offene + angenommene + widerrufene Einladungen (employee_invitation)
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
  created_at: string;
};

type EmployeeRow = {
  id: string;
  email: string;
  created_at: string;
};

export default async function AdminTeamPage() {
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
      .select("id, email, display_name, role_hint, status, expires_at, accepted_at, created_at")
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
  const employees = (employeesRes.data ?? []) as EmployeeRow[];

  const pending = invitations.filter((i) => i.status === "pending");
  const other = invitations.filter((i) => i.status !== "pending");

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
          <CardTitle>Aktive Mitarbeiter</CardTitle>
          <CardDescription>{employees.length} Mitarbeiter mit Login</CardDescription>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <p className="text-sm text-slate-500">
              Noch keine Mitarbeiter. Lade einen ueber den Button oben rechts ein.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Beigetreten</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.email}</TableCell>
                    <TableCell className="text-slate-500">
                      {new Date(e.created_at).toLocaleDateString("de-DE")}
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
