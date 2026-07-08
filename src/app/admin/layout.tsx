import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin-sidebar";
import { BeraterSidebar } from "@/components/berater-sidebar";
import { loadBeraterAssignedTenants } from "@/lib/workspace/workspace-scope";
import { TenantAdminShell } from "./tenant-admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, email, tenant_id")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !["strategaize_admin", "tenant_admin", "strategaize_berater"].includes(
      profile.role,
    )
  ) {
    redirect("/dashboard");
  }

  // V10.4 SLC-190 — strategaize_berater: gefilterte Shell (nur Mein Tag +
  // zugewiesene Mandanten). Die uebrigen /admin-Unterseiten re-gaten selbst auf
  // strategaize_admin und redirecten den Berater (verifiziert: tenants/partners/
  // reviews/text-overrides/funnel/berater alle `role !== strategaize_admin`).
  if (profile.role === "strategaize_berater") {
    const assignedTenants = await loadBeraterAssignedTenants(user.id);
    return (
      <div className="min-h-screen bg-slate-50">
        <BeraterSidebar email={user.email} assignedTenants={assignedTenants} />
        <main className="lg:ml-64">
          <div className="mx-auto max-w-[1400px] p-6 lg:p-8">{children}</div>
        </main>
      </div>
    );
  }

  const isFullAdmin = profile.role === "strategaize_admin";

  if (isFullAdmin) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminSidebar email={user.email} />
        <main className="lg:ml-64">
          <div className="mx-auto max-w-[1400px] p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <TenantAdminShell
      profile={{
        email: profile.email,
        role: profile.role,
        tenant_id: profile.tenant_id,
      }}
    >
      {children}
    </TenantAdminShell>
  );
}
