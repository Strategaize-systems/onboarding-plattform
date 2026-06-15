// SLC-V9.7-B MT-1 — OKF-Konformitaets-Check Tests (TDD-RED zuerst).
//
// Prueft `checkOkfConformance` gegen handgebaute conformant/non-conformant
// Fixtures: SC-V9.7-1 (Frontmatter parsebar + non-empty type), SC-2 (type in
// registrierter Tabelle), SC-3 (strategaize_source + strategaize_tenant),
// SC-4 (root index.md mit okf_version + strategaize_okf_profile), SC-5 (log.md
// vorhanden + >=1 Eintrag). Grounding: Rule strategaize-okf-profile.md.

import { describe, expect, it } from "vitest";
import { checkOkfConformance } from "../conformance";

const ROOT_INDEX = `---
okf_version: "0.1"
strategaize_okf_profile: "1.0"
---

# OKF Wissens-Bundle

## a_zielgruppe
* [Zielgruppe ist B2B](/a_zielgruppe/finding-zielgruppe-ist-b2b-11112222.md) - Der Kunde fokussiert auf B2B.
`;

const LOG = `# Log

## 2026-06-15
- Creation: Bundle aus Snapshot 1a2b3c4d, 1 Concepts
`;

const CONCEPT = `---
type: finding
title: Zielgruppe ist B2B
description: Der Kunde fokussiert auf B2B.
strategaize_source: op
strategaize_tenant: tenant-abc
strategaize_id: 11112222-3333-4444-5555-666677778888
---

Der Kunde fokussiert auf B2B.
`;

function conformantBundle(): Record<string, string> {
  return {
    "index.md": ROOT_INDEX,
    "log.md": LOG,
    "a_zielgruppe/finding-zielgruppe-ist-b2b-11112222.md": CONCEPT,
  };
}

describe("checkOkfConformance", () => {
  it("accepts a conformant bundle (ok=true, no violations)", () => {
    const result = checkOkfConformance(conformantBundle());
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("SC-1: flags a concept with unparsable frontmatter", () => {
    const files = conformantBundle();
    files["a_zielgruppe/broken.md"] = "no frontmatter fence at all\n";
    const result = checkOkfConformance(files);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        file: "a_zielgruppe/broken.md",
        rule: "frontmatter-parsable",
      }),
    );
  });

  it("SC-1: flags a concept with empty type", () => {
    const files = conformantBundle();
    files["a_zielgruppe/empty-type.md"] = `---
type: ""
strategaize_source: op
strategaize_tenant: tenant-abc
---

body
`;
    const result = checkOkfConformance(files);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        file: "a_zielgruppe/empty-type.md",
        rule: "type-required",
      }),
    );
  });

  it("SC-2: flags an unregistered type", () => {
    const files = conformantBundle();
    files["a_zielgruppe/bogus.md"] = `---
type: bogus
strategaize_source: op
strategaize_tenant: tenant-abc
---

body
`;
    const result = checkOkfConformance(files);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        file: "a_zielgruppe/bogus.md",
        rule: "type-registered",
      }),
    );
  });

  it("SC-3: flags a concept missing strategaize_source / strategaize_tenant", () => {
    const files = conformantBundle();
    files["a_zielgruppe/no-source.md"] = `---
type: finding
title: X
---

body
`;
    const result = checkOkfConformance(files);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        file: "a_zielgruppe/no-source.md",
        rule: "strategaize-fields",
      }),
    );
  });

  it("SC-4: flags root index.md missing okf_version / profile", () => {
    const files = conformantBundle();
    files["index.md"] = `---
strategaize_okf_profile: "1.0"
---

# Bundle
`;
    const result = checkOkfConformance(files);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ file: "index.md", rule: "root-index-version" }),
    );
  });

  it("SC-4: flags a bundle without root index.md at all", () => {
    const files = conformantBundle();
    delete files["index.md"];
    const result = checkOkfConformance(files);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ file: "index.md", rule: "root-index-version" }),
    );
  });

  it("SC-5: flags a missing log.md", () => {
    const files = conformantBundle();
    delete files["log.md"];
    const result = checkOkfConformance(files);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ file: "log.md", rule: "log-present" }),
    );
  });

  it("SC-5: flags a log.md with no entry", () => {
    const files = conformantBundle();
    files["log.md"] = "# Log\n";
    const result = checkOkfConformance(files);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ file: "log.md", rule: "log-present" }),
    );
  });

  it("does not require a `type` on the reserved root index.md / log.md", () => {
    // Reserved files have no `type` — they must not trigger type-required.
    const result = checkOkfConformance(conformantBundle());
    expect(
      result.violations.some((v) => v.rule === "type-required"),
    ).toBe(false);
  });

  it("ignores non-.md files", () => {
    const files = conformantBundle();
    files["a_zielgruppe/note.txt"] = "not markdown";
    const result = checkOkfConformance(files);
    expect(result.ok).toBe(true);
  });
});
