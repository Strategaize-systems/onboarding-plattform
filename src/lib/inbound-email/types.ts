// V9.1 SLC-V9.1-A MT-3 — Inbound-Email Vendor-Adapter Shared-Types.
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-3)
// DEC-194: Vendor-Adapter-Pattern (analog Bedrock-Client) — Webhook-Endpoint ist
//          vendor-agnostisch, laedt Implementation aus ENV INBOUND_VENDOR.
//
// MT-3 definiert die Adapter-Typen (ParsedInboundEvent, InboundEmailVendor,
// RejectReason). Die Validation-/Tenant-Lookup-Typen (ValidationResult,
// TenantLookupResult) kommen mit ihren Consumern in MT-4 hinzu.

/**
 * Reject-Layer-Werte — 1:1 Spiegel der email_validation_reject_log.reject_layer
 * CHECK-Constraint aus MIG-057 (sql/migrations/112_v91_inbound_foundation.sql).
 * Bei Erweiterung der CHECK-Constraint muss dieser Union mitgezogen werden.
 */
export type RejectReason =
  | "hmac_invalid"
  | "tenant_not_found"
  | "endpoint_inactive"
  | "setup_token_missing"
  | "setup_token_invalid"
  | "allowlist_mismatch";

/**
 * Vendor-agnostisches, normalisiertes Inbound-Event nach Adapter-Parse.
 * Entspricht dem Lambda-POST-Body `{ raw_eml_base64, s3_key, message_id, recipient }`
 * (ARCHITECTURE.md V9.1 Flow A, Schritt 7), in camelCase normalisiert.
 */
export interface ParsedInboundEvent {
  /** Base64-encodete Original-EML (RFC-5322), aus S3 gelesen von der Lambda. */
  rawEmlBase64: string;
  /** S3-Object-Key der Original-EML im bulk-email-inbound-Bucket. */
  s3Key: string;
  /** SES Message-ID des Inbound-Mails. */
  messageId: string;
  /** Empfaenger-Adresse (`bulk-<slug>@bulk.strategaizetransition.com`). */
  recipient: string;
}

/**
 * Vendor-Adapter-Interface. Jeder Inbound-Provider (SES Ireland, Plan-B Mailgun EU)
 * implementiert Event-Parsing + HMAC-Verify. Die Webhook-Route bleibt vendor-agnostisch
 * und laedt die Implementation via getInboundEmailVendor() (vendors/index.ts).
 */
export interface InboundEmailVendor {
  /** Stabile Vendor-Kennung, matched gegen ENV INBOUND_VENDOR (z.B. "ses-ireland"). */
  readonly id: string;
  /** Parsed den rohen POST-Body in ein normalisiertes ParsedInboundEvent. Wirft bei Malformed-Payload. */
  parseEvent(rawBody: string): ParsedInboundEvent;
  /** Constant-time HMAC-SHA256-Verify des rohen POST-Bodys gegen den Signatur-Header. */
  verifyHmac(rawBody: string, signature: string, secret: string): boolean;
}
