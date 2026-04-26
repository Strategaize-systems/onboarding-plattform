import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmployeeShell } from "./employee-shell";

/**
 * SLC-034 MT-6 + SLC-037 — Employee-Layout mit Rollen-Guard und Sidebar.
 *
 * Nur role='employee' darf diese Seiten sehen. Andere Rollen werden auf
 * ihre eigene Landing-Page umgeleitet. Unauthenticated landet via Middleware
 * schon auf /login.
 *
 * Layout-Struktur (analog AdminSidebar / TenantAdminShell):
 *   EmployeeShell (flex h-screen overflow-hidden)
 *     ├── EmployeeSidebar (persistent left, 280px, dark gradient)
 *     └── main (flex-1, scrollable) — children werden hier gerendert
 *
 * Listen-Pages wrappen sich in `mx-auto max-w-5xl px-6 py-10`. Block-Detail
 * rendert QuestionnaireWorkspace fullscreen — der nimmt seinen flex-1-Slot
 * korrekt ein.
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

  return <EmployeeShell email={profile.email}>{children}</EmployeeShell>;
}
