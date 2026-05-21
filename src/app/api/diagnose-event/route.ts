// SLC-139 MT-3 (FEAT-058) — POST /api/diagnose-event Endpoint.
// Authenticated via Supabase-Cookie. Validation + Rate-Limit + RLS-Insert.
//
// Body (JSON):
//   {
//     capture_session_id: string (uuid),
//     event_type: DiagnoseEventType (9 erlaubte Werte),
//     question_key?: string | null,
//     payload?: Record<string, unknown>,
//     is_test?: boolean
//   }
//
// Statuscodes:
//   201 — Event eingefuegt.
//   400 — Body invalid (JSON-Parse, missing fields, unknown event_type).
//   401 — Not authenticated.
//   403 — Session gehoert nicht dem authenticated User.
//   429 — Rate-Limit (>600 Events/h pro capture_session_id).
//   500 — Insert-Error (sollte selten passieren, default-deny RLS-Reject ist 500).

import { NextRequest, NextResponse } from "next/server";

import { isValidEventType } from "@/lib/telemetry/diagnose-event-types";
import { diagnoseEventLimiter } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

interface DiagnoseEventRequestBody {
  capture_session_id?: unknown;
  event_type?: unknown;
  question_key?: unknown;
  payload?: unknown;
  is_test?: unknown;
}

function jsonError(message: string, status: number, retryAfter?: number) {
  const headers: Record<string, string> = {};
  if (retryAfter !== undefined) {
    headers["Retry-After"] = String(retryAfter);
  }
  return NextResponse.json({ error: message }, { status, headers });
}

export async function POST(request: NextRequest) {
  // 1. Body parse
  let body: DiagnoseEventRequestBody;
  try {
    body = (await request.json()) as DiagnoseEventRequestBody;
  } catch {
    return jsonError("invalid_json", 400);
  }

  // 2. Field validation
  const captureSessionId = body.capture_session_id;
  const eventType = body.event_type;
  if (typeof captureSessionId !== "string" || captureSessionId.length === 0) {
    return jsonError("capture_session_id_required", 400);
  }
  if (!isValidEventType(eventType)) {
    return jsonError("invalid_event_type", 400);
  }
  const questionKey =
    typeof body.question_key === "string" && body.question_key.length > 0
      ? body.question_key
      : null;
  const payload =
    typeof body.payload === "object" && body.payload !== null && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};
  const isTest = typeof body.is_test === "boolean" ? body.is_test : false;

  // 3. Authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("not_authenticated", 401);
  }

  // 4. Profile + tenant lookup
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.tenant_id) {
    return jsonError("profile_not_found", 403);
  }

  // 5. Session ownership check (RLS would also block, aber explizit fuer 403 vs 500)
  const { data: session } = await supabase
    .from("capture_session")
    .select("id, tenant_id")
    .eq("id", captureSessionId)
    .single();
  if (!session || session.tenant_id !== profile.tenant_id) {
    return jsonError("session_not_owned", 403);
  }

  // 6. Rate-Limit per capture_session_id
  const limit = diagnoseEventLimiter.check(captureSessionId);
  if (!limit.allowed) {
    return jsonError("rate_limited", 429, limit.retryAfterSeconds);
  }

  // 7. Resolve partner_org_id aus parent_partner_tenant_id der Session-Tenant
  const { data: tenant } = await supabase
    .from("tenants")
    .select("parent_partner_tenant_id")
    .eq("id", profile.tenant_id)
    .single();
  const partnerOrgId = tenant?.parent_partner_tenant_id ?? null;

  // 8. INSERT (RLS verifies tenant_id matches auth.user_tenant_id())
  const { data: inserted, error: insertError } = await supabase
    .from("diagnose_event")
    .insert({
      capture_session_id: captureSessionId,
      tenant_id: profile.tenant_id,
      partner_org_id: partnerOrgId,
      event_type: eventType,
      question_key: questionKey,
      payload,
      is_test: isTest,
    })
    .select("id")
    .single();

  if (insertError) {
    return jsonError("insert_failed", 500);
  }

  return NextResponse.json({ id: inserted!.id }, { status: 201 });
}
