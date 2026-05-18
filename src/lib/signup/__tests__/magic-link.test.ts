import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { generateMagicLinkSession } from "../magic-link";

function buildAdminWithMagicLink(setup: {
  generateLinkResult: {
    data: { properties?: { hashed_token?: string | null } } | null;
    error: unknown;
  };
}) {
  return {
    auth: {
      admin: {
        generateLink: vi.fn().mockResolvedValue(setup.generateLinkResult),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://onboarding.strategaizetransition.com";
});

describe("generateMagicLinkSession — V7 SLC-133 MT-2 magic-link helper", () => {
  it("Test 1 — Happy-Path: returns ok=true with /auth/callback URL containing token_hash + type=magiclink + locale=de", async () => {
    const admin = buildAdminWithMagicLink({
      generateLinkResult: {
        data: { properties: { hashed_token: "deadbeef" + "a".repeat(56) } },
        error: null,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );

    const result = await generateMagicLinkSession({ email: "alice@example.com" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verify_url).toContain(
        "https://onboarding.strategaizetransition.com/auth/callback"
      );
      expect(result.verify_url).toContain(
        "token_hash=deadbeef" + "a".repeat(56)
      );
      expect(result.verify_url).toContain("type=magiclink");
      expect(result.verify_url).toContain("locale=de");
    }

    // Verify the admin.auth.admin.generateLink call payload.
    expect(admin.auth.admin.generateLink).toHaveBeenCalledTimes(1);
    expect(admin.auth.admin.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "alice@example.com",
    });
  });

  it("Test 2 — Failure-Mock: GoTrue returns error → ok=false with error='magic_link_failed', no URL leaked", async () => {
    const admin = buildAdminWithMagicLink({
      generateLinkResult: {
        data: null,
        error: { message: "Service unavailable: GoTrue cannot reach SMTP" },
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );

    const result = await generateMagicLinkSession({ email: "bob@example.com" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("magic_link_failed");
    }

    // Also defensively guard the empty-hashed_token case: if data is present
    // but properties.hashed_token is missing/falsy, return the same error
    // (no half-built URL).
    const admin2 = buildAdminWithMagicLink({
      generateLinkResult: {
        data: { properties: {} },
        error: null,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin2 as unknown as ReturnType<typeof createAdminClient>
    );

    const result2 = await generateMagicLinkSession({ email: "carla@example.com" });
    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.error).toBe("magic_link_failed");
    }
  });
});
