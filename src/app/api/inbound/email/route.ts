// V9.1 SLC-V9.1-A MT-4 — Inbound-Webhook `/api/inbound/email` (FEAT-075 + FEAT-076).
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-4, Flow A)
//
// AWS SES Inbound (Ireland) -> S3 -> SNS -> Lambda `forward-ses-to-op-webhook`
// POSTet hier ein HMAC-signiertes JSON `{ raw_eml_base64, s3_key, message_id, recipient }`.
//
// Flow A (ARCHITECTURE.md V9.1):
//   1. HMAC-Verify            -> Fail: reject_log(hmac_invalid) + 401
//   2. Vendor-Adapter parse   -> Malformed: 400
//   3. Tenant-Lookup (slug)   -> Miss:  reject_log(tenant_not_found)   + 200
//   4. Endpoint-Status        -> !active: reject_log(endpoint_inactive) + 200
//   5. Setup-Token            -> Fail:  reject_log(setup_token_*)        + 200
//   6. Sender-Allowlist (opt) -> Fail:  reject_log(allowlist_mismatch)   + 200
//   7. Storage-PUT raw EML
//   8/9. rpc_inbound_record_message: Daily-Roll-Over + email_message (atomic)
//   10. Audit (error_log via captureInfo, OP-kanonisch)
//   11. 200 OK
//
// Alle Reject-Pfade ausser HMAC returnen 200 (silent-drop) — vermeidet AWS-Lambda-Retry-Loop.

import { NextResponse } from "next/server";
import { simpleParser } from "mailparser";

import { createAdminClient } from "@/lib/supabase/admin";
import { captureException, captureInfo } from "@/lib/logger";
import { getInboundEmailVendor } from "@/lib/inbound-email/vendors";
import { verifySetupToken } from "@/lib/inbound-email/validation/setup-token";
import { evaluateSenderAllowlist } from "@/lib/inbound-email/validation/sender-allowlist";
import {
  parseRecipientSlug,
  lookupEndpointBySlug,
} from "@/lib/inbound-email/tenant-lookup";
import { insertRejectLog } from "@/lib/inbound-email/reject-log";
import {
  buildRawStoragePath,
  persistRawEml,
} from "@/lib/inbound-email/storage-persist";

export const runtime = "nodejs";

const LOG_SOURCE = "email_inbound";
const SIGNATURE_HEADER = "x-strategaize-signature";
const VENDOR_HEADER = "x-strategaize-vendor";
const FORWARD_TOKEN_HEADER = "x-strategaize-forward-token";

/** mailparser header value -> trimmed string | null. */
function headerToString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim() || null;
  }
  return null;
}

function domainOf(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : null;
}

/** silent-drop 200 (non-HMAC reject paths) — avoids AWS-Lambda-Retry-Loop. */
function ok(body: Record<string, unknown> = { ok: true }) {
  return NextResponse.json(body, { status: 200 });
}

