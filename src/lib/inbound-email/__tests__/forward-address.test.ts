// V9.1 SLC-V9.1-E — Unit-Tests fuer den Forward-Adress-Resolver (ISSUE-098).
//
// Verifiziert beide Modi: Single-Mailbox (INBOUND_MAILBOX_ADDRESS gesetzt -> reales
// Postfach, slug-unabhaengig) und Catchall (ENV nicht gesetzt -> bulk-<slug>@domain).

import { afterEach, describe, expect, it } from "vitest";

import { resolveForwardAddress, singleMailboxAddress } from "../forward-address";

const ENV_KEYS = ["INBOUND_MAILBOX_ADDRESS", "INBOUND_CATCHALL_DOMAIN"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("singleMailboxAddress", () => {
  it("returns the trimmed mailbox address when set", () => {
    process.env.INBOUND_MAILBOX_ADDRESS = "  bulk@strategaizetransition.com  ";
    expect(singleMailboxAddress()).toBe("bulk@strategaizetransition.com");
  });

  it("returns null when unset or empty", () => {
    delete process.env.INBOUND_MAILBOX_ADDRESS;
    expect(singleMailboxAddress()).toBeNull();
    process.env.INBOUND_MAILBOX_ADDRESS = "   ";
    expect(singleMailboxAddress()).toBeNull();
  });
});

describe("resolveForwardAddress — single-mailbox mode", () => {
  it("returns the real mailbox address regardless of slug (ISSUE-098)", () => {
    process.env.INBOUND_MAILBOX_ADDRESS = "bulk@strategaizetransition.com";
    expect(resolveForwardAddress("acme")).toBe("bulk@strategaizetransition.com");
    expect(resolveForwardAddress("steuerberater")).toBe("bulk@strategaizetransition.com");
  });

  it("takes precedence over a configured catchall domain", () => {
    process.env.INBOUND_MAILBOX_ADDRESS = "bulk@strategaizetransition.com";
    process.env.INBOUND_CATCHALL_DOMAIN = "bulk.example.com";
    expect(resolveForwardAddress("acme")).toBe("bulk@strategaizetransition.com");
  });
});

describe("resolveForwardAddress — catchall mode", () => {
  it("builds bulk-<slug>@<default-domain> when no mailbox is set", () => {
    delete process.env.INBOUND_MAILBOX_ADDRESS;
    delete process.env.INBOUND_CATCHALL_DOMAIN;
    expect(resolveForwardAddress("acme")).toBe("bulk-acme@bulk.strategaizetransition.com");
  });

  it("honours INBOUND_CATCHALL_DOMAIN override", () => {
    delete process.env.INBOUND_MAILBOX_ADDRESS;
    process.env.INBOUND_CATCHALL_DOMAIN = "bulk.example.com";
    expect(resolveForwardAddress("acme")).toBe("bulk-acme@bulk.example.com");
  });
});
