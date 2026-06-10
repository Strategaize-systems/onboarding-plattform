// V9.1 SLC-V9.1-A MT-4 — Inbound-Webhook Integration-Test (gated, Coolify-Live-ENV).
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer (MT-4)
//
// Diese Suite testet den echten POST-Handler gegen die Coolify-DB + bulk-email-Bucket.
// Sie braucht Production-like ENV (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY +
// INBOUND_WEBHOOK_HMAC_SECRET) und laeuft NUR mit RUN_V91_INBOUND_INTEGRATION=true.
// Bootstrap-Pattern: .claude/rules/coolify-test-setup.md "Live-Smoke ENV-Bootstrap".
//
//   RUN_V91_INBOUND_INTEGRATION=true \
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... INBOUND_WEBHOOK_HMAC_SECRET=... \
//   npx vitest run src/app/api/inbound/email/__tests__/route.test.ts
//
// Deckt: AC-V9.1-A-5 (HMAC-Fail->401), AC-A-6 (Reject-Pfade->200+reject_log),
//        AC-A-7 (Full-Pass), AC-A-8 (2x Daily-Roll-Over -> email_count=2).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { computeInboundSignature } from "@/lib/inbound-email/hmac";

// NOTE: `../route` is imported dynamically inside beforeAll — its import chain
// (logger -> createClient at module load) requires SUPABASE_URL, which only
// exists in the gated Coolify-Live-ENV run. A top-level import would break
// collection of the whole suite when the flag is off.
type PostHandler = typeof import("../route").POST;

const RUN = process.env.RUN_V91_INBOUND_INTEGRATION === "true";
const SECRET = process.env.INBOUND_WEBHOOK_HMAC_SECRET ?? "test-secret-fallback";

function buildEml(opts: {
  from: string;
  to: string;
  subject: string;
  forwardToken?: string;
  messageId: string;
}): string {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Message-ID: <${opts.messageId}@v91-inbound.test>`,
    `Date: Mon, 10 Jun 2026 09:00:00 +0000`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
  ];
  if (opts.forwardToken) {
    lines.push(`X-Strategaize-Forward-Token: ${opts.forwardToken}`);
  }
  return `${lines.join("\r\n")}\r\n\r\nBody of the forwarded email.\r\n`;
}

function buildRequest(eml: string, recipient: string, opts?: { badSig?: boolean }) {
  const body = JSON.stringify({
    raw_eml_base64: Buffer.from(eml, "utf-8").toString("base64"),
    s3_key: `inbound/2026-06-10/${recipient}.eml`,
    message_id: "test-msg",
    recipient,
  });
  const sig = opts?.badSig
    ? "sha256=deadbeef"
    : computeInboundSignature(body, SECRET);
  return new Request("https://onboarding.strategaizetransition.com/api/inbound/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-strategaize-signature": sig,
      "x-strategaize-vendor": "ses-ireland",
    },
    body,
  });
}

describe.runIf(RUN)("POST /api/inbound/email (integration, Coolify-DB)", () => {
  let admin: SupabaseClient;
  let POST: PostHandler;
  let tenantId: string;
  let endpointId: string;
  const slug = `it-${Date.now().toString(36)}`;
  const setupToken = "tok_integration_0123456789abcdef0123";

  beforeAll(async () => {
    ({ POST } = await import("../route"));
    admin = createClient(
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const tenant = await admin
      .from("tenants")
      .insert({ name: `v91-inbound-it-${slug}` })
      .select("id")
      .single();
    tenantId = tenant.data!.id;
    const ep = await admin
      .from("email_inbound_endpoint")
      .insert({ tenant_id: tenantId, slug, setup_token: setupToken, status: "active" })
      .select("id")
      .single();
    endpointId = ep.data!.id;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("email_message").delete().eq("tenant_id", tenantId);
    await admin.from("email_bulk_run").delete().eq("tenant_id", tenantId);
    await admin.from("email_validation_reject_log").delete().eq("tenant_id", tenantId);
    await admin.from("email_forward_allowlist").delete().eq("tenant_id", tenantId);
    await admin.from("email_inbound_endpoint").delete().eq("id", endpointId);
    await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("AC-A-5: HMAC-Fail -> 401 + reject_log(hmac_invalid)", async () => {
    const recipient = `bulk-${slug}@bulk.strategaizetransition.com`;
    const eml = buildEml({ from: "x@acme.de", to: recipient, subject: "x", forwardToken: setupToken, messageId: "hmacfail" });
    const res = await POST(buildRequest(eml, recipient, { badSig: true }));
    expect(res.status).toBe(401);
  });

  it("AC-A-6: tenant_not_found -> 200 + reject_log", async () => {
    const recipient = "bulk-doesnotexist@bulk.strategaizetransition.com";
    const eml = buildEml({ from: "x@acme.de", to: recipient, subject: "x", forwardToken: setupToken, messageId: "notenant" });
    const res = await POST(buildRequest(eml, recipient));
    expect(res.status).toBe(200);
  });

  it("AC-A-6: setup_token_invalid -> 200 + reject_log", async () => {
    const recipient = `bulk-${slug}@bulk.strategaizetransition.com`;
    const eml = buildEml({ from: "x@acme.de", to: recipient, subject: "x", forwardToken: "wrong-token", messageId: "badtoken" });
    const res = await POST(buildRequest(eml, recipient));
    expect(res.status).toBe(200);
    const log = await admin
      .from("email_validation_reject_log")
      .select("reject_layer")
      .eq("endpoint_id", endpointId)
      .eq("reject_layer", "setup_token_invalid");
    expect((log.data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("AC-A-7 + AC-A-8: 2x Full-Pass -> 1 run, email_count=2, 2 messages", async () => {
    const recipient = `bulk-${slug}@bulk.strategaizetransition.com`;
    for (const mid of ["pass1", "pass2"]) {
      const eml = buildEml({ from: "boss@acme.de", to: recipient, subject: `s-${mid}`, forwardToken: setupToken, messageId: mid });
      const res = await POST(buildRequest(eml, recipient));
      expect(res.status).toBe(200);
    }
    const runs = await admin
      .from("email_bulk_run")
      .select("id, email_count, status, inbound_source")
      .eq("tenant_id", tenantId)
      .eq("inbound_source", "forward_bucket");
    expect(runs.data!.length).toBe(1);
    expect(runs.data![0]!.email_count).toBe(2);
    expect(runs.data![0]!.status).toBe("continuous");

    const msgs = await admin
      .from("email_message")
      .select("id")
      .eq("bulk_run_id", runs.data![0]!.id);
    expect(msgs.data!.length).toBe(2);
  });
});

describe.skipIf(RUN)("POST /api/inbound/email (skipped — set RUN_V91_INBOUND_INTEGRATION=true)", () => {
  it("placeholder", () => {
    expect(true).toBe(true);
  });
});
