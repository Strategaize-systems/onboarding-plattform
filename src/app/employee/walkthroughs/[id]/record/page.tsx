import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WalkthroughCapture } from "@/components/capture-modes/walkthrough/WalkthroughCapture";

/**
 * SLC-075 MT-2 — Walkthrough Record-Page.
 *
 * Wrapper um den existierenden WalkthroughCapture-Client-Component (SLC-071
 * MT-6). RLS auf walkthrough_session zeigt die Zeile nur, wenn
 * recorded_by_user_id = auth.uid() — fremd zugeordnete oder unbekannte IDs
 * liefern notFound().
 *
 * Wenn die Session nicht mehr im 'recording'-Status ist (z.B. weil der User
 * den Browser-Tab geschlossen + spaeter die URL angesprungen ist), leiten wir
 * auf die Status-Page um — Re-Recording desselben Eintrags ist nicht erlaubt.
 */

export default async function WalkthroughRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: session, error } = await supabase
    .from("walkthrough_session")
    .select("id, status, recorded_by_user_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !session) {
    notFound();
  }

  // Defense-in-depth: RLS schon, aber Self-Only ist hier hart.
  if (session.recorded_by_user_id !== user.id) {
    notFound();
  }

  if (session.status !== "recording") {
    redirect(`/employee/walkthroughs/${session.id}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/employee/walkthroughs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        ← Zurück zu Walkthroughs
      </Link>
      <WalkthroughCapture walkthroughSessionId={session.id} />
    </div>
  );
}