export async function POST(request: Request) {
  const secret = process.env.INBOUND_WEBHOOK_HMAC_SECRET;
  if (!secret) {
    captureException(
      new Error("INBOUND_WEBHOOK_HMAC_SECRET not configured"),
      { source: LOG_SOURCE },
    );
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER) ?? "";
  const vendor = getInboundEmailVendor(
    request.headers.get(VENDOR_HEADER) ?? undefined,
  );
  const admin = createAdminClient();

  // 1. HMAC-Verify -> Fail: reject_log + 401 (the only non-200 reject path).
  if (!vendor.verifyHmac(rawBody, signature, secret)) {
    await insertRejectLog(admin, { rejectLayer: "hmac_invalid" });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // 2. Vendor-Adapter parse the POST body.
  let event;
  try {
    event = vendor.parseEvent(rawBody);
  } catch (err) {
    captureException(err, { source: LOG_SOURCE, metadata: { phase: "parseEvent" } });
    return NextResponse.json({ error: "malformed payload" }, { status: 400 });
  }

  // Parse the raw EML once for headers + body fields.
  const rawEml = Buffer.from(event.rawEmlBase64, "base64");
  const mail = await simpleParser(rawEml);
  const fromAddress =
    (Array.isArray(mail.from?.value) ? mail.from?.value[0]?.address : undefined)
      ?.toLowerCase() ?? null;
  const subject = mail.subject ?? "";
  const forwardToken = headerToString(mail.headers.get(FORWARD_TOKEN_HEADER));
  const rejectBase = {
    senderDomain: domainOf(fromAddress),
    senderFullEmail: fromAddress,
    subjectSnippet: subject,
  };

  // 3. Tenant-Lookup via Catchall-Local-Part.
  const slug = parseRecipientSlug(event.recipient);
  const endpoint = slug ? await lookupEndpointBySlug(admin, slug) : null;
  if (!endpoint) {
    await insertRejectLog(admin, {
      ...rejectBase,
      rejectLayer: "tenant_not_found",
    });
    return ok();
  }

  const scoped = {
    ...rejectBase,
    tenantId: endpoint.tenantId,
    endpointId: endpoint.endpointId,
  };

  // 4. Endpoint-Status.
  if (endpoint.status !== "active") {
    await insertRejectLog(admin, { ...scoped, rejectLayer: "endpoint_inactive" });
    return ok();
  }

  // 5. Setup-Token (Schicht 2).
  if (forwardToken === null) {
    await insertRejectLog(admin, { ...scoped, rejectLayer: "setup_token_missing" });
    return ok();
  }
  if (!verifySetupToken(forwardToken, endpoint.setupToken)) {
    await insertRejectLog(admin, { ...scoped, rejectLayer: "setup_token_invalid" });
    return ok();
  }

  // 6. Optional Sender-Allowlist (Schicht 3).
  const { data: allowlistRows, error: allowlistError } = await admin
    .from("email_forward_allowlist")
    .select("pattern, pattern_type, enabled")
    .eq("endpoint_id", endpoint.endpointId);
  if (allowlistError) {
    captureException(
      new Error(`allowlist SELECT failed: ${allowlistError.message}`),
      { source: LOG_SOURCE, metadata: { endpointId: endpoint.endpointId } },
    );
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
  const decision = evaluateSenderAllowlist(fromAddress, allowlistRows ?? []);
  if (!decision.allowed) {
    await insertRejectLog(admin, { ...scoped, rejectLayer: "allowlist_mismatch" });
    return ok();
  }

  // 7. Storage-PUT raw EML.
  const anchorDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rawStoragePath = buildRawStoragePath(
    endpoint.tenantId,
    endpoint.endpointId,
    anchorDate,
    event.messageId,
  );
  try {
    await persistRawEml(admin, rawStoragePath, rawEml);
  } catch (err) {
    captureException(err, {
      source: LOG_SOURCE,
      metadata: { phase: "storage", endpointId: endpoint.endpointId },
    });
    return NextResponse.json({ error: "storage failed" }, { status: 500 });
  }

  // 8/9. Atomic Daily-Roll-Over + email_message (rpc, DEC-203).
  const { data: bulkRunId, error: rpcError } = await admin.rpc(
    "rpc_inbound_record_message",
    {
      p_tenant_id: endpoint.tenantId,
      p_endpoint_id: endpoint.endpointId,
      p_anchor_date: anchorDate,
      p_source_file_name: `${endpoint.slug}-continuous`,
      p_file_hash: `forward-bucket:${endpoint.endpointId}:${anchorDate}`,
      p_storage_path: `${endpoint.tenantId}/forward-bucket/${endpoint.endpointId}/${anchorDate}/`,
      p_message: {
        message_id: event.messageId,
        in_reply_to: mail.inReplyTo ?? null,
        references_array: normalizeReferences(mail.references),
        from_address: fromAddress,
        to_addresses: [event.recipient.toLowerCase()],
        cc_addresses: [],
        subject,
        date: mail.date ? mail.date.toISOString() : null,
        body_text: mail.text ?? "",
        body_html: typeof mail.html === "string" ? mail.html : null,
        has_attachments: (mail.attachments?.length ?? 0) > 0,
        attachment_metadata: [],
        raw_storage_path: rawStoragePath,
      },
    },
  );
  if (rpcError || !bulkRunId) {
    captureException(
      new Error(`rpc_inbound_record_message failed: ${rpcError?.message ?? "no id"}`),
      { source: LOG_SOURCE, metadata: { endpointId: endpoint.endpointId } },
    );
    return NextResponse.json({ error: "persist failed" }, { status: 500 });
  }

  // 10. Audit (OP-kanonisch: error_log via captureInfo, level='info').
  captureInfo("email_inbound_received", {
    source: LOG_SOURCE,
    metadata: {
      messageId: event.messageId,
      senderDomain: rejectBase.senderDomain,
      endpointId: endpoint.endpointId,
      tenantId: endpoint.tenantId,
      bulkRunId,
      vendor: vendor.id,
    },
  });

  // 11. 200 OK.
  return NextResponse.json({ ok: true, bulk_run_id: bulkRunId }, { status: 200 });
}

function normalizeReferences(refs: string | string[] | undefined): string[] {
  if (!refs) return [];
  if (Array.isArray(refs)) return refs.map((r) => r.trim()).filter(Boolean);
  return refs.split(/\s+/).map((r) => r.trim()).filter(Boolean);
}
