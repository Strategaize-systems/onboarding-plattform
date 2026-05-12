import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * SLC-104 MT-7 — Partner-Branding Logo Storage-Proxy (V6, FEAT-044).
 *
 * Pattern-Reuse aus SLC-091 /api/walkthrough/[sessionId]/embed/route.ts.
 *
 * Unterschiede zum Walkthrough-Proxy:
 *  - **Kein Auth-Gate**: Logo wird auch fuer anonyme Login-Page (vor User-Login)
 *    geladen, damit Branding-Resolver fuer Partner-Mandanten bereits auf /login
 *    wirkt. RPC `rpc_get_branding_for_tenant` ist SECURITY DEFINER mit anon-EXECUTE
 *    (DEC-109 Tradeoff: UUID-v4 mitigiert Enumeration).
 *  - **Kein Range-Header-Support**: Logos sind klein (<= 500KB Bucket-Limit),
 *    Browser braucht kein Seek. 200 OK + Full Body reicht.
 *  - **Public Cache (1h)**: Logos aendern sich selten + sind via Resolver-RPC
 *    ohnehin oeffentlich auflesbar. CDN/Browser-Cache reduziert Storage-IO.
 *  - **MIME-Detection** ueber Datei-Extension (PNG/SVG/JPG/JPEG nach Bucket-Limit).
 *
 * Ablauf:
 *  1. partner_tenant_id-UUID-Validation (Pre-Validate-Guard analog SLC-091 ISSUE-046).
 *  2. RPC rpc_get_branding_for_tenant(partner_tenant_id) -> branding-JSON.
 *  3. Wenn `logo_url` null oder branding leer: 404 NOT_FOUND.
 *  4. adminClient.storage.from('partner-branding-assets').download(logo_url).
 *  5. Wenn Download-Fehler: 500 INTERNAL_ERROR + Logger.
 *  6. 200 OK mit Content-Type aus Datei-Extension + Cache-Control public/1h.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function detectMime(storagePath: string): string {
  const lastDot = storagePath.lastIndexOf(".");
  const ext = lastDot >= 0 ? storagePath.slice(lastDot + 1).toLowerCase() : "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

interface BrandingRpcPayload {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string | null;
  display_name: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ partner_tenant_id: string }> },
) {
  const { partner_tenant_id } = await params;

  if (!partner_tenant_id || !UUID_RE.test(partner_tenant_id)) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "partner_tenant_id muss ein valides UUID sein",
        },
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "rpc_get_branding_for_tenant",
    { p_tenant_id: partner_tenant_id },
  );

  if (rpcError) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(rpcError.message), {
      source: "api/partner-branding/logo",
      metadata: { partner_tenant_id },
    });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "rpc_failed" } },
      { status: 500 },
    );
  }

  const branding = (rpcData ?? null) as BrandingRpcPayload | null;
  if (!branding || !branding.logo_url) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Kein Logo fuer diesen Partner hinterlegt" } },
      { status: 404 },
    );
  }

  const storagePath = branding.logo_url;
  const adminClient = createAdminClient();
  const { data: blob, error: dlError } = await adminClient.storage
    .from("partner-branding-assets")
    .download(storagePath);

  if (dlError || !blob) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(dlError?.message ?? "blob_missing"), {
      source: "api/partner-branding/logo",
      metadata: { partner_tenant_id, storagePath },
    });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Logo-Download fehlgeschlagen" } },
      { status: 500 },
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const mime = detectMime(storagePath);

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(arrayBuffer.byteLength),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
