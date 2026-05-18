import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { isReservedSlug } from "@/lib/partner/reserved-slugs";
import {
  extractClientIp,
  partnerResolveLimiter,
} from "@/lib/rate-limit";
import { captureException, captureInfo } from "@/lib/logger";

/**
 * V7 SLC-131 MT-6 — Public Partner Resolve Endpoint (FEAT-052).
 *
 * Aufgerufen von der Intelligence-Plattform-Landing-Page
 * (`intelligence.strategaize.com/p/<slug>`) als anonymer Browser-Fetch.
 * Kein Auth, kein Service-Key.
 *
 * Schritte:
 *   1) Reserve-Slug-Check (Application-Layer) → 404 ohne DB-Query.
 *   2) Rate-Limit per IP (60/h, in-memory) → 429 mit Retry-After.
 *   3) DB-Lookup lower(slug) → 404 wenn unbekannt.
 *   4) Diagnostic-Template-Existenz pruefen (boolean).
 *   5) 200 mit sanitiertem Body + Cache-Control: public, max-age=60.
 *
 * Audit-Log NUR fuer 429 (DSGVO-Hash-Pattern, Category=`partner_resolve`).
 * 200/404 werden nicht geloggt (Resolve ist niedrigwertig + Public).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Schritt 1 — Reserve-Slug-Check vor DB-Query
  if (isReservedSlug(slug)) {
    return NextResponse.json(
      { error: "unknown_partner" },
      { status: 404 },
    );
  }

  // Schritt 2 — Rate-Limit per IP
  const ip = extractClientIp(request);
  const rl = partnerResolveLimiter.check(ip);
  if (!rl.allowed) {
    // Audit-Log mit Hash der IP (DSGVO-Negativ-Probe per V7-Architektur).
    const ipHash = createHash("sha256").update(ip).digest("hex");
    captureInfo("partner_resolve rate-limit hit", {
      source: "api/public/partner/[slug]",
      metadata: {
        category: "partner_resolve",
        slug_lower: slug.toLowerCase(),
        ip_hash: ipHash,
        status: 429,
      },
    });
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        retry_after_seconds: rl.retryAfterSeconds ?? 3600,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds ?? 3600),
        },
      },
    );
  }

  const admin = createAdminClient();

  // Schritt 3 — DB-Lookup. Branding-Felder (logo_url, accent_color) liegen
  // in partner_branding_config (1:1 ueber tenant_id, optional). Display-Name
  // kann dort optional ueberschrieben werden — Resolver bevorzugt
  // pbc.display_name, faellt sonst auf po.display_name zurueck. Slice spricht
  // von partner_organization.{logo_url, accent_color} — Schema-Drift, in MT-6
  // korrigiert auf den realen Speicherort (siehe DECISIONS).
  const { data: partnerRow, error: partnerErr } = await admin
    .from("partner_organization")
    .select("tenant_id, display_name")
    .ilike("slug", slug)
    .maybeSingle();

  if (partnerErr) {
    captureException(new Error(partnerErr.message), {
      source: "api/public/partner/[slug]/lookup",
      metadata: { slug_lower: slug.toLowerCase() },
    });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 },
    );
  }

  if (!partnerRow) {
    return NextResponse.json(
      { error: "unknown_partner" },
      { status: 404 },
    );
  }

  // Schritt 3b — Branding-Lookup (LEFT, kann null sein bei Bestand)
  const { data: brandingRow, error: brandingErr } = await admin
    .from("partner_branding_config")
    .select("logo_url, primary_color, display_name")
    .eq("partner_tenant_id", partnerRow.tenant_id)
    .maybeSingle();

  if (brandingErr) {
    // Non-fatal: Branding-Fallback auf po.display_name + DB-Default-Color.
    captureException(new Error(brandingErr.message), {
      source: "api/public/partner/[slug]/branding_lookup",
      metadata: { slug_lower: slug.toLowerCase() },
    });
  }

  // Schritt 4 — Diagnostic-Template Existenz (boolean).
  // V7 = globaler Check; V8+ kann pro-Partner-Templates beruecksichtigen.
  const { data: templateRow, error: templateErr } = await admin
    .from("template")
    .select("id")
    .eq("slug", "partner_diagnostic")
    .limit(1)
    .maybeSingle();

  if (templateErr) {
    captureException(new Error(templateErr.message), {
      source: "api/public/partner/[slug]/template_check",
      metadata: { slug_lower: slug.toLowerCase() },
    });
  }

  const displayName =
    (brandingRow?.display_name && brandingRow.display_name.length > 0
      ? brandingRow.display_name
      : partnerRow.display_name) ?? "";
  const logoUrl = brandingRow?.logo_url ?? null;
  const accentColor = brandingRow?.primary_color ?? "#4454b8";
  const hasActiveDiagnosticTemplate = Boolean(templateRow);

  return NextResponse.json(
    {
      display_name: displayName,
      logo_url: logoUrl,
      accent_color: accentColor,
      has_active_diagnostic_template: hasActiveDiagnosticTemplate,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    },
  );
}
