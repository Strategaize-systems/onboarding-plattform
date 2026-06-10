// V9.1 SLC-V9.1-A MT-5 — AWS Lambda `forward-ses-to-op-webhook`.
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer (FEAT-075 + FEAT-076)
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-5)
// Arch:  docs/ARCHITECTURE.md V9.1 Flow A (Schritte 4-7) + Step 5 (Lambda-Deployment).
//
// Pfad: SES Inbound (eu-west-1) schreibt Raw-EML nach S3 (Bucket
// `bulk-email-inbound-eu-west-1`, Prefix `inbound/`). S3-ObjectCreated triggert SNS
// `ses-inbound-forward`, SNS invoked diese Lambda. Der SNS-Payload traegt KEIN PII —
// nur die S3-Object-Reference (ARCHITECTURE.md "kein PII im SNS-Payload"). Die Lambda
// liest die EML aus S3, extrahiert Recipient + Message-ID, signiert HMAC-SHA256 und
// POSTet `{ raw_eml_base64, s3_key, message_id, recipient }` an den OP-Webhook.
//
// Wire-Format (identisch zu src/lib/inbound-email/hmac.ts computeInboundSignature):
//   X-Strategaize-Signature: sha256=<hex(HMAC_SHA256(secret, rawBody-utf8))>
//   X-Strategaize-Vendor:    ses-ireland
//
// ENV (Lambda-Konfiguration, NICHT Coolify):
//   OP_WEBHOOK_URL   = https://onboarding.strategaizetransition.com/api/inbound/email
//   HMAC_SECRET_ARN  = <arn:aws:secretsmanager:eu-west-1:...:INBOUND_WEBHOOK_HMAC_SECRET>
//
// Runtime: Node 20.x / arm64 / 256 MB / 30s (Cold-Start cached den Secret-Value).
// Das AWS-SDK v3 ist im Node-20-Runtime enthalten und wird lazy importiert — dadurch
// laeuft der lokale Mock-Smoke-Test (`node index.mjs`) komplett ohne npm install.

import { createHmac } from "node:crypto";

const VENDOR_ID = "ses-ireland";

// Cold-Start-Caches (persistieren ueber warme Invocations).
let cachedSecret = null;
let s3Client;
let secretsClient;

// Dependency-Injection-Hook fuer den lokalen Mock-Smoke-Test (Pattern analog
// __setHaikuCallerForTests im OP-Repo). Production setzt das nie.
let depsOverride = null;
export function __setDepsForTest(deps) {
  depsOverride = deps;
  cachedSecret = null;
}

/** Reale Deps mit lazy SDK-Import (nur Production-Pfad, nie im Smoke). */
async function realDeps() {
  const [{ S3Client, GetObjectCommand }, { SecretsManagerClient, GetSecretValueCommand }] =
    await Promise.all([
      import("@aws-sdk/client-s3"),
      import("@aws-sdk/client-secrets-manager"),
    ]);
  s3Client ??= new S3Client({});
  secretsClient ??= new SecretsManagerClient({});
  return {
    getObjectBytes: async (bucket, key) => {
      const out = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      return out.Body.transformToByteArray();
    },
    getSecret: async (arn) => {
      const out = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: arn }),
      );
      return out.SecretString;
    },
    fetch: globalThis.fetch,
    env: process.env,
  };
}

/** `sha256=<hex>` ueber den rohen Body — Spiegel von computeInboundSignature(). */
function computeSignature(rawBody, secret) {
  return (
    "sha256=" + createHmac("sha256", secret).update(rawBody, "utf-8").digest("hex")
  );
}

async function loadSecret(deps) {
  if (cachedSecret) return cachedSecret;
  const arn = deps.env.HMAC_SECRET_ARN;
  if (!arn) throw new Error("HMAC_SECRET_ARN not configured");
  const value = await deps.getSecret(arn);
  if (!value) throw new Error("secret has no value");
  cachedSecret = value;
  return cachedSecret;
}

/** Header-Block (bis zur ersten Leerzeile) parsen + Folding aufloesen. */
function parseHeaders(rawEml) {
  const headerBlock = rawEml.split(/\r?\n\r?\n/, 1)[0] ?? "";
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const headers = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }
  return headers;
}

/**
 * Recipient-Extraktion: der Forward setzt die `bulk-<slug>@<domain>`-Adresse als
 * To-Header (ARCHITECTURE.md Flow A Schritt 1). Robust gegen Mail-Client-Varianz:
 * scannt To/Cc/X-Forwarded-To/Delivered-To, bevorzugt die erste `bulk-`-Adresse,
 * faellt sonst auf die erste gefundene Adresse zurueck. Die finale Slug-Validierung
 * macht der OP-Webhook (parseRecipientSlug) — hier nur best-effort Routing-Hint.
 */
function extractRecipient(headers) {
  const joined = [
    headers["x-forwarded-to"],
    headers["delivered-to"],
    headers["to"],
    headers["cc"],
  ]
    .filter(Boolean)
    .join(", ");
  const addresses = [...joined.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+/gi)].map(
    (m) => m[0],
  );
  return addresses.find((a) => /^bulk-/i.test(a)) ?? addresses[0] ?? null;
}

/** SES nennt das S3-Object nach der Message-ID (Prefix `inbound/`, ggf. `.eml`). */
function messageIdFromKey(key) {
  const base = key.slice(key.lastIndexOf("/") + 1);
  return base.replace(/\.eml$/i, "") || base;
}

