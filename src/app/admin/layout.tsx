import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin-sidebar";

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
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["strategaize_admin", "tenant_admin"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const isFullAdmin = profile.role === "strategaize_admin";

  return (
    <div className="min-h-screen bg-slate-50">
      {isFullAdmin && <AdminSidebar email={user.email} />}
      <main className={isFullAdmin ? "lg:ml-64" : ""}>
        <div className="mx-auto max-w-[1400px] p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
