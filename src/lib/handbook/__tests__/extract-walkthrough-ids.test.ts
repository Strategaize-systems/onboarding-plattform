// SLC-092 MT-3 — Tests fuer extractWalkthroughIds (Audit-Helper).

import { describe, it, expect } from "vitest";
import { extractWalkthroughIds } from "../extract-walkthrough-ids";

const ID_A = "75098a5d-aaaa-4bbb-8ccc-dddddddddddd";
const ID_B = "f51951ca-aaaa-4bbb-8ccc-eeeeeeeeeeee";

describe("extractWalkthroughIds", () => {
  it("liefert leeres Array bei Sections ohne Walkthrough-Embed", () => {
    const sections = [{ markdown: "# Hallo\n\nKein Video hier." }];
    expect(extractWalkthroughIds(sections)).toEqual([]);
  });

  it("findet eine Walkthrough-ID aus dem Worker-<video>-Tag", () => {
    const md = `<video src="/api/walkthrough/${ID_A}/embed" controls></video>`;
    const ids = extractWalkthroughIds([{ markdown: md }]);
    expect(ids).toEqual([ID_A]);
  });

  it("findet mehrere Walkthrough-IDs ueber mehrere Sections", () => {
    const sections = [
      { markdown: `<video src="/api/walkthrough/${ID_A}/embed"></video>` },
      { markdown: `pre <video src="/api/walkthrough/${ID_B}/embed"></video> post` },
    ];
    const ids = extractWalkthroughIds(sections);
    expect(ids.sort()).toEqual([ID_A, ID_B].sort());
  });

  it("dedupliziert wiederholte IDs (defensiv gegen Multi-<video> pro Session)", () => {
    const md = `<video src="/api/walkthrough/${ID_A}/embed"></video>
                <video src="/api/walkthrough/${ID_A}/embed"></video>`;
    const ids = extractWalkthroughIds([{ markdown: md }]);
    expect(ids).toEqual([ID_A]);
  });

  it("scannt auch indexMarkdown wenn uebergeben", () => {
    const idx = `<video src="/api/walkthrough/${ID_A}/embed"></video>`;
    const ids = extractWalkthroughIds([], idx);
    expect(ids).toEqual([ID_A]);
  });

  it("ignoriert Nicht-UUID-Pfade die wie embeds aussehen", () => {
    const md = `<video src="/api/walkthrough/not-a-uuid/embed"></video>`;
    const ids = extractWalkthroughIds([{ markdown: md }]);
    expect(ids).toEqual([]);
  });
});
