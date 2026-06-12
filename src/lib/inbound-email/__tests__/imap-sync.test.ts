// V9.1 SLC-V9.1-A MT-R5 — syncInboundEmails Unit-Tests (Flow A R1).
//
// Mockt ImapFlow, createAdminClient, parseEmlBuffer, resolveDefaultEndpoint,
// storage-persist, reject-log und logger. evaluateSenderAllowlist laeuft REAL
// (pure Logic). Kein DB-/IMAP-Roundtrip.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module-level mocks ───────────────────────────────────────────────────────

let nextImapInstance: unknown = null;
vi.mock("imapflow", () => ({
  // `new ImapFlow(opts)` -> der Factory-Return (Objekt) ueberschreibt `this`.
  ImapFlow: vi.fn(() => nextImapInstance),
}));

let nextAdmin: unknown = null;
vi.mock("../../supabase/admin", () => ({
  createAdminClient: vi.fn(() => nextAdmin),
}));

vi.mock("../../bulk-email/parser", () => ({
  parseEmlBuffer: vi.fn(),
}));
vi.mock("../endpoint-resolver", () => ({
  resolveDefaultEndpoint: vi.fn(),
}));
vi.mock("../storage-persist", () => ({
  buildRawStoragePath: vi.fn(() => "tn-1/forward-bucket/ep-1/2026-06-10/m.eml"),
  persistRawEml: vi.fn(async () => {}),
}));
vi.mock("../reject-log", () => ({
  insertRejectLog: vi.fn(async () => {}),
}));
vi.mock("../../logger", () => ({
  captureInfo: vi.fn(),
  captureWarning: vi.fn(),
  captureException: vi.fn(),
}));

import { syncInboundEmails } from "../imap-sync";
import { ImapFlow } from "imapflow";
import { parseEmlBuffer } from "../../bulk-email/parser";
import { resolveDefaultEndpoint } from "../endpoint-resolver";
import { persistRawEml } from "../storage-persist";
import { insertRejectLog } from "../reject-log";
import type { ResolvedEndpoint } from "../types";
import type { ParsedEmail } from "../../bulk-email/types";
import type { AllowlistEntry } from "../validation/sender-allowlist";

const ENDPOINT: ResolvedEndpoint = {
  endpointId: "ep-1",
  tenantId: "tn-1",
  slug: "acme",
  setupToken: "tok-1",
  status: "active",
  mode: "single_mailbox",
};

function makeParsed(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    messageId: "<msg-1@x>",
    messageIdSynthesized: false,
    inReplyTo: null,
    referencesArray: [],
    fromAddress: "sender@example.com",
    toAddresses: ["bulk@strategaizetransition.com"],
    ccAddresses: [],
    subject: "Hello",
    date: new Date("2026-06-10T08:00:00.000Z"),
    bodyText: "body",
    bodyHtml: null,
    hasAttachments: false,
    attachmentMetadata: [],
    ...overrides,
  };
}

// ── Admin-Mock ───────────────────────────────────────────────────────────────

interface AdminOpts {
  syncStateRow?: { last_uid: number; emails_synced_total: number } | null;
  allowlist?: AllowlistEntry[];
  existingMessageIds?: string[];
  rpcError?: { message: string } | null;
}

