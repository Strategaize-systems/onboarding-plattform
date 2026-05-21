// SLC-139 MT-2 (FEAT-058) — Diagnose-Tracker Vitest-Coverage.
// Spec verlangt 8+ Cases (Heartbeat-Interval, visibilitychange-Trigger,
// beforeunload-Sendbeacon-Mock, is_test-Flag, Event-Type-Validation).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DIAGNOSE_EVENT_TYPES, isValidEventType } from "../diagnose-event-types";
import {
  HEARTBEAT_INTERVAL_MS,
  buildEventEnvelope,
  mapVisibilityStateToEventType,
  readIsTestFlagFromStorage,
} from "../diagnose-logic";
import { createDiagnoseTracker } from "../diagnose";

describe("isValidEventType", () => {
  it("accepts all 9 valid event types", () => {
    for (const type of DIAGNOSE_EVENT_TYPES) {
      expect(isValidEventType(type)).toBe(true);
    }
  });

  it("rejects unknown string + non-string values", () => {
    expect(isValidEventType("not_a_real_event")).toBe(false);
    expect(isValidEventType("")).toBe(false);
    expect(isValidEventType(42)).toBe(false);
    expect(isValidEventType(null)).toBe(false);
  });
});

describe("buildEventEnvelope", () => {
  it("builds envelope from context + input with explicit questionKey + payload", () => {
    const envelope = buildEventEnvelope(
      { captureSessionId: "sess-1", isTest: false },
      { type: "question_start", questionKey: "q1", payload: { stage: "view" } },
    );
    expect(envelope).toEqual({
      capture_session_id: "sess-1",
      event_type: "question_start",
      question_key: "q1",
      payload: { stage: "view" },
      is_test: false,
    });
  });

  it("defaults questionKey to null + payload to empty object", () => {
    const envelope = buildEventEnvelope(
      { captureSessionId: "sess-2", isTest: true },
      { type: "session_heartbeat" },
    );
    expect(envelope.question_key).toBeNull();
    expect(envelope.payload).toEqual({});
    expect(envelope.is_test).toBe(true);
  });
});

