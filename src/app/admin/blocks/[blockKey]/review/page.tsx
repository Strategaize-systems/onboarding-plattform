// SLC-042 MT-1 — Konsolidierter Block-zentrierter Review-View fuer
// strategaize_admin. URL: /admin/blocks/[blockKey]/review?tenant=...&session=...
//
// Laedt Block-Titel + Mitarbeiter-KUs + Mitarbeiter-Lookup (via owner_user_id ->
// profiles.email) + aktuellen block_review-Status. Reject/Approve via
// ApproveRejectButtons (MT-2). Audit-Felder (reviewed_by, reviewed_at, note)
// werden read-only unter dem Header gezeigt.

import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { BlockReviewHeader } from "@/components/review/BlockReviewHeader";
import {
  EmployeeKUStack,
  type EmployeeKU,
} from "@/components/review/EmployeeKUStack";
import { ApproveRejectButtons } from "@/components/review/ApproveRejectButtons";

interface PageProps {
  params: Promise<{ blockKey: string }>;
  searchParams: Promise<{ tenant?: string; session?: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ReviewStatus = "pending" | "approved" | "rejected";

export default async function BlockReviewPage({
  params,
  searchParams,
}: PageProps) {
  const { blockKey } = await params;
  const { tenant, session } = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Auth: nur strategaize_admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") {
    redirect("/dashboard");
  }

  if (!tenant || !UUID_RE.test(tenant) || !session || !UUID_RE.test(session)) {
    return (
      <div className="mx-auto max-w-3xl space-y-2 p-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Ungueltige Review-URL
        </h1>
        <p className="text-sm text-slate-500">
          Erwartet: <code className="rounded bg-slate-100 px-1">?tenant=&lt;uuid&gt;&amp;session=&lt;uuid&gt;</code>
        </p>
        <Link href="/admin" className="text-sm text-brand-primary-dark underline">
          Zurueck zum Admin-Bereich
        </Link>
      </div>
    );
  }

  // 1. Tenant-Name + Template-Block-Titel
  const [tenantRes, sessionRes] = await Promise.all([
    supabase.from("tenants").select("id, name").eq("id", tenant).maybeSingle(),
    supabase
      .from("capture_session")
      .select("template_id")
      .eq("id", session)
      .maybeSingle(),
  ]);

  const templateId = sessionRes.data?.template_id as string | undefined;
  const templateRes = templateId
    ? await supabase
        .from("template")
        .select("blocks")
        .eq("id", templateId)
        .maybeSingle()
    : { data: null };

  const blocks = ((templateRes.data?.blocks ?? []) as Array<{
    key: string;
    title: Record<string, string>;
  }>).filter(Boolean);
  const block = blocks.find((b) => b.key === blockKey);
  const blockTitle = block?.title?.de ?? block?.title?.en ?? blockKey;

  // 2. Mitarbeiter-KUs fuer (tenant, employee-Sessions, blockKey).
  // Mitarbeiter-Sessions sind alle capture_sessions mit capture_mode='employee_questionnaire'
  // im selben Tenant. Die in der URL uebergebene "session" ist die Berater-Session
  // (GF/Bridge). Wir laden alle Mitarbeiter-KUs ueber den Tenant.
  const { data: kuRows } = await supabase
    .from("knowledge_unit")
    .select(
      "id, title, body, confidence, capture_session_id, source"
    )
    .eq("tenant_id", tenant)
    .eq("block_key", blockKey)
    .eq("source", "employee_questionnaire");

  const kuList = kuRows ?? [];

  // 3. Mitarbeiter-Lookup: capture_session.owner_user_id -> profiles.email
  const sessionIds = [...new Set(kuList.map((k) => k.capture_session_id as string))];
  const ownerMap = new Map<string, string>();

  if (sessionIds.length > 0) {
    const { data: sessRows } = await supabase
      .from("capture_session")
      .select("id, owner_user_id")
      .in("id", sessionIds);

    const ownerIds = [
      ...new Set((sessRows ?? []).map((r) => r.owner_user_id as string)),
    ];
    const sessionToOwner = new Map(
      (sessRows ?? []).map((r) => [
        r.id as string,
        r.owner_user_id as string,
      ]),
    );

    if (ownerIds.length > 0) {
      const { data: profRows } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", ownerIds);

      const ownerToEmail = new Map(
        (profRows ?? []).map((r) => [r.id as string, r.email as string]),
      );

      for (const [sessId, ownerId] of sessionToOwner) {
        const email = ownerToEmail.get(ownerId);
        if (email) ownerMap.set(sessId, email);
      }
    }
  }

  const employeeUnits: EmployeeKU[] = kuList.map((row) => ({
    id: row.id as string,
    title: (row.title as string) ?? "",
    body: (row.body as string) ?? "",
    confidence: ((row.confidence as string) ?? "low") as EmployeeKU["confidence"],
    capture_session_id: row.capture_session_id as string,
    employee_email: ownerMap.get(row.capture_session_id as string) ?? null,
  }));

  // 4. Aktueller block_review-Status (1 Row pro tenant+session+block)
  const { data: reviewRow } = await supabase
    .from("block_review")
    .select("status, reviewed_by, reviewed_at, note")
    .eq("tenant_id", tenant)
    .eq("capture_session_id", session)
    .eq("block_key", blockKey)
    .maybeSingle();

  const status = ((reviewRow?.status as string) ?? "pending") as ReviewStatus;

  // 5. Audit-Anzeige: Email des letzten Reviewers
  let reviewerEmail: string | null = null;
  if (reviewRow?.reviewed_by) {
    const { data: reviewerRow } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", reviewRow.reviewed_by)
      .maybeSingle();
    reviewerEmail = (reviewerRow?.email as string) ?? null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <BlockReviewHeader
        tenantName={tenantRes.data?.name ?? "Unbekannter Tenant"}
        blockTitle={blockTitle}
        blockKey={blockKey}
        kuCount={employeeUnits.length}
        status={status}
      />

      {reviewRow?.reviewed_at && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <div className="font-medium text-slate-900">Letzter Review</div>
          <div className="mt-1 text-xs text-slate-600">
            {reviewerEmail ?? "Unbekannter Reviewer"} ·{" "}
            {new Date(reviewRow.reviewed_at as string).toLocaleString("de-DE")}
          </div>
          {reviewRow.note && (
            <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {reviewRow.note as string}
            </div>
          )}
        </div>
      )}

      <EmployeeKUStack units={employeeUnits} />

      <div className="border-t border-slate-200 pt-4">
        <ApproveRejectButtons
          tenantId={tenant}
          sessionId={session}
          blockKey={blockKey}
          currentStatus={status}
        />
      </div>
    </div>
  );
}
