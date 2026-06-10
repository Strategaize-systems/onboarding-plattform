// V9.1 SLC-V9.1-A MT-3 — AWS SES Ireland Inbound-Vendor-Adapter.
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-3)
// DEC-194: Vendor-Adapter-Pattern. SES Inbound Ireland (eu-west-1) -> S3 -> SNS ->
//          Lambda `forward-ses-to-op-webhook` POSTet normalisiertes JSON an die OP-Route.
//
// Lambda-POST-Body (ARCHITECTURE.md V9.1 Flow A, Schritt 7):
//   { "raw_eml_base64": "...", "s3_key": "...", "message_id": "...", "recipient": "..." }

import { verifyInboundHmac } from "../hmac";
import type { InboundEmailVendor, ParsedInboundEvent } from "../types";

/** Vendor-Kennung, matched gegen ENV INBOUND_VENDOR. */
export const SES_IRELAND_VENDOR_ID = "ses-ireland";

interface SesLambdaPayload {
  raw_eml_base64?: unknown;
  s3_key?: unknown;
  message_id?: unknown;
  recipient?: unknown;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `aws-ses: missing or invalid required field '${field}' in SES Lambda payload`,
    );
  }
  return value;
}

export const awsSesVendor: InboundEmailVendor = {
  id: SES_IRELAND_VENDOR_ID,

  parseEvent(rawBody: string): ParsedInboundEvent {
    let payload: SesLambdaPayload;
    try {
      payload = JSON.parse(rawBody) as SesLambdaPayload;
    } catch {
      throw new Error("aws-ses: rawBody is not valid JSON");
    }
    if (payload === null || typeof payload !== "object") {
      throw new Error("aws-ses: rawBody JSON is not an object");
    }

    return {
      rawEmlBase64: requireString(payload.raw_eml_base64, "raw_eml_base64"),
      s3Key: requireString(payload.s3_key, "s3_key"),
      messageId: requireString(payload.message_id, "message_id"),
      recipient: requireString(payload.recipient, "recipient"),
    };
  },

  verifyHmac(rawBody: string, signature: string, secret: string): boolean {
    return verifyInboundHmac(rawBody, signature, secret);
  },
};
