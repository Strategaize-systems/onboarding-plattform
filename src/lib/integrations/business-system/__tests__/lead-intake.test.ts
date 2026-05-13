// V6 SLC-106 — Outbound HTTP-Adapter Vitest (FEAT-046, MT-3)
//
// 5 Faelle laut Slice-Spec: Happy / HTTP 4xx / HTTP 5xx / Timeout / Network-Error.
// Plus 2 Defense-in-Depth: Invalid-Response-Shape + Missing-ENV.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pushLeadToBusinessSystem } from "../lead-intake";
import type { LeadIntakePayload } from "../types";

const SAMPLE_PAYLOAD: LeadIntakePayload = {
  first_name: "Max",
  last_name: "Mustermann",
  email: "max@example.com",
  notes: "Mandant von Steuerberater Test hat Diagnose durchlaufen.",
  utm_source: "partner_00000000-0000-0000-0000-000000000000",
  utm_campaign: "partner_diagnostic_v1",
  utm_medium: "referral",
};

const ORIG_URL = process.env.BUSINESS_SYSTEM_INTAKE_URL;
const ORIG_KEY = process.env.BUSINESS_SYSTEM_INTAKE_API_KEY;

beforeEach(() => {
  process.env.BUSINESS_SYSTEM_INTAKE_URL = "https://os.test.local/api/leads/intake";
  process.env.BUSINESS_SYSTEM_INTAKE_API_KEY = "test-bearer-token";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIG_URL === undefined) delete process.env.BUSINESS_SYSTEM_INTAKE_URL;
  else process.env.BUSINESS_SYSTEM_INTAKE_URL = ORIG_URL;
  if (ORIG_KEY === undefined) delete process.env.BUSINESS_SYSTEM_INTAKE_API_KEY;
  else process.env.BUSINESS_SYSTEM_INTAKE_API_KEY = ORIG_KEY;
});

describe("pushLeadToBusinessSystem", () => {
  it("happy path — 200 OK with contact_id + was_new returns ok=true", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ contact_id: "ctc-uuid-123", was_new: true }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await pushLeadToBusinessSystem(SAMPLE_PAYLOAD);

    expect(result).toEqual({ ok: true, contact_id: "ctc-uuid-123", was_new: true });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("https://os.test.local/api/leads/intake");
    expect(calledInit?.method).toBe("POST");
    expect((calledInit?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-bearer-token",
    );
    expect((calledInit?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(calledInit?.body).toBe(JSON.stringify(SAMPLE_PAYLOAD));
  });

  it("HTTP 4xx (400 Bad Request) returns ok=false with 'HTTP 400'", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response('{"error":"bad request"}', { status: 400 }),
    );

    const result = await pushLeadToBusinessSystem(SAMPLE_PAYLOAD);

    expect(result).toEqual({ ok: false, error: "HTTP 400" });
  });

  it("HTTP 5xx (500 Internal Server Error) returns ok=false with 'HTTP 500'", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response('{"error":"server boom"}', { status: 500 }),
    );

    const result = await pushLeadToBusinessSystem(SAMPLE_PAYLOAD);

    expect(result).toEqual({ ok: false, error: "HTTP 500" });
  });

  it("Timeout (AbortError) returns ok=false with 'Timeout (10s)'", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    const result = await pushLeadToBusinessSystem(SAMPLE_PAYLOAD);

    expect(result).toEqual({ ok: false, error: "Timeout (10s)" });
  });

  it("Network-Error (DNS / connection refused) returns ok=false with error message", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(
      new Error("fetch failed: ECONNREFUSED"),
    );

    const result = await pushLeadToBusinessSystem(SAMPLE_PAYLOAD);

    expect(result).toEqual({ ok: false, error: "fetch failed: ECONNREFUSED" });
  });

  it("Invalid response shape (missing contact_id) returns ok=false", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ was_new: true }), { status: 200 }),
    );

    const result = await pushLeadToBusinessSystem(SAMPLE_PAYLOAD);

    expect(result).toEqual({ ok: false, error: "Invalid response shape" });
  });

  it("Missing ENV variables — throws explicit error", async () => {
    delete process.env.BUSINESS_SYSTEM_INTAKE_URL;
    delete process.env.BUSINESS_SYSTEM_INTAKE_API_KEY;

    await expect(pushLeadToBusinessSystem(SAMPLE_PAYLOAD)).rejects.toThrow(
      /BUSINESS_SYSTEM_INTAKE_URL or BUSINESS_SYSTEM_INTAKE_API_KEY not configured/,
    );
  });
});
