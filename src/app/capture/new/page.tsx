import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "@/lib/db/template-queries";
import { StartSessionClient } from "./start-session-client";
import { ArrowLeft } from "lucide-react";

export default async function CaptureNewPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "tenant_admin") {
    redirect("/dashboard");
  }

  const templates = await listTemplates(supabase);

  return (
    <>
      <nav className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </div>
      </nav>
      <StartSessionClient templates={templates} />
    </>
  );
}
