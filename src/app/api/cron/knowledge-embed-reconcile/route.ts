// V10.2.1 SLC-185 MT-3 — Cron-Route Embedding-Reconcile (Self-Healing Coverage).
//
// Pattern reused aus src/app/api/cron/pending-signup-cleanup/route.ts (V7 SLC-135)
// — 1:1-Port des x-cron-secret-Gates (503/403/200/500), Rule: strategaize-pattern-reuse.md.
// DEC-262: duenner Auth-gated HTTP-Einstieg, keine Business-Logik in der Route —
// Enumeration, Gap-Check, Re-Embed und captureInfo-Summary liegen im Orchestrator
// (src/lib/workspace/reconcile-embeddings.ts).
//
// Trigger via Coolify-Scheduled-Task `knowledge-embed-reconcile` (*/10 * * * *)
// gegen GET http://localhost:3000/api/cron/knowledge-embed-reconcile mit Header
// `x-cron-secret: $CRON_SECRET` (Task-Anlage = /deploy V10.2.1, siehe RUNBOOK).
//
// Idempotent: vollstaendig indexierte Mandanten → Safe-No-Op (Counts 0); Re-Embed
// selbst ist upsert-idempotent via Unique-Constraint (source_type, source_id, chunk_index).

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { captureException, captureWarning } from "@/lib/logger";
import { reconcileEmbeddings } from "@/lib/workspace/reconcile-embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    captureWarning("CRON_SECRET ENV missing — cron endpoint disabled", {
      source: "cron:knowledge-embed-reconcile",
    });
    return new NextResponse("Cron not configured", { status: 503 });
  }

  if (secret !== expected) {
    captureWarning("cron auth fail", {
      source: "cron:knowledge-embed-reconcile",
      metadata: { reason: "x-cron-secret mismatch" },
    });
    return new NextResponse("Unauthorized", { status: 403 });
  }

  try {
    const supabase = createAdminClient();
    const summary = await reconcileEmbeddings(supabase);
    return NextResponse.json({ ok: true, ...summary }, { status: 200 });
  } catch (e) {
    captureException(e, { source: "cron:knowledge-embed-reconcile" });
    return new NextResponse("Internal Error", { status: 500 });
  }
}
