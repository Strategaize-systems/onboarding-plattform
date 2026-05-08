import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin-sidebar";
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

  if (!profile || !["strategaize_admin", "tenant_admin"].includes(profile.role)) {
    redirect("/dashboard");
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
