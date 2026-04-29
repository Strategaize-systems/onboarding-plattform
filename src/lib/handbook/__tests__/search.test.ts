// SLC-045 MT-1 — Tests fuer Volltext-Such-Helper.

import { describe, it, expect } from "vitest";
import {
  countMatchesInMarkdown,
  extractSnippetsFromMarkdown,
} from "../search";

describe("countMatchesInMarkdown", () => {
  it("zaehlt 0 Treffer bei Query unter 3 Zeichen", () => {
    expect(countMatchesInMarkdown("foo bar baz", "fo")).toBe(0);
    expect(countMatchesInMarkdown("foo bar baz", "")).toBe(0);
  });

  it("zaehlt case-insensitive", () => {
    expect(countMatchesInMarkdown("Foo BAR foo bar Foo", "foo")).toBe(3);
  });

  it("ueberlappende Treffer werden nicht doppelt gezaehlt", () => {
    expect(countMatchesInMarkdown("aaaa", "aaa")).toBe(1);
  });

  it("ueberspringt Code-Bloecke (```...```)", () => {
    const md = "Hello world\n```\nhello in code\n```\nhello again";
    expect(countMatchesInMarkdown(md, "hello")).toBe(2);
  });

  it("ueberspringt Inline-Code (`...`)", () => {
    const md = "Hier `eine secret` und hier eine secret im Text";
    expect(countMatchesInMarkdown(md, "secret")).toBe(1);
  });

  it("liefert 0 wenn die Query nicht vorkommt", () => {
    expect(countMatchesInMarkdown("nichts hier", "abcxyz")).toBe(0);
  });
});

describe("extractSnippetsFromMarkdown", () => {
  it("liefert leere Treffer-Liste bei Query unter 3 Zeichen", () => {
    const result = extractSnippetsFromMarkdown({
      sectionKey: "s1",
      markdown: "foo bar",
      query: "fo",
    });
    expect(result.matchCount).toBe(0);
    expect(result.snippets).toHaveLength(0);
  });

  it("liefert pro Treffer einen Snippet mit Kontext", () => {
    const md = "Lorem ipsum dolor sit amet.";
    const result = extractSnippetsFromMarkdown({
      sectionKey: "s1",
      markdown: md,
      query: "dolor",
      snippetContextChars: 10,
    });
    expect(result.matchCount).toBe(1);
    expect(result.snippets[0].snippet).toContain("dolor");
    expect(result.snippets[0].domId).toBe("match-s1-0");
  });

  it("liefert mehrere Treffer mit konsekutiven IDs", () => {
    const md = "Foo Foo Foo";
    const result = extractSnippetsFromMarkdown({
      sectionKey: "abc",
      markdown: md,
      query: "Foo",
    });
    expect(result.matchCount).toBe(3);
    expect(result.snippets.map((s) => s.domId)).toEqual([
      "match-abc-0",
      "match-abc-1",
      "match-abc-2",
    ]);
  });

  it("ueberspringt Treffer in Code-Bloecken", () => {
    const md = "secret data\n```\nthis secret is in code\n```\nanother secret";
    const result = extractSnippetsFromMarkdown({
      sectionKey: "s1",
      markdown: md,
      query: "secret",
    });
    expect(result.matchCount).toBe(2);
  });

  it("respektiert custom domIdPrefix", () => {
    const result = extractSnippetsFromMarkdown({
      sectionKey: "s1",
      markdown: "foo bar",
      query: "foo",
      domIdPrefix: "hit",
    });
    expect(result.snippets[0].domId).toBe("hit-s1-0");
  });
});
