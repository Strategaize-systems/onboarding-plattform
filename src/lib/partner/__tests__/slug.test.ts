import { describe, it, expect } from "vitest";
import { generateSlug, generateUniqueSlug } from "../slug";

describe("generateSlug", () => {
  it("converts standard display name to kebab-case slug", () => {
    expect(generateSlug("Mueller & Partner StB")).toBe("mueller-partner-stb");
  });

  it("strips ampersand and collapses spaces", () => {
    expect(generateSlug("AB & CD Steuerberatung GmbH")).toBe(
      "ab-cd-steuerberatung-gmbh",
    );
  });

  it("trims leading and trailing whitespace and collapses internal whitespace", () => {
    expect(generateSlug("   Test  ")).toBe("test");
  });

  it("truncates very long inputs to 60 chars", () => {
    const result = generateSlug("a".repeat(100));
    expect(result.length).toBe(60);
    expect(result).toBe("a".repeat(60));
  });

  it("throws on empty string input", () => {
    expect(() => generateSlug("")).toThrow(/empty/i);
    expect(() => generateSlug("   ")).toThrow(/empty/i);
  });

  it("handles compound display name with hyphen and abbreviation", () => {
    expect(generateSlug("Steuerkanzlei Mueller-Schmidt &Co.")).toBe(
      "steuerkanzlei-mueller-schmidt-co",
    );
  });

  it("handles german umlauts via ae/oe/ue/ss transliteration", () => {
    expect(generateSlug("Müller & Partner")).toBe("mueller-partner");
    expect(generateSlug("Bäcker Größe")).toBe("baecker-groesse");
    expect(generateSlug("Über Allem")).toBe("ueber-allem");
  });
});

describe("generateUniqueSlug", () => {
  it("returns base slug when not in existingSlugs and not reserved", () => {
    expect(generateUniqueSlug("Test Kanzlei", new Set())).toBe("test-kanzlei");
  });

  it("appends -2 on first collision with existingSlugs", () => {
    expect(generateUniqueSlug("Foo", new Set(["foo"]))).toBe("foo-2");
  });

  it("appends -3 on second collision (set already contains foo-2)", () => {
    expect(generateUniqueSlug("Foo", new Set(["foo", "foo-2"]))).toBe("foo-3");
  });

  it("treats reserved slug as collision, returns -2 suffix", () => {
    expect(generateUniqueSlug("Admin", new Set())).toBe("admin-2");
    expect(generateUniqueSlug("API", new Set())).toBe("api-2");
  });

  it("uses case-insensitive compare against existingSlugs", () => {
    expect(generateUniqueSlug("Foo", new Set(["FOO"]))).toBe("foo-2");
  });

  it("handles multi-collision chain across reserved + existing", () => {
    expect(generateUniqueSlug("Admin", new Set(["admin-2", "admin-3"]))).toBe(
      "admin-4",
    );
  });
});
