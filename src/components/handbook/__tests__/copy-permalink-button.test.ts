// SLC-051 MT-3 — Tests fuer buildPermalink (pure URL-Composition).
//
// Click-Verhalten + Clipboard-API + Toast-Trigger werden im Browser-Smoke
// (Pflicht-Gate 1280×800/375×667) verifiziert — vitest-environment ist `node`,
// jsdom + @testing-library/react bewusst nicht installiert (siehe slice
// implementation note).

import { describe, it, expect } from "vitest";
import { buildPermalink } from "../copy-permalink-button";

describe("buildPermalink", () => {
  it("baut URL aus origin + pathname + hash", () => {
    expect(
      buildPermalink(
        "https://onboarding.strategaizetransition.com",
        "/dashboard/handbook/abc-123",
        "handbook-section-strategy",
      ),
    ).toBe(
      "https://onboarding.strategaizetransition.com/dashboard/handbook/abc-123#handbook-section-strategy",
    );
  });

  it("entfernt fuehrendes # aus dem hash falls vorhanden", () => {
    expect(
      buildPermalink("https://x.test", "/y", "#anchor"),
    ).toBe("https://x.test/y#anchor");
  });

  it("setzt pathname auf / wenn leer", () => {
    expect(buildPermalink("https://x.test", "", "anchor")).toBe(
      "https://x.test/#anchor",
    );
  });

  it("erlaubt nested anchors mit Bindestrichen + Underscores", () => {
    expect(
      buildPermalink("https://x.test", "/a/b", "kunden_betreuung-1"),
    ).toBe("https://x.test/a/b#kunden_betreuung-1");
  });
});
