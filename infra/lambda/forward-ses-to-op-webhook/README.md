# Lambda: `forward-ses-to-op-webhook`

V9.1 SLC-V9.1-A (FEAT-075 + FEAT-076). Brücke zwischen **AWS SES Inbound (Ireland, eu-west-1)**
und dem OP-Webhook `POST /api/inbound/email`.

## Flow

```
GF-Mail-Forward
  -> SES Receipt-Rule (bulk.strategaizetransition.com, Spam-Action BOUNCE)
  -> S3 PutObject  bulk-email-inbound-eu-west-1/inbound/<message-id>(.eml)
  -> S3 ObjectCreated-Notification
  -> SNS Topic ses-inbound-forward         (Payload = nur S3-Object-Reference, kein PII)
  -> Lambda forward-ses-to-op-webhook       (DIESE Function)
       1. liest EML aus S3
       2. extrahiert Recipient (To/X-Forwarded-To/Delivered-To) + Message-ID (S3-Key)
       3. signiert HMAC-SHA256 über den JSON-Body
       4. POST { raw_eml_base64, s3_key, message_id, recipient } an OP-Webhook
  -> OP /api/inbound/email  (HMAC-Verify -> 3-Schicht-Validation -> Storage + Persist)
```

Der SNS-Payload ist ein **S3-Event** (`Records[].s3.bucket.name` + `object.key`), kein
SES-Notification — entsprechend `ARCHITECTURE.md` ("kein PII im SNS-Payload, nur
S3-Object-Reference"). Recipient + Message-ID werden daher aus der EML bzw. dem S3-Key
abgeleitet.

## ENV (Lambda-Konfiguration — NICHT Coolify)

| Variable | Wert |
|---|---|
| `OP_WEBHOOK_URL` | `https://onboarding.strategaizetransition.com/api/inbound/email` |
| `HMAC_SECRET_ARN` | ARN des Secrets-Manager-Eintrags `INBOUND_WEBHOOK_HMAC_SECRET` |
| `AWS_REGION` | `eu-west-1` (vom Lambda-Runtime gesetzt) |

> **R6 (HMAC-Secret-Drift):** Der Secret-Value in AWS Secrets Manager
> (`INBOUND_WEBHOOK_HMAC_SECRET`) MUSS identisch zur Coolify-OP-ENV
> `INBOUND_WEBHOOK_HMAC_SECRET` sein. Bei Mismatch liefert der Webhook 401 für jede
> Mail → kein Empfang. Rotation quartalsweise im Founder-Maintenance-Window, beide
> Seiten synchron.

## IAM-Role `op-ses-inbound-forwarder`

- Trust-Policy: Service `lambda.amazonaws.com`
- `AWSLambdaBasicExecutionRole` (CloudWatch-Logs)
- Custom-Policy: `s3:GetObject` auf `bulk-email-inbound-eu-west-1/*`,
  `secretsmanager:GetSecretValue` auf den `INBOUND_WEBHOOK_HMAC_SECRET`-ARN

Vollständiges Policy-JSON: `docs/ARCHITECTURE.md` V9.1 Section "Lambda-Function-Role".

## Lokaler Smoke-Test (kein AWS nötig)

```bash
cd infra/lambda/forward-ses-to-op-webhook
node index.mjs
```

Mockt S3 + Secrets Manager + `fetch` und prüft End-to-End: Recipient-Extraktion,
Message-ID-Ableitung, Base64-Roundtrip, Header und — am wichtigsten — dass die
erzeugte HMAC-Signatur exakt der Recompute-Seite entspricht (= dem, was
`src/lib/inbound-email/hmac.ts` auf der OP-Seite verifiziert). Exit 0 = PASS.

## Deploy

```bash
bash scripts/deploy-lambda.sh
```

Installiert Prod-Deps, zippt `index.mjs` + `node_modules`, und ruft
`aws lambda update-function-code --function-name forward-ses-to-op-webhook
--region eu-west-1`. Voraussetzung: AWS-CLI mit Profil, das Lambda-Update darf, und
dass die Function bereits angelegt ist (ARCHITECTURE.md Step 5 — Founder-Setup).

## Runtime

Node 20.x · arm64 · 256 MB · Timeout 30s. AWS-SDK v3 ist im Node-20-Runtime enthalten;
die Deps sind zusätzlich deklariert, damit der lokale Smoke-Test deterministisch läuft
und der ZIP-Deploy keine Runtime-Version-Drift riskiert.