/** Eine einzelne S3-Reference -> EML lesen, signieren, an OP-Webhook POSTen. */
async function forwardObject(deps, secret, bucket, key) {
  const bytes = await deps.getObjectBytes(bucket, key);
  const rawEml = Buffer.from(bytes);
  const headers = parseHeaders(rawEml.toString("utf-8"));

  const recipient = extractRecipient(headers);
  if (!recipient) {
    throw new Error(`no recipient header found in s3://${bucket}/${key}`);
  }

  const payload = {
    raw_eml_base64: rawEml.toString("base64"),
    s3_key: key,
    message_id: messageIdFromKey(key),
    recipient,
  };
  const body = JSON.stringify(payload);

  const webhookUrl = deps.env.OP_WEBHOOK_URL;
  if (!webhookUrl) throw new Error("OP_WEBHOOK_URL not configured");

  const res = await deps.fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-strategaize-signature": computeSignature(body, secret),
      "x-strategaize-vendor": VENDOR_ID,
    },
    body,
  });

  // Non-2xx -> throw, damit die AWS-Lambda-Retry-Policy greift (HMAC-401 ist ein
  // echter Fehler, der untersucht werden muss; alle anderen Reject-Pfade liefern 200).
  if (!res.ok) {
    throw new Error(`OP webhook ${webhookUrl} returned ${res.status}`);
  }
  return { key, status: res.status, recipient };
}

/** SNS-Records -> S3-Event(s) -> jedes Object weiterleiten. */
export async function handler(event) {
  const deps = depsOverride ?? (await realDeps());
  const secret = await loadSecret(deps);

  const results = [];
  for (const snsRecord of event?.Records ?? []) {
    const message = snsRecord?.Sns?.Message;
    if (!message) continue;
    let s3Event;
    try {
      s3Event = JSON.parse(message);
    } catch {
      throw new Error("SNS Message is not valid JSON (expected S3 event)");
    }
    for (const s3Record of s3Event?.Records ?? []) {
      const bucket = s3Record?.s3?.bucket?.name;
      const rawKey = s3Record?.s3?.object?.key;
      if (!bucket || !rawKey) continue;
      // S3 url-encodet Object-Keys (Leerzeichen als '+').
      const key = decodeURIComponent(rawKey.replace(/\+/g, " "));
      results.push(await forwardObject(deps, secret, bucket, key));
    }
  }
  return { forwarded: results.length, results };
}

// ---------------------------------------------------------------------------
// Lokaler Mock-Smoke-Test: `node index.mjs` (Spec MT-5 Verification).
// Verifiziert ohne AWS: S3-Read-Mock -> Recipient-Extraktion -> HMAC-Signatur
// roundtrip -> POST-Payload-Shape. Exit 0 = PASS, Exit 1 = FAIL.
// ---------------------------------------------------------------------------
async function runSmoke() {
  const SECRET = "smoke-secret-0123456789abcdef";
  const sampleEml = [
    "From: boss@acme.de",
    "To: bulk-acmeslug@bulk.strategaizetransition.com",
    "Subject: Quartalszahlen Q2",
    "Message-ID: <orig-123@acme.de>",
    "X-Strategaize-Forward-Token: tok_smoke_value",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Body of the forwarded email.",
    "",
  ].join("\r\n");

  let captured = null;
  __setDepsForTest({
    getObjectBytes: async () => new Uint8Array(Buffer.from(sampleEml, "utf-8")),
    getSecret: async () => SECRET,
    fetch: async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 200 };
    },
    env: {
      OP_WEBHOOK_URL: "https://onboarding.strategaizetransition.com/api/inbound/email",
      HMAC_SECRET_ARN: "arn:aws:secretsmanager:eu-west-1:000:smoke",
    },
  });

  const event = {
    Records: [
      {
        Sns: {
          Message: JSON.stringify({
            Records: [
              {
                s3: {
                  bucket: { name: "bulk-email-inbound-eu-west-1" },
                  object: { key: "inbound/ses-msg-id-abc123.eml" },
                },
              },
            ],
          }),
        },
      },
    ],
  };

  const checks = [];
  const out = await handler(event);
  checks.push(["forwarded count = 1", out.forwarded === 1]);

  const body = captured?.init?.body;
  const payload = JSON.parse(body);
  checks.push([
    "recipient extracted from To header",
    payload.recipient === "bulk-acmeslug@bulk.strategaizetransition.com",
  ]);
  checks.push([
    "message_id from S3 key basename (no .eml)",
    payload.message_id === "ses-msg-id-abc123",
  ]);
  checks.push([
    "s3_key passed through",
    payload.s3_key === "inbound/ses-msg-id-abc123.eml",
  ]);
  checks.push([
    "raw_eml_base64 decodes back to EML",
    Buffer.from(payload.raw_eml_base64, "base64").toString("utf-8") === sampleEml,
  ]);
  checks.push([
    "vendor header = ses-ireland",
    captured?.init?.headers["x-strategaize-vendor"] === VENDOR_ID,
  ]);

  // Signatur muss exakt der OP-Webhook-Verify-Seite entsprechen.
  const expectedSig =
    "sha256=" + createHmac("sha256", SECRET).update(body, "utf-8").digest("hex");
  checks.push([
    "HMAC signature matches recomputation over exact body",
    captured?.init?.headers["x-strategaize-signature"] === expectedSig,
  ]);

  let allPass = true;
  for (const [name, pass] of checks) {
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) allPass = false;
  }
  console.log(allPass ? "\nSMOKE PASS" : "\nSMOKE FAIL");
  process.exit(allPass ? 0 : 1);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("index.mjs")) {
  runSmoke();
}
