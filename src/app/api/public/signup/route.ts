/**
 * V7 SLC-132 MT-6 — Public-Signup-Endpoint (FEAT-051 + FEAT-053-Storage).
 *
 * `POST /api/public/signup` — wird ausschliesslich von der Intelligence-
 * Plattform-Server-Side aufgerufen (Service-Key x-strategaize-service-key
 * im Header, NIE im Browser-Bundle). Schreibt einen `pending_signup`-Row
 * mit SHA-256-Token-Hash + 24h TTL und sendet Verify-Mail via IONOS-SMTP.
 *
 * Pipeline (Architecture-Block "V7 Signup-Flow" Schritt 6 + Slice MT-6):
 *   1.  extractClientIp(request)
 *   2.  verifyServiceKey vs ENV (timing-safe)  → 401
 *   3.  signupLimiter.check(`${ip}::signup`)   → 429
 *   4.  zod-Validation Body                     → 422
 *   5.  Email-Domain-Block-Check                → 422
 *   6.  Slug → partner_tenant_id Lookup        → 404
 *   7.  findActivePendingSignup                 → 409
 *   8.  Cross-Check partner_client_mapping/profiles → 409
 *   9.  crypto.randomBytes(32).hex → token + hashWithSha256
 *  10.  insertPendingSignup({...})  (UNIQUE 23505 → 409)
 *  11.  renderSignupVerifyTemplate + transporter.sendMail
 *       (SMTP-Fail wird geloggt, aber 202 trotzdem)
 *  12.  captureInfo error_log (Hash-Only-Metadata, DSGVO)
 *  13.  202 { status:'pending_email_verify', expires_at }
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractClientIp,
  signupLimiter,
} from "@/lib/rate-limit";
import {
  verifyServiceKey,
  hashWithSha256,
} from "@/lib/auth/service-key";
import {
  insertPendingSignup,
  findActivePendingSignup,
} from "@/lib/signup/pending-signup-repo";
import { signupBodySchema } from "@/lib/signup/signup-schema";
import {
  renderSignupVerifyTemplate,
  sendMail,
} from "@/lib/email";
import { captureException, captureInfo } from "@/lib/logger";

const SOURCE = "api/public/signup";
const PENDING_TTL_HOURS = 24; // DEC-131
const DSGVO_CONSENT_TEXT_VERSION_MIN = "v1-2026-05"; // DEC-129 / DSGVO

function parseBlockedDomains(): Set<string> {
  const raw = process.env.PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS ?? "";
  return new Set(
    raw
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0)
  );
}

function ipHashForAudit(ip: string): string {
  return hashWithSha256(ip);
}

function emailHashForAudit(emailLower: string): string {
  return hashWithSha256(emailLower);
}

export async function POST(request: NextRequest) {
  // ── Schritt 1 — extractClientIp ────────────────────────────────────────
  const ip = extractClientIp(request);
  const ipHash = ipHashForAudit(ip);

  // ── Schritt 2 — verifyServiceKey ───────────────────────────────────────
  const headerKey = request.headers.get("x-strategaize-service-key");
  let serviceKeyOk = false;
  try {
    serviceKeyOk = verifyServiceKey(
      headerKey,
      process.env.PUBLIC_SIGNUP_SERVICE_KEY
    );
  } catch (e) {
    // ENV not configured — defensive 500. Production-Deploy must set the
    // ENV via Coolify BEFORE first request lands here.
    captureException(e, {
      source: SOURCE,
      metadata: {
        category: "public_signup",
        reason: "service_key_env_missing",
        ip_hash: ipHash,
        status: 500,
      },
    });
    return NextResponse.json(
      { error: "service_unavailable" },
      { status: 500 }
    );
  }

  if (!serviceKeyOk) {
    captureInfo("public_signup invalid_service_key", {
      source: SOURCE,
      metadata: {
        category: "public_signup",
        reason: "invalid_service_key",
        ip_hash: ipHash,
        status: 401,
      },
    });
    return NextResponse.json(
      { error: "invalid_service_key" },
      { status: 401 }
    );
  }

  // ── Schritt 3 — signupLimiter (3/h/IP) ─────────────────────────────────
  const rl = signupLimiter.check(`${ip}::signup`);
  if (!rl.allowed) {
    captureInfo("public_signup rate_limit_exceeded", {
      source: SOURCE,
      metadata: {
        category: "public_signup",
        reason: "rate_limit_exceeded",
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
      }
    );
  }

  // ── Schritt 4 — zod-Validation ─────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "validation_failed", details: ["body_not_json"] },
      { status: 422 }
    );
  }

  const parsed = signupBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => i.message);
    return NextResponse.json(
      { error: "validation_failed", details },
      { status: 422 }
    );
  }
  const body = parsed.data;
  const emailLower = body.email.trim().toLowerCase();
  const emailHash = emailHashForAudit(emailLower);

  // ── Schritt 5 — Email-Domain-Block ─────────────────────────────────────
  const domain = emailLower.split("@")[1] ?? "";
  const blocked = parseBlockedDomains();
  if (blocked.has(domain)) {
    captureInfo("public_signup disposable_email_domain", {
      source: SOURCE,
      metadata: {
        category: "public_signup",
        reason: "disposable_email_domain",
        domain,
        ip_hash: ipHash,
        email_hash: emailHash,
        status: 422,
      },
    });
    return NextResponse.json(
      {
        error: "validation_failed",
        details: ["disposable_email_domain"],
      },
      { status: 422 }
    );
  }

  // ── Schritt 6 — Slug → partner_tenant_id ───────────────────────────────
  const admin = createAdminClient();
  const { data: partnerRow, error: partnerErr } = await admin
    .from("partner_organization")
    .select("tenant_id, display_name, contact_email")
    .ilike("slug", body.partner_slug)
    .maybeSingle();

  if (partnerErr) {
    captureException(new Error(partnerErr.message), {
      source: SOURCE,
      metadata: {
        category: "public_signup",
        reason: "partner_lookup_failed",
        ip_hash: ipHash,
        email_hash: emailHash,
        status: 500,
      },
    });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }

  if (!partnerRow) {
    captureInfo("public_signup unknown_partner", {
      source: SOURCE,
      metadata: {
        category: "public_signup",
        reason: "unknown_partner",
        partner_slug: body.partner_slug,
        ip_hash: ipHash,
        email_hash: emailHash,
        status: 404,
      },
    });
    return NextResponse.json(
      { error: "unknown_partner" },
      { status: 404 }
    );
  }

  const partnerTenantId = partnerRow.tenant_id as string;
  const partnerDisplayName = (partnerRow.display_name as string) ?? "";
  const partnerContactEmail =
    (partnerRow.contact_email as string | null) ?? null;

  // ── Schritt 7 — findActivePendingSignup ────────────────────────────────
  const existingPending = await findActivePendingSignup(
    partnerTenantId,
    emailLower
  );
  if (existingPending) {
    captureInfo("public_signup email_already_pending", {
      source: SOURCE,
      metadata: {
        category: "public_signup",
        reason: "email_already_pending",
        ip_hash: ipHash,
        email_hash: emailHash,
        partner_tenant_id: partnerTenantId,
        status: 409,
      },
    });
    return NextResponse.json(
      { error: "email_already_signed_up" },
      { status: 409 }
    );
  }

  // ── Schritt 8 — Cross-Check partner_client_mapping/profiles ────────────
  // Wenn dieser Email bereits ein client_tenant_id beim selben Partner zugeordnet
  // ist, ist der Mandant schon angelegt (per Partner-Invite oder vorheriger
  // Self-Signup-Verify). Strikter 409 per DEC-135.
  const { data: existingProfiles, error: profileErr } = await admin
    .from("profiles")
    .select("id, tenant_id")
    .eq("email", emailLower);

  if (profileErr) {
    captureException(new Error(profileErr.message), {
      source: SOURCE,
      metadata: {
        category: "public_signup",
        reason: "profile_lookup_failed",
        ip_hash: ipHash,
        email_hash: emailHash,
        status: 500,
      },
    });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }

  if (existingProfiles && existingProfiles.length > 0) {
    const clientTenantIds = existingProfiles
      .map((p) => p.tenant_id as string | null)
      .filter((id): id is string => id !== null);

    if (clientTenantIds.length > 0) {
      const { data: mappingMatches, error: mappingErr } = await admin
        .from("partner_client_mapping")
        .select("id")
        .eq("partner_tenant_id", partnerTenantId)
        .in("client_tenant_id", clientTenantIds);

      if (mappingErr) {
        captureException(new Error(mappingErr.message), {
          source: SOURCE,
          metadata: {
            category: "public_signup",
            reason: "mapping_lookup_failed",
            ip_hash: ipHash,
            email_hash: emailHash,
            status: 500,
          },
        });
        return NextResponse.json(
          { error: "internal_error" },
          { status: 500 }
        );
      }

      if (mappingMatches && mappingMatches.length > 0) {
        captureInfo("public_signup email_already_mapped", {
          source: SOURCE,
          metadata: {
            category: "public_signup",
            reason: "email_already_mapped",
            ip_hash: ipHash,
            email_hash: emailHash,
            partner_tenant_id: partnerTenantId,
            status: 409,
          },
        });
        return NextResponse.json(
          { error: "email_already_signed_up" },
          { status: 409 }
        );
      }
    }
  }

  // ── Schritt 9 — Token-Generation ───────────────────────────────────────
  const tokenClear = randomBytes(32).toString("hex");
  const tokenHash = hashWithSha256(tokenClear);

  // ── Schritt 10 — insertPendingSignup ───────────────────────────────────
  let inserted: { id: string; expires_at: string };
  try {
    inserted = await insertPendingSignup({
      partner_tenant_id: partnerTenantId,
      email_lower: emailLower,
      first_name: body.first_name,
      last_name: body.last_name,
      company_name: body.company_name ?? null,
      dsgvo_consent_text_version:
        body.dsgvo_consent_text_version || DSGVO_CONSENT_TEXT_VERSION_MIN,
      verify_token_hash: tokenHash,
      ttl_hours: PENDING_TTL_HOURS,
    });
  } catch (e) {
    // Idempotency race: a parallel signup-call may have inserted between
    // step 7 (findActivePendingSignup → null) and step 10 (INSERT). UNIQUE
    // partial index (partner_tenant_id, email_lower) WHERE pending fires
    // PostgreSQL error 23505 → mapped to 409 per DEC-135.
    const code = (e as { code?: string }).code;
    if (code === "23505") {
      captureInfo("public_signup unique_race_409", {
        source: SOURCE,
        metadata: {
          category: "public_signup",
          reason: "unique_race",
          ip_hash: ipHash,
          email_hash: emailHash,
          partner_tenant_id: partnerTenantId,
          status: 409,
        },
      });
      return NextResponse.json(
        { error: "email_already_signed_up" },
        { status: 409 }
      );
    }
    captureException(e, {
      source: SOURCE,
      metadata: {
        category: "public_signup",
        reason: "pending_insert_failed",
        ip_hash: ipHash,
        email_hash: emailHash,
        partner_tenant_id: partnerTenantId,
        status: 500,
      },
    });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }

  // ── Schritt 11 — Email-Send (best-effort, 202 trotzdem bei SMTP-Fail) ──
  const publicAppUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.PUBLIC_APP_URL ?? "";
  const verifyUrl = `${publicAppUrl}/auth/verify-signup?token=${tokenClear}`;
  const { subject, html, text } = renderSignupVerifyTemplate({
    partner_display_name: partnerDisplayName,
    partner_contact_email: partnerContactEmail,
    verify_url: verifyUrl,
    expires_at_iso: inserted.expires_at,
    recipient_first_name: body.first_name,
  });

  const from = `Strategaize <${process.env.SIGNUP_FROM_EMAIL ?? "onboarding@strategaize.de"}>`;
  try {
    await sendMail({
      from,
      to: emailLower,
      replyTo: partnerContactEmail ?? undefined,
      subject,
      html,
      text,
    });
  } catch (e) {
    // SMTP-Fail: Mandant kann via Re-Signup retryen. Log fuer Monitoring,
    // aber 202 retournen (R-3).
    captureException(e, {
      source: SOURCE,
      metadata: {
        category: "public_signup",
        reason: "smtp_send_failed",
        ip_hash: ipHash,
        email_hash: emailHash,
        partner_tenant_id: partnerTenantId,
        pending_signup_id: inserted.id,
        status: 202,
      },
    });
  }

  // ── Schritt 12 — Audit-Log 202 (Hash-Only-Metadata) ────────────────────
  captureInfo("public_signup accepted_pending_verify", {
    source: SOURCE,
    metadata: {
      category: "public_signup",
      reason: "accepted_pending_verify",
      ip_hash: ipHash,
      email_hash: emailHash,
      partner_tenant_id: partnerTenantId,
      partner_slug: body.partner_slug,
      pending_signup_id: inserted.id,
      status: 202,
    },
  });

  // ── Schritt 13 — 202 Response ──────────────────────────────────────────
  return NextResponse.json(
    {
      status: "pending_email_verify",
      expires_at: inserted.expires_at,
    },
    { status: 202 }
  );
}