function createAdminMock(opts: AdminOpts) {
  const rpc = vi.fn(async () => ({ data: "run-1", error: opts.rpcError ?? null }));
  const syncStateInsert = vi.fn(async () => ({ error: null }));
  const updates: Record<string, unknown>[] = [];

  function from(table: string) {
    if (table === "email_inbound_sync_state") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.syncStateRow ?? null,
              error: null,
            }),
          }),
        }),
        insert: syncStateInsert,
        update: (payload: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(payload);
            return { error: null };
          },
        }),
      };
    }
    if (table === "email_forward_allowlist") {
      return {
        select: () => ({
          eq: async () => ({ data: opts.allowlist ?? [], error: null }),
        }),
      };
    }
    if (table === "email_message") {
      return {
        select: () => ({
          eq: () => ({
            eq: (_col: string, val: string) => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: (opts.existingMessageIds ?? []).includes(val)
                    ? { id: "exists" }
                    : null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    }
    throw new Error(`admin-mock: unexpected table ${table}`);
  }

  return {
    admin: { from, rpc } as unknown,
    rpc,
    syncStateInsert,
    updates,
  };
}

// ── ImapFlow-Mock ────────────────────────────────────────────────────────────

interface ImapOpts {
  uids: number[];
  messages: { uid: number; source: Buffer }[];
  connectError?: Error;
}

function makeImap(opts: ImapOpts) {
  const lock = { release: vi.fn() };
  return {
    mailbox: null,
    connect: vi.fn(async () => {
      if (opts.connectError) throw opts.connectError;
    }),
    logout: vi.fn(async () => {}),
    getMailboxLock: vi.fn(async () => lock),
    search: vi.fn(async () => opts.uids),
    fetch: vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        for (const m of opts.messages) yield m;
      },
    })),
    _lock: lock,
  };
}

function buf(s: string): Buffer {
  return Buffer.from(s, "utf8");
}

beforeEach(() => {
  nextImapInstance = null;
  nextAdmin = null;
  vi.clearAllMocks();
  process.env.IMAP_HOST = "imap.ionos.de";
  process.env.IMAP_USER = "u";
  process.env.IMAP_PASSWORD = "p";
});

