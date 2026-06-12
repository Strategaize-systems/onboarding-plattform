// V9.1 SLC-V9.1-A MT-4 — Sender-Allowlist Unit-Tests (offline).

import { describe, it, expect } from "vitest";

import {
  evaluateSenderAllowlist,
  type AllowlistEntry,
} from "../validation/sender-allowlist";

const exact = (p: string, enabled = true): AllowlistEntry => ({
  pattern: p,
  pattern_type: "email_exact",
  enabled,
});
const domain = (p: string, enabled = true): AllowlistEntry => ({
  pattern: p,
  pattern_type: "domain",
  enabled,
});

describe("evaluateSenderAllowlist", () => {
  it("skips the layer when no enabled rows exist", () => {
    expect(evaluateSenderAllowlist("a@x.de", [])).toEqual({
      required: false,
      allowed: true,
    });
    expect(
      evaluateSenderAllowlist("a@x.de", [exact("a@x.de", false)]),
    ).toEqual({ required: false, allowed: true });
  });

  it("allows an exact email match (case-insensitive)", () => {
    expect(
      evaluateSenderAllowlist("Boss@Acme.com", [exact("boss@acme.com")]),
    ).toEqual({ required: true, allowed: true });
  });

  it("rejects when exact pattern does not match", () => {
    expect(
      evaluateSenderAllowlist("other@acme.com", [exact("boss@acme.com")]),
    ).toEqual({ required: true, allowed: false });
  });

  it("allows a domain match on the exact domain", () => {
    expect(
      evaluateSenderAllowlist("anyone@acme.com", [domain("acme.com")]),
    ).toEqual({ required: true, allowed: true });
  });

  it("allows a domain match on a subdomain", () => {
    expect(
      evaluateSenderAllowlist("anyone@mail.acme.com", [domain("acme.com")]),
    ).toEqual({ required: true, allowed: true });
  });

  it("rejects a domain that only suffix-overlaps (notacme.com vs acme.com)", () => {
    expect(
      evaluateSenderAllowlist("x@notacme.com", [domain("acme.com")]),
    ).toEqual({ required: true, allowed: false });
  });

  it("rejects when From is missing but allowlist is active", () => {
    expect(evaluateSenderAllowlist(null, [domain("acme.com")])).toEqual({
      required: true,
      allowed: false,
    });
  });

  it("allows if any one of multiple enabled patterns matches", () => {
    expect(
      evaluateSenderAllowlist("x@partner.de", [
        domain("acme.com"),
        exact("x@partner.de"),
      ]),
    ).toEqual({ required: true, allowed: true });
  });
});
