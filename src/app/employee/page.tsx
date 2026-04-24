import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * SLC-034 MT-6 — Minimales Employee-Dashboard.
 *
 * V4-Skelett: Der "Noch keine Aufgaben"-Zustand. Aufgaben-Liste mit
 * Capture-Sessions wird in SLC-037 ergaenzt. Die Layout-Komponente
 * validiert bereits, dass der User role='employee' hat.
 */

export default async function EmployeePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout stellt sicher dass user existiert und role='employee'
  const email = user?.email ?? "";
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single()
    : { data: null };

  const { data: tenant } = profile?.tenant_id
    ? await supabase
        .from("tenants")
        .select("name")
        .eq("id", profile.tenant_id)
        .single()
    : { data: null };

  const tenantName = tenant?.name ?? "deinem Unternehmen";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Willkommen bei {tenantName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Noch keine Aufgaben</CardTitle>
          <CardDescription>
            Sobald dein Administrator dir Aufgaben zuweist, siehst du sie hier.
            Du wirst per E-Mail benachrichtigt, wenn etwas fuer dich bereitsteht.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Bis dahin musst du nichts weiter tun.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
