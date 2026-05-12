import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewPartnerForm } from "./NewPartnerForm";

/**
 * V6 SLC-102 MT-3 — Strategaize-Admin-UI: Neue Partner-Organisation anlegen.
 *
 * Server-Component prueft inline strategaize_admin (Defense-in-Depth zusaetzlich
 * zu admin/layout.tsx, das tenant_admin auch erlaubt). Render-Body ist
 * bewusst klein gehalten — Formular-Logik liegt in NewPartnerForm (Client),
 * damit useTransition + Native-HTML-Pattern (feedback_native_html_form_pattern)
 * sauber gekapselt ist.
 */

export default async function NewPartnerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") {
    redirect("/admin/tenants");
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/partners"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Zurueck zur Partner-Liste
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Neue Partner-Organisation
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Lege eine neue Steuerberater-Kanzlei an. Im Anschluss kannst du den
          Owner-Admin per Magic-Link einladen.
        </p>
      </div>

      <NewPartnerForm />
    </div>
  );
}
