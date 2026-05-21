import { describe, expect, it } from "vitest";

import { shouldUseRouterBack } from "../legal-page-header-logic";

describe("shouldUseRouterBack", () => {
  it("returns false for empty referrer (direct entry, bookmark, new tab)", () => {
    expect(shouldUseRouterBack("", "onboarding.strategaizetransition.com")).toBe(false);
  });

  it("returns true for same-origin referrer (in-app navigation)", () => {
    expect(
      shouldUseRouterBack(
        "https://onboarding.strategaizetransition.com/dashboard",
        "onboarding.strategaizetransition.com",
      ),
    ).toBe(true);
  });

  it("returns false for external referrer (came from Google, partner site, etc.)", () => {
    expect(
      shouldUseRouterBack(
        "https://www.google.com/search?q=datenschutz",
        "onboarding.strategaizetransition.com",
      ),
    ).toBe(false);
  });

  it("returns false for malformed referrer string", () => {
    expect(shouldUseRouterBack("not-a-valid-url", "onboarding.strategaizetransition.com")).toBe(false);
  });
});
