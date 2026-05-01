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
import { RemindersOptOutToggle } from "./RemindersOptOutToggle";

/**
 * SLC-049 MT-5 — /dashboard/settings Server-Component.
 *
 * Liest user_settings.reminders_opt_out fuer den authentifizierten User.
 * Lese-Zugriff geht ueber den Service-Role-Client mit explizitem
 * `eq("user_id", user.id)` (gleiche Begruendung wie der UPDATE in actions.ts:
 * IMP-214 Service-Role-Pattern fuer State-Maschinen-Pfade durch Tenant-User).
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("user_settings")
    .select("reminders_opt_out")
    .eq("user_id", user.id)
    .maybeSingle();

  const optOut = Boolean(settings?.reminders_opt_out);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Einstellungen
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Persoenliche Praeferenzen fuer dein Konto.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Benachrichtigungen</CardTitle>
          <CardDescription>
            Steuere, wie wir dich an offene Capture-Aufgaben erinnern.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RemindersOptOutToggle initialOptOut={optOut} />
        </CardContent>
      </Card>
    </div>
  );
}
