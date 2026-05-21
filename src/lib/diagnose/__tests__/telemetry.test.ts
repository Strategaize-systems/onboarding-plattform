// V7.2 SLC-139 — Telemetry-Production-Adapter Tests (FEAT-058).
// Tests verifizieren fetch-POST-Pfad + Capture-Session-Pflicht + SSR-Safety.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { trackHelperTextOpen } from "../telemetry";

describe("trackHelperTextOpen (V7.2 production-adapter)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalWindow: typeof globalThis.window | undefined;
  let originalFetch: typeof globalThis.fetch | undefined;
  let originalLocalStorage: typeof globalThis.localStorage | undefined;

  beforeEach(() => {
    originalWindow = (globalThis as { window?: typeof globalThis.window }).window;
    originalFetch = (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
    originalLocalStorage = (globalThis as { localStorage?: typeof globalThis.localStorage }).localStorage;

    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    (globalThis as { window?: unknown }).window = {} as unknown as Window;
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: typeof globalThis.window }).window;
    } else {
      (globalThis as { window?: typeof globalThis.window }).window = originalWindow;
    }
    if (originalFetch === undefined) {
      delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
    } else {
      (globalThis as { fetch?: typeof globalThis.fetch }).fetch = originalFetch;
    }
    if (originalLocalStorage === undefined) {
      delete (globalThis as { localStorage?: typeof globalThis.localStorage }).localStorage;
    } else {
      (globalThis as { localStorage?: typeof globalThis.localStorage }).localStorage = originalLocalStorage;
    }
  });

  it("POSTs to /api/diagnose-event with helper_text_open envelope when capture_session_id present", () => {
    trackHelperTextOpen({
      question_key: "ki_reife.q1",
      capture_session_id: "session-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/diagnose-event");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      capture_session_id: "session-123",
      event_type: "helper_text_open",
      question_key: "ki_reife.q1",
      payload: {},
      is_test: false,
    });
  });

  it("no-ops when capture_session_id missing (RLS would reject)", () => {
    trackHelperTextOpen({ question_key: "q-without-session" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no-ops in SSR context (no window)", () => {
    delete (globalThis as { window?: typeof globalThis.window }).window;
    trackHelperTextOpen({ question_key: "q1", capture_session_id: "s1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads is_test=true when localStorage flag is 'true'", () => {
    const storageMock: Partial<Storage> = {
      getItem: vi.fn().mockReturnValue("true"),
    };
    (globalThis as { localStorage?: unknown }).localStorage = storageMock;

    trackHelperTextOpen({ question_key: "q1", capture_session_id: "s1" });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.is_test).toBe(true);
  });

  it("swallows fetch rejections (fire-and-forget)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(() =>
      trackHelperTextOpen({ question_key: "q1", capture_session_id: "s1" }),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
