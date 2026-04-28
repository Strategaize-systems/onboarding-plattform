// SLC-042 MT-5 — Read-only Tenant-Reviews-Sub-Page.
// tenant_admin sieht den Berater-Review-Status pro Block fuer den eigenen
// Tenant. RLS-Policy block_review_tenant_admin_select gewaehrleistet die
// Tenant-Isolation.

import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  TenantReviewsList,
  type TenantReviewRow,
} from "@/components/cockpit/TenantReviewsList";

export default async function TenantReviewsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  // Nur tenant_admin (lesender Zugriff via RLS). tenant_member/employee bekommt
  // RLS-Default-Deny + redirect.
  if (!profile || profile.role !== "tenant_admin" || !profile.tenant_id) {
    redirect("/dashboard");
  }

  // 1. Alle block_review-Eintraege des eigenen Tenants laden
  const { data: reviewRows } = await supabase
    .from("block_review")
    .select("block_key, status, reviewed_at, note, capture_session_id")
    .eq("tenant_id", profile.tenant_id);

  const reviews = reviewRows ?? [];

  // 2. Block-Titel via template.blocks aufloesen.
  // Mehrere Sessions koennen unterschiedliche Templates haben; wir holen die
  // Sessions zu den Reviews und mappen Block-Key -> Titel pro Session.
  const sessionIds = [
    ...new Set(reviews.map((r) => r.capture_session_id as string)),
  ];

  const blockTitleByKey = new Map<string, string>();

  if (sessionIds.length > 0) {
    const { data: sessRows } = await supabase
      .from("capture_session")
      .select("id, template_id")
      .in("id", sessionIds);

    const templateIds = [
      ...new Set((sessRows ?? []).map((s) => s.template_id as string)),
    ];

    if (templateIds.length > 0) {
      const { data: templates } = await supabase
        .from("template")
        .select("blocks")
        .in("id", templateIds);

      for (const t of templates ?? []) {
        const blocks = (t.blocks ?? []) as Array<{
          key: string;
          title?: Record<string, string>;
        }>;
        for (const b of blocks) {
          if (!blockTitleByKey.has(b.key)) {
            const title = b.title?.de ?? b.title?.en ?? b.key;
            blockTitleByKey.set(b.key, title);
          }
        }
      }
    }
  }

  const rows: TenantReviewRow[] = reviews.map((r) => ({
    block_key: r.block_key as string,
    block_title:
      blockTitleByKey.get(r.block_key as string) ?? (r.block_key as string),
    status: ((r.status as string) ?? "pending") as TenantReviewRow["status"],
    reviewed_at: (r.reviewed_at as string) ?? null,
    note: (r.note as string) ?? null,
  }));

  // Stable Sort: Status (pending zuerst), dann Block-Key
  rows.sort((a, b) => {
    const statusOrder: Record<TenantReviewRow["status"], number> = {
      pending: 0,
      rejected: 1,
      approved: 2,
    };
    const diff = statusOrder[a.status] - statusOrder[b.status];
    if (diff !== 0) return diff;
    return a.block_key.localeCompare(b.block_key);
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-brand-primary-dark underline-offset-2 hover:underline"
        >
          ← Zurueck zum Dashboard
        </Link>
      </div>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">
          Mitarbeiter-Bloecke — Review-Status
        </h1>
        <p className="text-sm text-slate-500">
          Diese Sicht zeigt nur den Status pro Block. Approve/Reject erfolgt
          weiterhin durch StrategAIze (read-only fuer dich).
        </p>
      </header>

      <TenantReviewsList rows={rows} />
    </div>
  );
}
