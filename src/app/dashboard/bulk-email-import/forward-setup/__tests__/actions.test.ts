// V9.1 SLC-V9.1-D MT-2 — Server-Action Unit-Tests (hermetisch, gemockte Clients).
//
// Server-Actions rufen auth.getUser() + service_role-Writes — gegen echte DB nur
// mit Session/JWT testbar (Live-Smoke, IONOS-gated, deferred). Diese Tests mocken
// supabase/server + supabase/admin + email + poll-inbound + logger und verifizieren
// Validierung, Status-Lifecycle, Audit-Calls und Error-Mapping (AC-V9.1-D-3/-5/-6).

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock-State ─────────────────────────────────────────────────────────────
interface MockUser {
  id: string;
}
let mockUser: MockUser | null;
let mockProfile: { tenant_id: string | null; role: string } | null;
// adminResolve liefert pro (table, op) ein Ergebnis. Pro Test ueberschreibbar.
let adminResolve: (ctx: { table: string; op: string }) => unknown;

const sendMailMock = vi.fn();
const pollMock = vi.fn();
const captureInfoMock = vi.fn();
const captureExceptionMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendMail: (...a: unknown[]) => sendMailMock(...a) }));
vi.mock("@/lib/bulk-email/poll-inbound", () => ({
  pollForInboundEmail: (...a: unknown[]) => pollMock(...a),
}));
vi.mock("@/lib/logger", () => ({
  captureInfo: (...a: unknown[]) => captureInfoMock(...a),
  captureException: (...a: unknown[]) => captureExceptionMock(...a),
}));

function makeBuilder(
  resolve: (ctx: { table: string; op: string }) => unknown,
  table: string,
) {
  const ctx = { table, op: "select" };
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: () => {
      ctx.op = "insert";
      return builder;
    },
    update: () => {
      ctx.op = "update";
      return builder;
    },
    eq: () => builder,
    single: () => Promise.resolve(resolve(ctx)),
    maybeSingle: () => Promise.resolve(resolve(ctx)),
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(resolve(ctx)).then(onF, onR),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: mockUser } }) },
      from: () =>
        makeBuilder(() => ({ data: mockProfile }), "profiles"),
    }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => makeBuilder((ctx) => adminResolve(ctx), table),
  }),
}));

import {
  createInboundEndpoint,
  regenerateSetupToken,
  updateAllowlist,
  sendTestEmail,
  confirmDsgvoDisclaimer,
  suggestSetup,
} from "../actions";
import {
  __setSetupCallerForTests,
  __resetSetupCallerForTests,
} from "@/lib/bulk-email/ai-assisted-setup";

const OWNED = { data: { slug: "acme", status: "pending_setup" } };

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { id: "user-1" };
  mockProfile = { tenant_id: "tenant-1", role: "tenant_admin" };
  adminResolve = () => ({ data: null, error: null });
});

describe("authorization gate", () => {
  it("rejects unauthenticated callers", async () => {
    mockUser = null;
    const r = await createInboundEndpoint({ localPart: "bulk-acme" });
    expect(r).toEqual({ ok: false, error: "Nicht authentifiziert" });
  });

  it("rejects non-tenant_admin roles", async () => {
    mockProfile = { tenant_id: "tenant-1", role: "tenant_member" };
    const r = await createInboundEndpoint({ localPart: "bulk-acme" });
    expect(r).toEqual({ ok: false, error: "Nur fuer Mandanten-Admin verfuegbar" });
  });
});

describe("createInboundEndpoint", () => {
  it("rejects an invalid local-part format", async () => {
    const r = await createInboundEndpoint({ localPart: "acme" });
    expect(r.ok).toBe(false);
  });

  it("creates a pending_setup endpoint and returns a setup token + address", async () => {
    adminResolve = (ctx) =>
      ctx.op === "insert"
        ? { data: { id: "ep-1" }, error: null }
        : { data: null, error: null };

    const r = await createInboundEndpoint({ localPart: "bulk-acme", displayName: "Acme" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.endpointId).toBe("ep-1");
      expect(r.setupToken).toMatch(/^[A-Za-z0-9_-]{40,}$/); // base64url, ~43 chars
      expect(r.address).toBe("bulk-acme@bulk.strategaizetransition.com");
    }
    expect(captureInfoMock).toHaveBeenCalledWith(
      "email_inbound_endpoint_created",
      expect.objectContaining({ metadata: expect.objectContaining({ slug: "acme" }) }),
    );
  });

  it("maps a unique-violation to a friendly error", async () => {
    adminResolve = (ctx) =>
      ctx.op === "insert"
        ? { data: null, error: { code: "23505", message: "dup" } }
        : { data: null, error: null };
    const r = await createInboundEndpoint({ localPart: "bulk-acme" });
    expect(r).toEqual({ ok: false, error: "Dieser Local-Part ist bereits vergeben." });
  });
});

