// SLC-079 MT-5 — Methodik-Review Detail-Page.
// URL: /admin/walkthroughs/[id]
// Auth: strategaize_admin (alle Tenants) + tenant_admin (eigener Tenant).

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WalkthroughHeader } from "@/components/admin/walkthroughs/WalkthroughHeader";
import {
  SubtopicTreeReview,
  type SubtopicTreeStep,
} from "@/components/admin/walkthroughs/SubtopicTreeReview";
import {
  UnmappedBucket,
  type UnmappedStep,
} from "@/components/admin/walkthroughs/UnmappedBucket";
import { ApprovalForm } from "@/components/admin/walkthroughs/ApprovalForm";
import { RawTranscriptToggle } from "@/components/admin/walkthroughs/RawTranscriptToggle";
import type { SubtopicOption } from "@/components/admin/walkthroughs/MoveStepDropdown";

interface PageProps {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TemplateBlockJson {
  key?: string;
  title?: Record<string, string> | string;
  questions?: Array<{ unterbereich?: string; sop_trigger?: boolean }>;
}

function buildSubtopicOptions(blocks: unknown): SubtopicOption[] {
  if (!Array.isArray(blocks)) return [];
  const options: SubtopicOption[] = [];
  const seen = new Set<string>();

  // Versuch 1: nur sop_trigger=true
  for (const rawBlock of blocks) {
    const block = rawBlock as TemplateBlockJson | null;
    if (!block || typeof block !== "object") continue;
    const blockKey = typeof block.key === "string" ? block.key : "?";
    const questions = Array.isArray(block.questions) ? block.questions : [];
    for (const q of questions) {
      const ub = q?.unterbereich;
      if (typeof ub !== "string" || ub.trim().length === 0) continue;
      if (q.sop_trigger !== true) continue;
      const trimmed = ub.trim();
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      options.push({ subtopic_id: trimmed, block_key: blockKey });
    }
  }

  if (options.length > 0) return options.sort((a, b) =>
    a.subtopic_id.localeCompare(b.subtopic_id, "de"),
  );

  // Fallback: alle unterbereich-Werte
  for (const rawBlock of blocks) {
    const block = rawBlock as TemplateBlockJson | null;
    if (!block || typeof block !== "object") continue;
    const blockKey = typeof block.key === "string" ? block.key : "?";
    const questions = Array.isArray(block.questions) ? block.questions : [];
    for (const q of questions) {
      const ub = q?.unterbereich;
      if (typeof ub !== "string" || ub.trim().length === 0) continue;
      const trimmed = ub.trim();
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      options.push({ subtopic_id: trimmed, block_key: blockKey });
    }
  }
  return options.sort((a, b) =>
    a.subtopic_id.localeCompare(b.subtopic_id, "de"),
  );
}

export default async function WalkthroughDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) notFound();

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
  if (!profile) redirect("/dashboard");

  const role = profile.role as string;
  if (role !== "strategaize_admin" && role !== "tenant_admin") {
    redirect("/dashboard");
  }

  const admin = createAdminClient();

  // Walkthrough-Session
  const { data: sessionRow } = await admin
    .from("walkthrough_session")
    .select(
      "id, tenant_id, capture_session_id, recorded_by_user_id, status, created_at, reviewed_at, reviewer_user_id, transcript_knowledge_unit_id, duration_sec",
    )
    .eq("id", id)
    .maybeSingle();
  if (!sessionRow) notFound();

  // Tenant-Isolation fuer tenant_admin
  if (role === "tenant_admin" && profile.tenant_id !== sessionRow.tenant_id) {
    redirect("/dashboard");
  }

  // Tenant-Name + Capture-Session + Template parallel
  const [tenantRes, captureRes, recorderRes] = await Promise.all([
    admin
      .from("tenants")
      .select("id, name")
      .eq("id", sessionRow.tenant_id)
      .maybeSingle(),
    admin
      .from("capture_session")
      .select("id, template_id")
      .eq("id", sessionRow.capture_session_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id, email")
      .eq("id", sessionRow.recorded_by_user_id)
      .maybeSingle(),
  ]);

  const templateId = captureRes.data?.template_id as string | undefined;
  const templateRes = templateId
    ? await admin
        .from("template")
        .select("id, blocks")
        .eq("id", templateId)
        .maybeSingle()
    : { data: null };

  // Steps + Mappings — zwei separate Queries (PostgREST-Embedded-Select fand FK nicht zuverlaessig)
  const { data: stepRows, error: stepsError } = await admin
    .from("walkthrough_step")
    .select(
      "id, step_number, action, responsible, timeframe, success_criterion, dependencies, reviewer_corrected",
    )
    .eq("walkthrough_session_id", id)
    .is("deleted_at", null)
    .order("step_number", { ascending: true });

  if (stepsError) {
    console.error("[walkthrough-detail] steps query error", {
      sessionId: id,
      error: stepsError.message,
      code: (stepsError as { code?: string }).code,
    });
  } else {
    console.log("[walkthrough-detail] loaded", {
      sessionId: id,
      stepCount: (stepRows ?? []).length,
    });
  }

  const stepIds = (stepRows ?? []).map((r) => r.id as string);
  const mappingsByStepId = new Map<
    string,
    {
      subtopic_id: string | null;
      confidence_score: number | null;
      confidence_band: "green" | "yellow" | "red";
      mapping_reasoning: string | null;
      reviewer_corrected: boolean;
    }
  >();
  if (stepIds.length > 0) {
    const { data: mappingRows, error: mappingsError } = await admin
      .from("walkthrough_review_mapping")
      .select(
        "walkthrough_step_id, subtopic_id, confidence_score, confidence_band, mapping_reasoning, reviewer_corrected",
      )
      .in("walkthrough_step_id", stepIds);
    if (mappingsError) {
      console.error("[walkthrough-detail] mappings query error", {
        sessionId: id,
        stepIdsCount: stepIds.length,
        error: mappingsError.message,
      });
    } else {
      console.log("[walkthrough-detail] mappings", {
        sessionId: id,
        stepIdsCount: stepIds.length,
        mappingCount: (mappingRows ?? []).length,
      });
    }
    for (const m of mappingRows ?? []) {
      mappingsByStepId.set(m.walkthrough_step_id as string, {
        subtopic_id: (m.subtopic_id as string | null) ?? null,
        confidence_score: (m.confidence_score as number | null) ?? null,
        confidence_band:
          ((m.confidence_band as string) as "green" | "yellow" | "red") ?? "red",
        mapping_reasoning: (m.mapping_reasoning as string | null) ?? null,
        reviewer_corrected: Boolean(m.reviewer_corrected),
      });
    }
  }

  // Original-Transkript fuer RawTranscriptToggle
  let originalTranscript = "";
  if (sessionRow.transcript_knowledge_unit_id) {
    const { data: kuRow } = await admin
      .from("knowledge_unit")
      .select("body")
      .eq("id", sessionRow.transcript_knowledge_unit_id)
      .maybeSingle();
    originalTranscript = (kuRow?.body as string | null) ?? "";
  }

  // Reviewer-Email
  let reviewerEmail: string | null = null;
  if (sessionRow.reviewer_user_id) {
    const { data: reviewer } = await admin
      .from("profiles")
      .select("email")
      .eq("id", sessionRow.reviewer_user_id)
      .maybeSingle();
    reviewerEmail = (reviewer?.email as string) ?? null;
  }

  const subtopicOptions = buildSubtopicOptions(
    (templateRes.data?.blocks as unknown) ?? [],
  );

  // Build steps + mappings (mappings via Map-Lookup statt embedded select)
  const steps: SubtopicTreeStep[] = (stepRows ?? []).map((row) => {
    const stepId = row.id as string;
    const mapping = mappingsByStepId.get(stepId) ?? null;
    return {
      id: stepId,
      step_number: row.step_number as number,
      action: (row.action as string) ?? "",
      responsible: (row.responsible as string | null) ?? null,
      timeframe: (row.timeframe as string | null) ?? null,
      success_criterion: (row.success_criterion as string | null) ?? null,
      dependencies: (row.dependencies as string | null) ?? null,
      reviewer_corrected: Boolean(row.reviewer_corrected),
      mapping,
    };
  });

  const mappedSteps = steps.filter((s) => s.mapping?.subtopic_id);
  const unmappedSteps: UnmappedStep[] = steps.filter(
    (s) => !s.mapping?.subtopic_id,
  );

  const status = sessionRow.status as string;
  const alreadyDecided = status === "approved" || status === "rejected";
  const backHref =
    role === "strategaize_admin"
      ? "/admin/walkthroughs"
      : `/admin/tenants/${sessionRow.tenant_id}/walkthroughs`;

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Zurueck zur Liste
      </Link>

      <WalkthroughHeader
        tenantName={(tenantRes.data?.name as string) ?? "Unbekannter Tenant"}
        recordedByEmail={(recorderRes.data?.email as string | null) ?? null}
        status={status}
        createdAt={(sessionRow.created_at as string | null) ?? null}
        reviewedAt={(sessionRow.reviewed_at as string | null) ?? null}
        reviewerEmail={reviewerEmail}
        durationSec={(sessionRow.duration_sec as number | null) ?? null}
        stepCount={steps.length}
        mappedCount={mappedSteps.length}
        unmappedCount={unmappedSteps.length}
      />

      {steps.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
          <p className="text-sm text-slate-600">
            Diese Walkthrough-Session enthaelt keine extrahierten Schritte (N=0).
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Das passiert bei sehr unstrukturierten Aufnahmen ohne erkennbaren
            Prozess. Approve oder Reject ueber das Formular unten.
          </p>
        </div>
      ) : (
        <>
          <SubtopicTreeReview
            templateBlocks={templateRes.data?.blocks ?? []}
            steps={steps}
            subtopicOptions={subtopicOptions}
          />
          <UnmappedBucket steps={unmappedSteps} subtopicOptions={subtopicOptions} />
        </>
      )}

      {originalTranscript.length > 0 && (
        <RawTranscriptToggle
          walkthroughSessionId={sessionRow.id as string}
          originalTranscript={originalTranscript}
        />
      )}

      <ApprovalForm
        walkthroughSessionId={sessionRow.id as string}
        alreadyDecided={alreadyDecided}
      />
    </div>
  );
}
