import { describe, it, expect } from "vitest";
import { pageKeyFromPathname } from "../page-key-from-pathname";

describe("pageKeyFromPathname", () => {
  it("maps /dashboard to dashboard", () => {
    expect(pageKeyFromPathname("/dashboard")).toBe("dashboard");
  });

  it("maps /dashboard/capture/<id> to capture", () => {
    expect(pageKeyFromPathname("/dashboard/capture/abc-123")).toBe("capture");
  });

  it("maps /capture/<id> to capture", () => {
    expect(pageKeyFromPathname("/capture/sess-xyz")).toBe("capture");
  });

  it("maps /admin/bridge/... to bridge", () => {
    expect(pageKeyFromPathname("/admin/bridge")).toBe("bridge");
    expect(pageKeyFromPathname("/admin/bridge/run/xyz")).toBe("bridge");
  });

  it("maps /admin/reviews and /admin/blocks/<key>/review to reviews", () => {
    expect(pageKeyFromPathname("/admin/reviews")).toBe("reviews");
    expect(pageKeyFromPathname("/admin/blocks/strategy/review")).toBe("reviews");
  });

  it("maps /dashboard/handbook[/<id>] to handbook", () => {
    expect(pageKeyFromPathname("/dashboard/handbook")).toBe("handbook");
    expect(pageKeyFromPathname("/dashboard/handbook/snap-123")).toBe("handbook");
  });

  it("returns null for unknown paths", () => {
    expect(pageKeyFromPathname("/")).toBeNull();
    expect(pageKeyFromPathname("/login")).toBeNull();
    expect(pageKeyFromPathname("/admin/team")).toBeNull();
  });

  it("ignores query and hash and locale prefix", () => {
    expect(pageKeyFromPathname("/dashboard?foo=bar")).toBe("dashboard");
    expect(pageKeyFromPathname("/dashboard#section")).toBe("dashboard");
    expect(pageKeyFromPathname("/de/dashboard")).toBe("dashboard");
    expect(pageKeyFromPathname("/en/admin/bridge")).toBe("bridge");
  });

  it("returns null for empty input", () => {
    expect(pageKeyFromPathname("")).toBeNull();
  });
});