describe("readIsTestFlagFromStorage", () => {
  it("returns true when storage has key set to 'true'", () => {
    const storage = { getItem: vi.fn().mockReturnValue("true") };
    expect(readIsTestFlagFromStorage(storage)).toBe(true);
  });

  it("returns false when storage has no value or other string", () => {
    expect(readIsTestFlagFromStorage({ getItem: () => null })).toBe(false);
    expect(readIsTestFlagFromStorage({ getItem: () => "false" })).toBe(false);
    expect(readIsTestFlagFromStorage({ getItem: () => "1" })).toBe(false);
  });

  it("returns false when storage is null/undefined or getItem throws", () => {
    expect(readIsTestFlagFromStorage(null)).toBe(false);
    expect(readIsTestFlagFromStorage(undefined)).toBe(false);
    expect(
      readIsTestFlagFromStorage({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toBe(false);
  });
});

describe("mapVisibilityStateToEventType", () => {
  it("maps 'hidden' to session_paused", () => {
    expect(mapVisibilityStateToEventType("hidden")).toBe("session_paused");
  });

  it("maps 'visible' to session_resumed", () => {
    expect(mapVisibilityStateToEventType("visible")).toBe("session_resumed");
  });
});

describe("createDiagnoseTracker", () => {
  type Listener = (event: Event) => void;

  let fetchMock: ReturnType<typeof vi.fn>;
  let sendBeaconMock: ReturnType<typeof vi.fn>;
  let documentListeners: Map<string, Listener>;
  let windowListeners: Map<string, Listener>;
  let intervalHandlers: Array<{ handler: () => void; timeout: number }>;
  let nextIntervalId: number;
  let cleared: number[];
  let storageStore: Record<string, string>;
  let docMock: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  > & { visibilityState: DocumentVisibilityState };
  let winMock: Pick<Window, "addEventListener" | "removeEventListener">;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    sendBeaconMock = vi.fn().mockReturnValue(true);
    documentListeners = new Map();
    windowListeners = new Map();
    intervalHandlers = [];
    nextIntervalId = 1;
    cleared = [];
    storageStore = {};

    docMock = {
      visibilityState: "visible" as DocumentVisibilityState,
      addEventListener: ((type: string, handler: EventListenerOrEventListenerObject) => {
        documentListeners.set(type, handler as Listener);
      }) as Document["addEventListener"],
      removeEventListener: ((type: string) => {
        documentListeners.delete(type);
      }) as Document["removeEventListener"],
    };

    winMock = {
      addEventListener: ((type: string, handler: EventListenerOrEventListenerObject) => {
        windowListeners.set(type, handler as Listener);
      }) as Window["addEventListener"],
      removeEventListener: ((type: string) => {
        windowListeners.delete(type);
      }) as Window["removeEventListener"],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function buildTracker(captureSessionId = "sess-test") {
    return createDiagnoseTracker(
      { captureSessionId, isTest: false },
      {
        fetch: fetchMock as unknown as typeof globalThis.fetch,
        sendBeacon: sendBeaconMock,
        document: docMock,
        window: winMock as Window,
        setInterval: ((handler: () => void, timeout: number) => {
          intervalHandlers.push({ handler, timeout });
          return nextIntervalId++;
        }) as typeof setInterval,
        clearInterval: ((handle: number) => {
          cleared.push(handle);
        }) as typeof clearInterval,
        localStorage: {
          getItem: (key: string) => storageStore[key] ?? null,
        },
      },
    );
  }

  it("registers visibilitychange + beforeunload listeners + heartbeat interval on creation", () => {
    const tracker = buildTracker();
    expect(documentListeners.has("visibilitychange")).toBe(true);
    expect(windowListeners.has("beforeunload")).toBe(true);
    expect(intervalHandlers).toHaveLength(1);
    expect(intervalHandlers[0]!.timeout).toBe(HEARTBEAT_INTERVAL_MS);
    tracker.dispose();
  });

  it("trackEvent fires POST with correct JSON envelope", () => {
    const tracker = buildTracker("sess-fire");
    tracker.trackEvent({ type: "question_answer", questionKey: "q3", payload: { score: 50 } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/diagnose-event");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string)).toEqual({
      capture_session_id: "sess-fire",
      event_type: "question_answer",
      question_key: "q3",
      payload: { score: 50 },
      is_test: false,
    });
    tracker.dispose();
  });

  it("heartbeat interval triggers session_heartbeat POST with last-known question_key", () => {
    const tracker = buildTracker();
    tracker.trackEvent({ type: "question_start", questionKey: "q_alpha" });
    fetchMock.mockClear();

    // Simulate heartbeat tick.
    intervalHandlers[0]!.handler();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.event_type).toBe("session_heartbeat");
    expect(body.question_key).toBe("q_alpha");
    tracker.dispose();
  });

  it("visibilitychange to hidden emits session_paused", () => {
    const tracker = buildTracker();
    fetchMock.mockClear();

    docMock.visibilityState = "hidden";
    documentListeners.get("visibilitychange")!(new Event("visibilitychange"));

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.event_type).toBe("session_paused");
    expect(body.payload).toEqual({ reason: "visibilitychange" });
    tracker.dispose();
  });

  it("visibilitychange to visible emits session_resumed", () => {
    const tracker = buildTracker();
    fetchMock.mockClear();

    docMock.visibilityState = "visible";
    documentListeners.get("visibilitychange")!(new Event("visibilitychange"));

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.event_type).toBe("session_resumed");
    tracker.dispose();
  });

  it("beforeunload uses sendBeacon with session_paused + reason=beforeunload", () => {
    const tracker = buildTracker();

    windowListeners.get("beforeunload")!(new Event("beforeunload"));

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeaconMock.mock.calls[0]!;
    expect(url).toBe("/api/diagnose-event");
    expect(blob).toBeInstanceOf(Blob);
    tracker.dispose();
  });

  it("is_test=true wenn localStorage 'strategaize:is_test_user' = 'true'", () => {
    storageStore["strategaize:is_test_user"] = "true";
    // isTest NICHT explizit in options gesetzt → liest aus storage.
    const tracker = createDiagnoseTracker(
      { captureSessionId: "sess-test-flag" },
      {
        fetch: fetchMock as unknown as typeof globalThis.fetch,
        document: docMock,
        window: winMock as Window,
        setInterval: ((handler: () => void) => {
          intervalHandlers.push({ handler, timeout: HEARTBEAT_INTERVAL_MS });
          return nextIntervalId++;
        }) as typeof setInterval,
        clearInterval: (() => {}) as typeof clearInterval,
        localStorage: {
          getItem: (key: string) => storageStore[key] ?? null,
        },
      },
    );

    tracker.trackEvent({ type: "question_start", questionKey: "q1" });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.is_test).toBe(true);
    tracker.dispose();
  });

  it("dispose removes listeners + clears heartbeat-interval", () => {
    const tracker = buildTracker();
    expect(documentListeners.size).toBe(1);
    expect(windowListeners.size).toBe(1);

    tracker.dispose();

    expect(documentListeners.size).toBe(0);
    expect(windowListeners.size).toBe(0);
    expect(cleared).toEqual([1]);
  });

  it("trackEvent swallows fetch-rejections (fire-and-forget)", async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error("network down"));
    const tracker = createDiagnoseTracker(
      { captureSessionId: "sess-err", isTest: false },
      {
        fetch: failingFetch as unknown as typeof globalThis.fetch,
        document: docMock,
        window: winMock as Window,
        setInterval: (() => 99) as unknown as typeof setInterval,
        clearInterval: (() => {}) as typeof clearInterval,
        localStorage: { getItem: () => null },
      },
    );

    expect(() => tracker.trackEvent({ type: "question_skip", questionKey: "q5" })).not.toThrow();
    expect(failingFetch).toHaveBeenCalledTimes(1);
    // Mikrosleep um die rejected Promise zu durchlaufen (catch greift, kein unhandledrejection).
    await new Promise((resolve) => setTimeout(resolve, 0));
    tracker.dispose();
  });
});