describe("regenerateSetupToken", () => {
  it("errors when the endpoint is not owned", async () => {
    adminResolve = () => ({ data: null }); // loadOwnedEndpoint -> not found
    const r = await regenerateSetupToken("ep-x");
    expect(r).toEqual({ ok: false, error: "Endpoint nicht gefunden." });
  });

  it("returns a new token on success", async () => {
    adminResolve = (ctx) => (ctx.op === "select" ? OWNED : { error: null });
    const r = await regenerateSetupToken("ep-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.setupToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(captureInfoMock).toHaveBeenCalledWith(
      "email_inbound_endpoint_token_regenerated",
      expect.anything(),
    );
  });
});

describe("updateAllowlist", () => {
  it("rejects an empty pattern", async () => {
    const r = await updateAllowlist("ep-1", "   ", "domain", true);
    expect(r).toEqual({ ok: false, error: "Pattern darf nicht leer sein." });
  });

  it("inserts an allowlist row on success", async () => {
    adminResolve = (ctx) =>
      ctx.op === "select" ? OWNED : { data: { id: "al-1" }, error: null };
    const r = await updateAllowlist("ep-1", "ACME.de", "domain", true);
    expect(r).toEqual({ ok: true, allowlistId: "al-1" });
  });
});

describe("sendTestEmail", () => {
  it("sends to the catchall address and reports received=true when polling finds the mail", async () => {
    adminResolve = (ctx) => (ctx.op === "select" ? OWNED : { data: null });
    pollMock.mockResolvedValue({ id: "msg-1" });
    const r = await sendTestEmail("ep-1");
    expect(r).toEqual({ ok: true, received: true });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "bulk-acme@bulk.strategaizetransition.com" }),
    );
  });

  it("reports received=false on polling timeout", async () => {
    adminResolve = (ctx) => (ctx.op === "select" ? OWNED : { data: null });
    pollMock.mockResolvedValue(null);
    const r = await sendTestEmail("ep-1");
    expect(r).toEqual({ ok: true, received: false });
  });

  it("returns an SMTP error when send throws", async () => {
    adminResolve = (ctx) => (ctx.op === "select" ? OWNED : { data: null });
    sendMailMock.mockRejectedValue(new Error("smtp down"));
    const r = await sendTestEmail("ep-1");
    expect(r.ok).toBe(false);
    expect(pollMock).not.toHaveBeenCalled();
  });
});

describe("suggestSetup", () => {
  beforeEach(() => __resetSetupCallerForTests());

  it("rejects unauthenticated callers", async () => {
    mockUser = null;
    const r = await suggestSetup("alles vom steuerberater");
    expect(r).toEqual({ ok: false, error: "Nicht authentifiziert" });
  });

  it("rejects an empty description", async () => {
    const r = await suggestSetup("   ");
    expect(r.ok).toBe(false);
  });

  it("returns a suggestion from the assistant on success", async () => {
    __setSetupCallerForTests(async () => ({
      text: JSON.stringify({
        suggestedLocalPart: "bulk-steuerberater",
        suggestedAllowlistPatterns: ["kanzlei-mueller.de"],
        reasoning: "Mails vom Steuerberater werden gebuendelt.",
      }),
    }));
    const r = await suggestSetup("alle mails von kanzlei-mueller.de");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.suggestion.suggestedLocalPart).toBe("bulk-steuerberater");
      expect(r.suggestion.suggestedAllowlistPatterns).toEqual(["kanzlei-mueller.de"]);
    }
    expect(captureInfoMock).toHaveBeenCalledWith(
      "email_inbound_endpoint_setup_suggested",
      expect.anything(),
    );
  });

  it("maps a schema/JSON error to a friendly message and logs it", async () => {
    __setSetupCallerForTests(async () => ({ text: "kein json hier" }));
    const r = await suggestSetup("irgendwas");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/konkreter/);
    expect(captureExceptionMock).toHaveBeenCalled();
  });
});

describe("confirmDsgvoDisclaimer", () => {
  it("rejects a missing consent version", async () => {
    const r = await confirmDsgvoDisclaimer("ep-1", "  ");
    expect(r).toEqual({ ok: false, error: "Consent-Version fehlt." });
  });

  it("activates the endpoint and writes the consent audit", async () => {
    adminResolve = (ctx) => (ctx.op === "select" ? OWNED : { error: null });
    const r = await confirmDsgvoDisclaimer("ep-1", "2026-06-11.v1");
    expect(r).toEqual({ ok: true });
    expect(captureInfoMock).toHaveBeenCalledWith(
      "email_inbound_endpoint_dsgvo_consent",
      expect.objectContaining({
        metadata: expect.objectContaining({ consent_version: "2026-06-11.v1" }),
      }),
    );
  });
});
