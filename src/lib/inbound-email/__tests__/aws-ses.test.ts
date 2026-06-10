// V9.1 SLC-V9.1-A MT-3 — AWS SES Vendor-Adapter + Factory Unit-Tests (offline).

import { describe, it, expect, afterEach } from "vitest";

import { awsSesVendor, SES_IRELAND_VENDOR_ID } from "../vendors/aws-ses";
import { getInboundEmailVendor } from "../vendors";
import { computeInboundSignature } from "../hmac";

const VALID_PAYLOAD = {
  raw_eml_base64: "RnJvbTogYUBiLmRl",
  s3_key: "inbound/2026-06-10/msg-42.eml",
  message_id: "msg-42",
  recipient: "bulk-acme@bulk.strategaizetransition.com",
};

describe("awsSesVendor.parseEvent", () => {
  it("maps the Lambda JSON payload to a normalized ParsedInboundEvent", () => {
    const event = awsSesVendor.parseEvent(JSON.stringify(VALID_PAYLOAD));
    expect(event).toEqual({
      rawEmlBase64: VALID_PAYLOAD.raw_eml_base64,
      s3Key: VALID_PAYLOAD.s3_key,
      messageId: VALID_PAYLOAD.message_id,
      recipient: VALID_PAYLOAD.recipient,
    });
  });

  it("throws on invalid JSON", () => {
    expect(() => awsSesVendor.parseEvent("not-json{")).toThrow(
      /not valid JSON/,
    );
  });

  it("throws when a required field is missing", () => {
    const { recipient, ...withoutRecipient } = VALID_PAYLOAD;
    void recipient;
    expect(() =>
      awsSesVendor.parseEvent(JSON.stringify(withoutRecipient)),
    ).toThrow(/recipient/);
  });

  it("throws when a required field is empty", () => {
    expect(() =>
      awsSesVendor.parseEvent(JSON.stringify({ ...VALID_PAYLOAD, s3_key: "" })),
    ).toThrow(/s3_key/);
  });

  it("throws when the JSON body is not an object", () => {
    expect(() => awsSesVendor.parseEvent("42")).toThrow(/not an object/);
  });
});

describe("awsSesVendor.verifyHmac", () => {
  const SECRET = "0123456789abcdef0123456789abcdef";

  it("delegates to verifyInboundHmac (valid signature passes)", () => {
    const body = JSON.stringify(VALID_PAYLOAD);
    const sig = computeInboundSignature(body, SECRET);
    expect(awsSesVendor.verifyHmac(body, sig, SECRET)).toBe(true);
  });

  it("rejects a bad signature", () => {
    const body = JSON.stringify(VALID_PAYLOAD);
    expect(awsSesVendor.verifyHmac(body, "sha256=deadbeef", SECRET)).toBe(false);
  });
});

describe("getInboundEmailVendor factory", () => {
  afterEach(() => {
    delete process.env.INBOUND_VENDOR;
  });

  it("returns the SES vendor by default (no ENV)", () => {
    delete process.env.INBOUND_VENDOR;
    expect(getInboundEmailVendor().id).toBe(SES_IRELAND_VENDOR_ID);
  });

  it("returns the SES vendor when ENV INBOUND_VENDOR=ses-ireland", () => {
    process.env.INBOUND_VENDOR = "ses-ireland";
    expect(getInboundEmailVendor()).toBe(awsSesVendor);
  });

  it("honors an explicit override over ENV", () => {
    process.env.INBOUND_VENDOR = "ses-ireland";
    expect(getInboundEmailVendor("ses-ireland").id).toBe(SES_IRELAND_VENDOR_ID);
  });

  it("throws on an unknown vendor id", () => {
    expect(() => getInboundEmailVendor("mailgun-eu")).toThrow(
      /Unknown INBOUND_VENDOR/,
    );
  });
});
