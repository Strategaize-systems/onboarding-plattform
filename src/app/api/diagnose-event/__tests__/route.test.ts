// SLC-139 MT-3 (FEAT-058) — Vitest fuer POST /api/diagnose-event.
// Spec verlangt 6+ Cases (validRequest 201, invalid event_type 400, missing
// capture_session_id 400, non-own-tenant 403, rate-limit 429).

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks vor Route-Import ──────────────────────────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST } from "../route";
import { createClient } from "@/lib/supabase/server";

interface FromMocks {
  profile?: { data: unknown; error: unknown };
  session?: { data: unknown; error: unknown };
  tenant?: { data: unknown; error: unknown };
  insert?: { data: unknown; error: unknown };
}

function buildSupabaseMock(opts: { userId?: string | null; from: FromMocks }) {
  // route.ts ruft `.insert(...)` direkt (KEIN .select().single() Chain) —
  // siehe Kommentar in route.ts: PostgREST-RETURNING wuerde SELECT-RLS
  // anstossen und der tenant_admin/tenant_member-Insert-Pfad scheitert.
  // Insert-Fn ist daher direkt awaitable und resolved zu PostgrestResponse.
  const insertFn = vi
    .fn()
    .mockResolvedValue(opts.from.insert ?? { data: null, error: null });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.userId ? { id: opts.userId } : null },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValue(opts.from.profile ?? { data: null, error: null }),
        };
      }
      if (table === "capture_session") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValue(opts.from.session ?? { data: null, error: null }),
        };
      }
      if (table === "tenants") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValue(
              opts.from.tenant ?? { data: { parent_partner_tenant_id: null }, error: null },
            ),
        };
      }
      if (table === "diagnose_event") {
        return { insert: insertFn };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
    _insertFn: insertFn,
  };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/diagnose-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const HAPPY_BODY = {
  capture_session_id: "11111111-1111-1111-1111-111111111111",
  event_type: "question_start",
  question_key: "q1",
  payload: { stage: "view" },
  is_test: false,
};

const VALID_USER_ID = "user-uuid-aaa";
const VALID_TENANT_ID = "tenant-uuid-bbb";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/diagnose-event", () => {
  it("returns 400 when body is not valid JSON", async () => {
    const supabase = buildSupabaseMock({
      userId: VALID_USER_ID,
      from: {
        profile: { data: { tenant_id: VALID_TENANT_ID }, error: null },
        session: { data: { id: HAPPY_BODY.capture_session_id, tenant_id: VALID_TENANT_ID }, error: null },
      },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const req = new Request("http://localhost/api/diagnose-event", {
      method: "POST",
      body: "{not-json",
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });

  it("returns 400 when capture_session_id missing", async () => {
    const supabase = buildSupabaseMock({
      userId: VALID_USER_ID,
      from: {
        profile: { data: { tenant_id: VALID_TENANT_ID }, error: null },
      },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(
      makeRequest({ ...HAPPY_BODY, capture_session_id: undefined }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("capture_session_id_required");
  });

  it("returns 400 when event_type is not in 9-value enum", async () => {
    const supabase = buildSupabaseMock({
      userId: VALID_USER_ID,
      from: {
        profile: { data: { tenant_id: VALID_TENANT_ID }, error: null },
      },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(
      makeRequest({ ...HAPPY_BODY, event_type: "not_a_real_event" }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_event_type");
  });

  it("returns 401 when user not authenticated", async () => {
    const supabase = buildSupabaseMock({
      userId: null,
      from: {},
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(makeRequest(HAPPY_BODY) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("not_authenticated");
  });

  it("returns 403 when session belongs to other tenant", async () => {
    const supabase = buildSupabaseMock({
      userId: VALID_USER_ID,
      from: {
        profile: { data: { tenant_id: VALID_TENANT_ID }, error: null },
        session: {
          data: { id: HAPPY_BODY.capture_session_id, tenant_id: "OTHER-tenant" },
          error: null,
        },
      },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(makeRequest(HAPPY_BODY) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("session_not_owned");
  });

  it("returns 201 on happy path with correct INSERT body (no RETURNING)", async () => {
    const supabase = buildSupabaseMock({
      userId: VALID_USER_ID,
      from: {
        profile: { data: { tenant_id: VALID_TENANT_ID }, error: null },
        session: { data: { id: HAPPY_BODY.capture_session_id, tenant_id: VALID_TENANT_ID }, error: null },
        tenant: { data: { parent_partner_tenant_id: "partner-org-xyz" }, error: null },
        insert: { data: null, error: null },
      },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    // Use unique session-id so rate-limit doesn't pollute prior test runs.
    const happy = { ...HAPPY_BODY, capture_session_id: "22222222-1111-1111-1111-111111111111" };
    const res = await POST(makeRequest(happy) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(supabase._insertFn).toHaveBeenCalledTimes(1);
    const firstCallArgs = supabase._insertFn.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(firstCallArgs[0]).toEqual({
      capture_session_id: happy.capture_session_id,
      tenant_id: VALID_TENANT_ID,
      partner_org_id: "partner-org-xyz",
      event_type: "question_start",
      question_key: "q1",
      payload: { stage: "view" },
      is_test: false,
    });
  });

  it("returns 429 after 600 events on same capture_session_id within window", async () => {
    const sessionId = "33333333-1111-1111-1111-111111111111";
    function freshSupabase() {
      return buildSupabaseMock({
        userId: VALID_USER_ID,
        from: {
          profile: { data: { tenant_id: VALID_TENANT_ID }, error: null },
          session: { data: { id: sessionId, tenant_id: VALID_TENANT_ID }, error: null },
          tenant: { data: { parent_partner_tenant_id: null }, error: null },
          insert: { data: null, error: null },
        },
      });
    }
    vi.mocked(createClient).mockResolvedValue(freshSupabase() as never);

    // Erste 600 erfolgreich
    let lastStatus = 0;
    for (let i = 0; i < 600; i++) {
      vi.mocked(createClient).mockResolvedValueOnce(freshSupabase() as never);
      const res = await POST(
        makeRequest({ ...HAPPY_BODY, capture_session_id: sessionId }) as unknown as Parameters<typeof POST>[0],
      );
      lastStatus = res.status;
      if (res.status !== 201) break;
    }
    expect(lastStatus).toBe(201);

    // 601. Request schlaegt mit 429 fehl
    vi.mocked(createClient).mockResolvedValueOnce(freshSupabase() as never);
    const overLimit = await POST(
      makeRequest({ ...HAPPY_BODY, capture_session_id: sessionId }) as unknown as Parameters<typeof POST>[0],
    );
    expect(overLimit.status).toBe(429);
    const body = await overLimit.json();
    expect(body.error).toBe("rate_limited");
    expect(overLimit.headers.get("Retry-After")).not.toBeNull();
  });
});
