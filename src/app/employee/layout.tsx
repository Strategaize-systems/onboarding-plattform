import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { logout } from "../login/actions";
import { Button } from "@/components/ui/button";

/**
 * SLC-034 MT-6 — Employee-Layout mit Rollen-Guard.
 *
 * Nur role='employee' darf diese Seiten sehen. Andere Rollen werden auf
 * ihre eigene Landing-Page umgeleitet. Unauthenticated landet via Middleware
 * schon auf /login.
 */

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  if (profile.role === "tenant_admin") redirect("/dashboard");
  if (profile.role === "strategaize_admin") redirect("/admin/tenants");
  if (profile.role === "tenant_member") redirect("/dashboard");
  if (profile.role !== "employee") redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-full.png" alt="StrategAIze" className="h-8 w-auto" />
            <span className="text-sm text-slate-500">Mitarbeiter</span>
          </div>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              Abmelden
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
