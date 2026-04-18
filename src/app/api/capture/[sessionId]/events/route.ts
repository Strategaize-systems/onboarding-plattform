import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/capture/[sessionId]/events
 * Create a new capture event (answer_submitted, note_added).
 * Idempotent via client_event_id.
 *
 * Body: { blockKey, questionId, clientEventId, eventType, payload }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient();
  const { sessionId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 403 });
  }

  // Verify session ownership
  const { data: session } = await supabase
    .from("capture_session")
    .select("id, tenant_id")
    .eq("id", sessionId)
    .single();

  if (!session || session.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  let body: {
    blockKey: string;
    questionId: string;
    clientEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }

  const { blockKey, questionId, clientEventId, eventType, payload } = body;

  if (!blockKey || !questionId || !clientEventId || !eventType || !payload) {
    return NextResponse.json({ error: "Fehlende Felder" }, { status: 400 });
  }

  if (!["answer_submitted", "note_added"].includes(eventType)) {
    return NextResponse.json({ error: "Ungültiger event_type" }, { status: 400 });
  }

  // Idempotency check
  const { data: existing } = await supabase
    .from("capture_events")
    .select("id, session_id, block_key, question_id, event_type, payload, created_at")
    .eq("session_id", sessionId)
    .eq("client_event_id", clientEventId)
    .single();

  if (existing) {
    return NextResponse.json({ event: existing }, { status: 200 });
  }

  // Insert event
  const { data: event, error: insertError } = await supabase
    .from("capture_events")
    .insert({
      session_id: sessionId,
      tenant_id: profile.tenant_id,
      block_key: blockKey,
      question_id: questionId,
      client_event_id: clientEventId,
      event_type: eventType,
      payload,
      created_by: user.id,
    })
    .select("id, session_id, block_key, question_id, event_type, payload, created_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      // Race condition — return existing
      const { data: retryExisting } = await supabase
        .from("capture_events")
        .select("id, session_id, block_key, question_id, event_type, payload, created_at")
        .eq("session_id", sessionId)
        .eq("client_event_id", clientEventId)
        .single();

      if (retryExisting) {
        return NextResponse.json({ event: retryExisting }, { status: 200 });
      }
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ event }, { status: 201 });
}

/**
 * GET /api/capture/[sessionId]/events?blockKey=X&questionId=Y
 * List capture events for a question in a session.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient();
  const { sessionId } = await params;
  const { searchParams } = new URL(request.url);
  const blockKey = searchParams.get("blockKey");
  const questionId = searchParams.get("questionId");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  let query = supabase
    .from("capture_events")
    .select("id, event_type, payload, created_at, created_by")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (blockKey) query = query.eq("block_key", blockKey);
  if (questionId) query = query.eq("question_id", questionId);

  const { data: events, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: events ?? [] });
}
