import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Mock the admin Supabase client. Tests inject behavior via mockAdmin below.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

// Mock the logger so audit-log calls don't fail in the test environment.
vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
}));

import { GET } from "../[slug]/route";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminMock = {
  from: ReturnType<typeof vi.fn>;
};

const makeAdmin = (handlers: {
  partner?: { data: unknown; error: unknown };
  branding?: { data: unknown; error: unknown };
  template?: { data: unknown; error: unknown };
}): AdminMock => ({
  from: vi.fn((table: string) => {
    if (table === "partner_organization") {
      return {
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        maybeSingle: vi
          .fn()
          .mockResolvedValue(handlers.partner ?? { data: null, error: null }),
      };
    }
    if (table === "partner_branding_config") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi
          .fn()
          .mockResolvedValue(handlers.branding ?? { data: null, error: null }),
      };
    }
    if (table === "template") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi
          .fn()
          .mockResolvedValue(handlers.template ?? { data: null, error: null }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  }),
});

const buildRequest = (slug: string, ip: string): NextRequest => {
  const req = new Request(`https://onboarding.example.com/api/public/partner/${slug}`, {
    headers: { "x-forwarded-for": ip },
  });
  return req as unknown as NextRequest;
};

const buildParams = (slug: string): { params: Promise<{ slug: string }> } => ({
  params: Promise.resolve({ slug }),
});

describe("GET /api/public/partner/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with sanitized body for known slug — no contact_email or tenant_id", async () => {
    const admin = makeAdmin({
      partner: {
        data: {
          tenant_id: "11111111-1111-1111-1111-111111111111",
          display_name: "Mueller Partner",
        },
        error: null,
      },
      branding: {
        data: {
          logo_url: "https://cdn.example/logo.png",
          primary_color: "#ff8800",
          display_name: null,
        },
        error: null,
      },
      template: { data: { id: "tpl-1" }, error: null },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const response = await GET(
      buildRequest("mueller-partner", "10.0.0.10"),
      buildParams("mueller-partner"),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.display_name).toBe("Mueller Partner");
    expect(body.logo_url).toBe("https://cdn.example/logo.png");
    expect(body.accent_color).toBe("#ff8800");
    expect(body.has_active_diagnostic_template).toBe(true);

    // PII / internal fields must NOT be in the response.
    expect(body).not.toHaveProperty("contact_email");
    expect(body).not.toHaveProperty("tenant_id");
    expect(body).not.toHaveProperty("legal_name");
    expect(body).not.toHaveProperty("created_at");
  });

  it("returns 404 unknown_partner for an unknown slug", async () => {
    const admin = makeAdmin({
      partner: { data: null, error: null },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const response = await GET(
      buildRequest("does-not-exist", "10.0.0.20"),
      buildParams("does-not-exist"),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe("unknown_partner");
  });

  it("returns 404 for reserved slug `admin` WITHOUT touching DB", async () => {
    const admin = makeAdmin({});
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const response = await GET(
      buildRequest("admin", "10.0.0.30"),
      buildParams("admin"),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe("unknown_partner");

    // createAdminClient must not have been invoked.
    expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("returns 429 after 61st request from same IP within 1h", async () => {
    const admin = makeAdmin({
      partner: {
        data: {
          tenant_id: "22222222-2222-2222-2222-222222222222",
          display_name: "Some Partner",
        },
        error: null,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    // 60 allowed requests
    const ip = "10.0.0.40";
    for (let i = 0; i < 60; i += 1) {
      const r = await GET(
        buildRequest(`some-partner-${i}`, ip),
        buildParams(`some-partner-${i}`),
      );
      expect([200, 404]).toContain(r.status);
    }

    // 61st request → 429
    const response = await GET(
      buildRequest("some-partner-61", ip),
      buildParams("some-partner-61"),
    );
    expect(response.status).toBe(429);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe("rate_limit_exceeded");
    expect(typeof body.retry_after_seconds).toBe("number");
    expect(response.headers.get("Retry-After")).not.toBeNull();
  });

  it("sets Cache-Control: public, max-age=60 on 200 response", async () => {
    const admin = makeAdmin({
      partner: {
        data: {
          tenant_id: "33333333-3333-3333-3333-333333333333",
          display_name: "Cache Partner",
        },
        error: null,
      },
      branding: { data: null, error: null },
      template: { data: null, error: null },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const response = await GET(
      buildRequest("cache-partner", "10.0.0.50"),
      buildParams("cache-partner"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");

    // Branding-Fallback: no branding row → default color + null logo
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.accent_color).toBe("#4454b8");
    expect(body.logo_url).toBeNull();
    expect(body.has_active_diagnostic_template).toBe(false);
  });
});
