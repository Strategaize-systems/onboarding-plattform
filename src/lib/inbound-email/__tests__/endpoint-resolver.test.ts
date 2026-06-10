// V9.1 SLC-V9.1-A MT-R4 — resolveDefaultEndpoint Unit-Tests (DEC-R1-2).
//
// Mockt lookupEndpointBySlug (ENV-Slug-Pfad) + captureWarning + den admin-Client
// (Single-Active-Pfad). Kein DB-Roundtrip.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../tenant-lookup", () => ({
  lookupEndpointBySlug: vi.fn(),
}));
vi.mock("../../logger", () => ({
  captureWarning: vi.fn(),
}));

import { resolveDefaultEndpoint } from "../endpoint-resolver";
import { lookupEndpointBySlug } from "../tenant-lookup";
import { captureWarning } from "../../logger";
import type { TenantLookupResult } from "../types";

const ENV_KEY = "INBOUND_DEFAULT_ENDPOINT_SLUG";

/** Admin-Mock fuer den Single-Active-Pfad: from().select().eq() -> {data,error}. */
function makeAdmin(result: { data: unknown; error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { admin: { from } as any, from, select, eq };
}

const endpoint: TenantLookupResult = {
  endpointId: "ep-1",
  tenantId: "tn-1",
  slug: "acme",
  setupToken: "tok-1",
  status: "active",
};

describe("resolveDefaultEndpoint (DEC-R1-2)", () => {
  let prevEnv: string | undefined;

  beforeEach(() => {
    prevEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
    vi.mocked(lookupEndpointBySlug).mockReset();
    vi.mocked(captureWarning).mockReset();
  });

  afterEach(() => {
    if (prevEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = prevEnv;
  });

  it("ENV-Slug path: resolves via lookupEndpointBySlug and tags mode single_mailbox", async () => {
    process.env[ENV_KEY] = "acme";
    vi.mocked(lookupEndpointBySlug).mockResolvedValue(endpoint);
    const { admin, from } = makeAdmin({ data: null, error: null });

    const result = await resolveDefaultEndpoint(admin);

    expect(lookupEndpointBySlug).toHaveBeenCalledWith(admin, "acme");
    expect(result).toEqual({ ...endpoint, mode: "single_mailbox" });
    // Single-Active-Pfad darf bei gesetztem ENV-Slug NICHT angefasst werden.
    expect(from).not.toHaveBeenCalled();
    expect(captureWarning).not.toHaveBeenCalled();
  });

  it("ENV-Slug path: endpoint not found -> null + captureWarning", async () => {
    process.env[ENV_KEY] = "ghost";
    vi.mocked(lookupEndpointBySlug).mockResolvedValue(null);
    const { admin } = makeAdmin({ data: null, error: null });

    const result = await resolveDefaultEndpoint(admin);

    expect(result).toBeNull();
    expect(captureWarning).toHaveBeenCalledTimes(1);
  });

  it("Single-Active path: exactly 1 active row -> resolves with mode single_mailbox", async () => {
    const { admin, from, select, eq } = makeAdmin({
      data: [
        {
          id: "ep-1",
          tenant_id: "tn-1",
          slug: "acme",
          setup_token: "tok-1",
          status: "active",
        },
      ],
      error: null,
    });

    const result = await resolveDefaultEndpoint(admin);

    expect(from).toHaveBeenCalledWith("email_inbound_endpoint");
    expect(select).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("status", "active");
    expect(result).toEqual({ ...endpoint, mode: "single_mailbox" });
    expect(lookupEndpointBySlug).not.toHaveBeenCalled();
    expect(captureWarning).not.toHaveBeenCalled();
  });

  it("Single-Active path: 0 active rows -> null + captureWarning", async () => {
    const { admin } = makeAdmin({ data: [], error: null });

    const result = await resolveDefaultEndpoint(admin);

    expect(result).toBeNull();
    expect(captureWarning).toHaveBeenCalledTimes(1);
  });

  it("Single-Active path: >1 active rows -> null + captureWarning (ambiguity)", async () => {
    const { admin } = makeAdmin({
      data: [
        { id: "ep-1", tenant_id: "tn-1", slug: "a", setup_token: "t1", status: "active" },
        { id: "ep-2", tenant_id: "tn-2", slug: "b", setup_token: "t2", status: "active" },
      ],
      error: null,
    });

    const result = await resolveDefaultEndpoint(admin);

    expect(result).toBeNull();
    expect(captureWarning).toHaveBeenCalledTimes(1);
  });

  it("Single-Active path: DB error -> throws", async () => {
    const { admin } = makeAdmin({ data: null, error: { message: "boom" } });

    await expect(resolveDefaultEndpoint(admin)).rejects.toThrow(/boom/);
  });
});
