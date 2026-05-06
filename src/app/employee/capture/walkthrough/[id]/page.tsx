import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WalkthroughCapture } from "@/components/capture-modes/walkthrough/WalkthroughCapture";

/**
 * SLC-071 MT-8 — Walkthrough Capture-Page-Loader.
 *
 * Server-Component, lade-only. Validates auth + role + tenant-ownership of the
 * capture_session and then renders the client-side <WalkthroughCapture />
 * component (MT-6) with the captureSessionId as a prop.
 *
 * Sichtperimeter: nur 'employee', 'tenant_member' oder 'tenant_admin' duerfen
 * aufnehmen. strategaize_admin reviewed, dokumentiert nicht (DEC-076).
 *
 * Fremde Tenants oder unbekannte capture_sessions werden mit notFound()
 * behandelt — wir verraten nicht, ob die ID existiert.
 */
const ALLOWED_RECORDER_ROLES = new Set([
  "employee",
  "tenant_member",
  "tenant_admin",
]);

export default async function WalkthroughCapturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: captureSessionId } = await params;
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

  if (!profile || !ALLOWED_RECORDER_ROLES.has(profile.role)) {
    redirect("/login");
  }

  // RLS already restricts capture_session visibility to the current tenant;
  // the explicit tenant_id check below is defense-in-depth (R16-Pattern).
  const { data: capture, error } = await supabase
    .from("capture_session")
    .select("id, tenant_id, capture_mode, template_id")
    .eq("id", captureSessionId)
    .maybeSingle();

  if (error || !capture) {
    notFound();
  }
  if (capture.tenant_id !== profile.tenant_id) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/employee"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        ← Zurück zu Aufgaben
      </Link>
      <WalkthroughCapture captureSessionId={capture.id} />
    </div>
  );
}
