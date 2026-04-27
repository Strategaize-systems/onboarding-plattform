import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * SLC-040 MT-1 — Handbuch-ZIP-Download als Next.js-Proxy.
 *
 * Pattern: IMP-166 (Self-Hosted Public-Storage 3 verzahnte Fallen) — wir nutzen
 * keine signed-URLs gegen den Public-Endpoint, sondern streamen das Blob durch
 * die Next.js-API-Route. Damit umgehen wir ISSUE-025 (apikey-Pflicht +
 * Host-Replace) und halten den Bucket privat ohne UX-Abstriche.
 *
 * Ablauf:
 *   1. Auth: getUser() via cookie-basierter SSR-Client.
 *   2. RPC rpc_get_handbook_snapshot_path(snapshotId) -> {storage_path, status}.
 *      Die RPC enthaelt bereits die Cross-Tenant- und Rollen-Checks.
 *   3. adminClient.storage.from('handbook').download(storage_path) liefert das Blob.
 *      Service-role bypasst RLS — die Authorization haben wir oben in Schritt 2.
 *   4. Stream als ZIP-Response mit Content-Disposition: attachment.
 *
 * Bewusst NICHT signed-URL.createSignedUrl: das wuerde ISSUE-025 reproduzieren.
 * Bei aktuellen Snapshot-Groessen (4-5 KB) ist Streaming via Next.js unkritisch.
 */

const FILENAME_FALLBACK = "unternehmerhandbuch.zip";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  const { snapshotId } = await params;

  if (!snapshotId) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "snapshotId required" } },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nicht authentifiziert" } },
      { status: 401 }
    );
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "rpc_get_handbook_snapshot_path",
    { p_snapshot_id: snapshotId }
  );

  if (rpcError) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(rpcError.message), {
      source: "api/handbook/download",
      metadata: { snapshotId },
    });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "rpc_failed" } },
      { status: 500 }
    );
  }

  const result = (rpcData ?? null) as Record<string, unknown> | null;
  if (!result) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Snapshot nicht gefunden" } },
      { status: 404 }
    );
  }

  if (result.error === "forbidden" || result.error === "unauthenticated") {
    const status = result.error === "unauthenticated" ? 401 : 403;
    return NextResponse.json(
      { error: { code: String(result.error).toUpperCase(), message: "Zugriff verweigert" } },
      { status }
    );
  }

  if (result.error === "snapshot_not_found") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Snapshot nicht gefunden" } },
      { status: 404 }
    );
  }

  if (result.error === "not_ready") {
    return NextResponse.json(
      {
        error: {
          code: "NOT_READY",
          message: "Handbuch wird noch erzeugt",
          status: result.status,
        },
      },
      { status: 409 }
    );
  }

  const storagePath = typeof result.storage_path === "string" ? result.storage_path : null;
  if (!storagePath) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "storage_path missing" } },
      { status: 500 }
    );
  }

  const adminClient = createAdminClient();
  const { data: blob, error: dlError } = await adminClient.storage
    .from("handbook")
    .download(storagePath);

  if (dlError || !blob) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(dlError?.message ?? "blob_missing"), {
      source: "api/handbook/download",
      metadata: { snapshotId, storagePath },
    });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Download fehlgeschlagen" } },
      { status: 500 }
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const filename = buildFilename(storagePath);

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(arrayBuffer.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}

function buildFilename(storagePath: string): string {
  // storage_path = "{tenant_id}/{snapshot_id}.zip" — wir wollen einen lesbaren
  // Filename fuer den Browser-Download ohne tenant_id-Praefix.
  const parts = storagePath.split("/");
  const last = parts[parts.length - 1] ?? "";
  if (!last.endsWith(".zip")) return FILENAME_FALLBACK;
  const snapshotId = last.replace(/\.zip$/i, "");
  return `unternehmerhandbuch-${snapshotId.slice(0, 8)}.zip`;
}
