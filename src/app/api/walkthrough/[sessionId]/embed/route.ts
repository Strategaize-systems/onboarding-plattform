import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * SLC-091 MT-5 — Walkthrough-Video-Embed-Storage-Proxy (V5.1, FEAT-038).
 *
 * Pattern-Reuse aus FEAT-028 SLC-040 `/api/handbook/[snapshotId]/download`.
 * IMP-166 (Self-Hosted Public-Storage) — kein Signed-URL gegen den Public-
 * Endpoint, sondern Stream/Slice durch die Next.js-API-Route. Privater
 * `walkthroughs`-Bucket bleibt ohne UX-Abstrich nutzbar.
 *
 * Ablauf:
 *   1. Auth: getUser() via cookie-basierter SSR-Client.
 *   2. RPC rpc_get_walkthrough_video_path(sessionId) -> {storage_path, ...}.
 *      Die RPC enthaelt Tenant- + Rollen- + Status-Checks (DEC-099).
 *   3. adminClient.storage.from('walkthroughs').download(storage_path) liefert das Blob.
 *   4. Range-Header parsen: bei Range -> 206 Partial Content + Content-Range,
 *      ohne -> 200 OK + Full Body. Range-Pflicht fuer HTML5 video Browser-Seek
 *      (DEC-096).
 *
 * KEIN Audit-Log im Endpoint — Audit kommt einmalig pro Reader-Page-Load aus
 * SLC-092 MT-3 (DEC-098 Spam-Prevention bei Range-Request-Storm).
 */

const RANGE_PATTERN = /^bytes=(\d+)-(\d*)$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  if (!sessionId) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "sessionId required" } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nicht authentifiziert" } },
      { status: 401 },
    );
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "rpc_get_walkthrough_video_path",
    { p_walkthrough_session_id: sessionId },
  );

  if (rpcError) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(rpcError.message), {
      source: "api/walkthrough/embed",
      metadata: { sessionId },
    });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "rpc_failed" } },
      { status: 500 },
    );
  }

  const result = (rpcData ?? null) as Record<string, unknown> | null;
  if (!result) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Walkthrough nicht gefunden" } },
      { status: 404 },
    );
  }

  if (result.error === "unauthenticated") {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Nicht authentifiziert" } },
      { status: 401 },
    );
  }

  if (result.error === "forbidden") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Zugriff verweigert" } },
      { status: 403 },
    );
  }

  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Walkthrough nicht gefunden" } },
      { status: 404 },
    );
  }

  if (result.error === "not_approved") {
    return NextResponse.json(
      {
        error: {
          code: "NOT_APPROVED",
          message: "Walkthrough ist nicht freigegeben",
          status: result.status,
        },
      },
      { status: 409 },
    );
  }

  const storagePath = typeof result.storage_path === "string" ? result.storage_path : null;
  if (!storagePath) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "storage_path missing" } },
      { status: 500 },
    );
  }

  const adminClient = createAdminClient();
  const { data: blob, error: dlError } = await adminClient.storage
    .from("walkthroughs")
    .download(storagePath);

  if (dlError || !blob) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(dlError?.message ?? "blob_missing"), {
      source: "api/walkthrough/embed",
      metadata: { sessionId, storagePath },
    });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Download fehlgeschlagen" } },
      { status: 500 },
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const totalSize = arrayBuffer.byteLength;
  const rangeHeader = request.headers.get("range");

  // Kein Range -> 200 OK + Full Body
  if (!rangeHeader) {
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "video/webm",
        "Accept-Ranges": "bytes",
        "Content-Length": String(totalSize),
        "Cache-Control": "private, no-store",
      },
    });
  }

  // Range -> 206 Partial Content (DEC-096 Range-Pflicht)
  const match = RANGE_PATTERN.exec(rangeHeader);
  if (!match) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${totalSize}`,
      },
    });
  }

  const startByte = Number(match[1]);
  const endByteRaw = match[2] ? Number(match[2]) : totalSize - 1;
  const endByte = Math.min(endByteRaw, totalSize - 1);

  if (
    !Number.isFinite(startByte) ||
    !Number.isFinite(endByte) ||
    startByte < 0 ||
    startByte >= totalSize ||
    endByte < startByte
  ) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${totalSize}`,
      },
    });
  }

  const slice = arrayBuffer.slice(startByte, endByte + 1);

  return new NextResponse(slice, {
    status: 206,
    headers: {
      "Content-Type": "video/webm",
      "Content-Range": `bytes ${startByte}-${endByte}/${totalSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(slice.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