describe("syncInboundEmails (Flow A R1)", () => {
  it("no resolved endpoint -> No-Op, ImapFlow not constructed", async () => {
    vi.mocked(resolveDefaultEndpoint).mockResolvedValue(null);
    const { admin } = createAdminMock({});
    nextAdmin = admin;

    const result = await syncInboundEmails();

    expect(result).toEqual({ synced: 0, skipped: 0, errors: 0, lastUid: 0 });
    expect(ImapFlow).not.toHaveBeenCalled();
  });

  it("incremental fetch from last_uid: 2 fresh mails -> 2 synced, rpc x2, last_uid advanced", async () => {
    vi.mocked(resolveDefaultEndpoint).mockResolvedValue(ENDPOINT);
    vi.mocked(parseEmlBuffer)
      .mockResolvedValueOnce(makeParsed({ messageId: "<a@x>" }))
      .mockResolvedValueOnce(makeParsed({ messageId: "<b@x>" }));
    const mock = createAdminMock({
      syncStateRow: { last_uid: 10, emails_synced_total: 5 },
    });
    nextAdmin = mock.admin;
    nextImapInstance = makeImap({
      uids: [11, 12],
      messages: [
        { uid: 11, source: buf("A") },
        { uid: 12, source: buf("B") },
      ],
    });

    const result = await syncInboundEmails();

    expect(result).toEqual({ synced: 2, skipped: 0, errors: 0, lastUid: 12 });
    expect(mock.rpc).toHaveBeenCalledTimes(2);
    expect(persistRawEml).toHaveBeenCalledTimes(2);
    // finalize-update mit last_uid=12 + total 5+2=7
    const finalize = mock.updates.find((u) => u.status === "idle");
    expect(finalize).toMatchObject({ last_uid: 12, emails_synced_total: 7 });
  });

  it("dedup: existing message_id -> skipped, no rpc, last_uid still advances", async () => {
    vi.mocked(resolveDefaultEndpoint).mockResolvedValue(ENDPOINT);
    vi.mocked(parseEmlBuffer).mockResolvedValue(makeParsed({ messageId: "<dup@x>" }));
    const mock = createAdminMock({
      syncStateRow: { last_uid: 0, emails_synced_total: 0 },
      existingMessageIds: ["<dup@x>"],
    });
    nextAdmin = mock.admin;
    nextImapInstance = makeImap({
      uids: [7],
      messages: [{ uid: 7, source: buf("DUP") }],
    });

    const result = await syncInboundEmails();

    expect(result).toEqual({ synced: 0, skipped: 1, errors: 0, lastUid: 7 });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("tolerant validation: no token + no allowlist -> mail passes (single_mailbox)", async () => {
    vi.mocked(resolveDefaultEndpoint).mockResolvedValue(ENDPOINT);
    vi.mocked(parseEmlBuffer).mockResolvedValue(makeParsed());
    const mock = createAdminMock({
      syncStateRow: { last_uid: 0, emails_synced_total: 0 },
      allowlist: [],
    });
    nextAdmin = mock.admin;
    nextImapInstance = makeImap({
      uids: [3],
      messages: [{ uid: 3, source: buf("OK") }],
    });

    const result = await syncInboundEmails();

    expect(result.synced).toBe(1);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it("allowlist mismatch -> insertRejectLog(allowlist_mismatch) + skipped, no rpc", async () => {
    vi.mocked(resolveDefaultEndpoint).mockResolvedValue(ENDPOINT);
    vi.mocked(parseEmlBuffer).mockResolvedValue(
      makeParsed({ fromAddress: "stranger@evil.com" }),
    );
    const mock = createAdminMock({
      syncStateRow: { last_uid: 0, emails_synced_total: 0 },
      allowlist: [{ pattern: "trusted.com", pattern_type: "domain", enabled: true }],
    });
    nextAdmin = mock.admin;
    nextImapInstance = makeImap({
      uids: [4],
      messages: [{ uid: 4, source: buf("SPAM") }],
    });

    const result = await syncInboundEmails();

    expect(result).toEqual({ synced: 0, skipped: 1, errors: 0, lastUid: 4 });
    expect(insertRejectLog).toHaveBeenCalledTimes(1);
    expect(vi.mocked(insertRejectLog).mock.calls[0][1]).toMatchObject({
      rejectLayer: "allowlist_mismatch",
    });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("per-mail error does not abort the run", async () => {
    vi.mocked(resolveDefaultEndpoint).mockResolvedValue(ENDPOINT);
    vi.mocked(parseEmlBuffer)
      .mockRejectedValueOnce(new Error("corrupt eml"))
      .mockResolvedValueOnce(makeParsed({ messageId: "<good@x>" }));
    const mock = createAdminMock({
      syncStateRow: { last_uid: 0, emails_synced_total: 0 },
    });
    nextAdmin = mock.admin;
    nextImapInstance = makeImap({
      uids: [8, 9],
      messages: [
        { uid: 8, source: buf("BAD") },
        { uid: 9, source: buf("GOOD") },
      ],
    });

    const result = await syncInboundEmails();

    expect(result.synced).toBe(1);
    expect(result.errors).toBe(1);
    // last_uid darf NICHT auf 8 vorruecken (Fehler), aber auf 9 (Erfolg).
    expect(result.lastUid).toBe(9);
  });

  it("creates sync_state row on first run (no existing row)", async () => {
    vi.mocked(resolveDefaultEndpoint).mockResolvedValue(ENDPOINT);
    const mock = createAdminMock({ syncStateRow: null });
    nextAdmin = mock.admin;
    nextImapInstance = makeImap({ uids: [], messages: [] });

    const result = await syncInboundEmails();

    expect(mock.syncStateInsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ synced: 0, skipped: 0, errors: 0, lastUid: 0 });
  });

  it("connection error -> sync_state status='error', errors incremented", async () => {
    vi.mocked(resolveDefaultEndpoint).mockResolvedValue(ENDPOINT);
    const mock = createAdminMock({
      syncStateRow: { last_uid: 2, emails_synced_total: 0 },
    });
    nextAdmin = mock.admin;
    nextImapInstance = makeImap({
      uids: [],
      messages: [],
      connectError: new Error("ECONNREFUSED"),
    });

    const result = await syncInboundEmails();

    expect(result.errors).toBe(1);
    const errUpdate = mock.updates.find((u) => u.status === "error");
    expect(errUpdate).toMatchObject({ error_message: "ECONNREFUSED" });
  });
});
