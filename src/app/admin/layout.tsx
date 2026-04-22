import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin-sidebar";
import { ArrowLeft } from "lucide-react";

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
      {!isFullAdmin && (
        <nav className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
          <div className="mx-auto max-w-[1400px] px-6 py-3 flex items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <span className="text-slate-300">|</span>
            <span className="text-xs text-slate-400">{user.email}</span>
          </div>
        </nav>
      )}
      <main className={isFullAdmin ? "lg:ml-64" : ""}>
        <div className="mx-auto max-w-[1400px] p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
