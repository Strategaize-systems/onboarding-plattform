// V9.1 SLC-V9.1-A MT-3 — Inbound-Email Vendor-Factory.
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-3)
// DEC-194: getInboundEmailVendor() liest ENV INBOUND_VENDOR und liefert die
//          passende Adapter-Implementation. Webhook-Route bleibt vendor-agnostisch.
//
// Factory-Pattern analog src/lib/ai/bedrock-haiku/index.ts (resolve via ENV + Override).
// Plan-B-Vendor (Mailgun EU) wird hier registriert, sobald implementiert (DEC-194 R2).

import { awsSesVendor, SES_IRELAND_VENDOR_ID } from "./aws-ses";
import type { InboundEmailVendor } from "../types";

const DEFAULT_INBOUND_VENDOR = SES_IRELAND_VENDOR_ID;

const VENDORS: Record<string, InboundEmailVendor> = {
  [SES_IRELAND_VENDOR_ID]: awsSesVendor,
};

/**
 * Liefert den Inbound-Vendor-Adapter. Reihenfolge: expliziter Override ->
 * ENV INBOUND_VENDOR -> Default ('ses-ireland'). Wirft bei unbekanntem Vendor-Id.
 */
export function getInboundEmailVendor(override?: string): InboundEmailVendor {
  const id = override || process.env.INBOUND_VENDOR || DEFAULT_INBOUND_VENDOR;
  const vendor = VENDORS[id];
  if (!vendor) {
    throw new Error(
      `Unknown INBOUND_VENDOR '${id}'. Supported: ${Object.keys(VENDORS).join(", ")}`,
    );
  }
  return vendor;
}

export { SES_IRELAND_VENDOR_ID } from "./aws-ses";
