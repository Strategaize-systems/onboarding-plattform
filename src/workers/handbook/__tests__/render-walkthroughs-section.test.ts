// SLC-091 MT-3 — Tests fuer renderWalkthroughsSection.
// Deterministisch, kein DB-Zugriff. Pure Funktion auf WalkthroughRow[].

import { describe, expect, it } from "vitest";
import { renderWalkthroughsSection } from "../sections";
import type { HandbookSection, WalkthroughRow } from "../types";

const SECTION: HandbookSection = {
  key: "walkthroughs",
  title: "Walkthroughs",
  order: 15,
  sources: [{ type: "walkthrough", filter: { min_status: "approved" } }],
  render: { subsections_by: "subtopic", intro_template: null },
};

const SECTION_FILE_MAP = { walkthroughs: "15_walkthroughs.md" };
const SECTION_ANCHOR_MAP = { walkthroughs: "walkthroughs" };

const SESSION_ID_1 = "11111111-1111-1111-1111-111111111111";
const SESSION_ID_2 = "22222222-2222-2222-2222-222222222222";

const WT_FULL: WalkthroughRow = {
  id: SESSION_ID_1,
  tenant_id: "00000000-0000-0000-0000-00000000000a",
  recorded_by_user_id: "ffffffff-1111-1111-1111-111111111111",
  recorder_display_name: "max.mustermann",
  created_at: "2026-05-08T09:00:00Z",
  reviewed_at: "2026-05-08T10:00:00Z",
  duration_sec: 754, // 12:34
  steps: [
    {
      id: "s1",
      step_number: 1,
      action: "Login pruefen",
      responsible: "Vermietungs-Manager",
      timeframe: "1 min",
      success_criterion: "User ist eingeloggt",
      dependencies: null,
      transcript_snippet: null,
    },
    {
      id: "s2",
      step_number: 2,
      action: "Mieter anlegen",
      responsible: null,
      timeframe: null,
      success_criterion: null,
      dependencies: "Schritt 1",
      transcript_snippet: null,
    },
    {
      id: "s3",
      step_number: 3,
      action: "Vertrag generieren",
      responsible: "Buchhaltung",
      timeframe: null,
      success_criterion: null,
      dependencies: null,
      transcript_snippet: null,
    },
  ],
  mappings: [
    {
      walkthrough_step_id: "s1",
      subtopic_id: "Block A / A1 Grundverstaendnis",
      confidence_band: "green",
      reviewer_corrected: false,
    },
    {
      walkthrough_step_id: "s2",
      subtopic_id: "Block A / A1 Grundverstaendnis",
      confidence_band: "yellow",
      reviewer_corrected: true,
    },
    // s3 hat KEIN Mapping → Unmapped-Bucket
  ],
};

describe("renderWalkthroughsSection", () => {
  it("rendert Empty-State wenn keine Walkthroughs vorhanden", () => {
    const result = renderWalkthroughsSection({
      section: SECTION,
      walkthroughs: [],
      crossLinksFromSection: [],
      sectionFileMap: SECTION_FILE_MAP,
      sectionAnchorMap: SECTION_ANCHOR_MAP,
    });
    expect(result.filename).toBe("15_walkthroughs.md");
    expect(result.markdown).toContain("# Walkthroughs");
    expect(result.markdown).toContain('<a id="section-walkthroughs"></a>');
    expect(result.markdown).toContain("_Es wurden noch keine Walkthroughs freigegeben._");
    expect(result.walkthroughCount).toBe(0);
    expect(result.knowledgeUnitCount).toBe(0);
    expect(result.diagnosisCount).toBe(0);
    expect(result.sopCount).toBe(0);
  });

  it("rendert einzelnen Walkthrough mit Subtopic-Gruppen + Unmapped-Bucket + video-Tag", () => {
    const result = renderWalkthroughsSection({
      section: SECTION,
      walkthroughs: [WT_FULL],
      crossLinksFromSection: [],
      sectionFileMap: SECTION_FILE_MAP,
      sectionAnchorMap: SECTION_ANCHOR_MAP,
    });

    const md = result.markdown;

    // Header + Anchor
    expect(md).toContain("# Walkthroughs");
    expect(md).toContain('<a id="section-walkthroughs"></a>');

    // Default-Intro (weil intro_template null)
    expect(md).toContain("In diesem Abschnitt finden Sie freigegebene Walkthroughs");

    // H2 Recorder + Datum + Dauer
    expect(md).toContain("## max.mustermann — 2026-05-08 (12:34)");

    // Walkthrough-Anchor
    expect(md).toContain(`<a id="walkthrough-${SESSION_ID_1.slice(0, 8)}"></a>`);

    // Video-Embed mit Storage-Proxy-URL (DEC-096)
    expect(md).toContain(`<video src="/api/walkthrough/${SESSION_ID_1}/embed"`);
    expect(md).toContain('controls preload="metadata"');

    // Subtopic-H3
    expect(md).toContain("### Block A / A1 Grundverstaendnis");

    // Schritt-Liste numeriert (1.) — innerhalb Subtopic
    expect(md).toMatch(/1\.\s+\*\*Login pruefen\*\*/);
    expect(md).toContain("_Verantwortlich:_ Vermietungs-Manager");
    expect(md).toContain("_Frist:_ 1 min");
    expect(md).toContain("_Erfolg:_ User ist eingeloggt");

    // Mieter anlegen ist 2. innerhalb Subtopic A1, hat dependencies
    expect(md).toMatch(/2\.\s+\*\*Mieter anlegen\*\*/);
    expect(md).toContain("_Voraussetzungen:_ Schritt 1");

    // Unmapped-Bucket fuer s3
    expect(md).toContain("### Unzugeordnete Schritte");
    expect(md).toMatch(/1\.\s+\*\*Vertrag generieren\*\*/);

    expect(result.walkthroughCount).toBe(1);
  });

  it("rendert mehrere Walkthroughs in Reihenfolge", () => {
    const wt2: WalkthroughRow = {
      ...WT_FULL,
      id: SESSION_ID_2,
      recorder_display_name: "anna.schmidt",
      created_at: "2026-05-09T08:00:00Z",
      duration_sec: 60,
      steps: [
        {
          id: "x1",
          step_number: 1,
          action: "Test-Schritt",
          responsible: null,
          timeframe: null,
          success_criterion: null,
          dependencies: null,
          transcript_snippet: null,
        },
      ],
      mappings: [],
    };

    const result = renderWalkthroughsSection({
      section: SECTION,
      walkthroughs: [WT_FULL, wt2],
      crossLinksFromSection: [],
      sectionFileMap: SECTION_FILE_MAP,
      sectionAnchorMap: SECTION_ANCHOR_MAP,
    });

    expect(result.walkthroughCount).toBe(2);
    expect(result.markdown).toContain("max.mustermann");
    expect(result.markdown).toContain("anna.schmidt");
    expect(result.markdown).toContain("(1:00)"); // 60s = 1:00
    // Reihenfolge: WT_FULL kommt vor wt2 (Loader-Output-Order ist hier preserved)
    const idxFirst = result.markdown.indexOf("max.mustermann");
    const idxSecond = result.markdown.indexOf("anna.schmidt");
    expect(idxFirst).toBeGreaterThan(0);
    expect(idxSecond).toBeGreaterThan(idxFirst);
  });

  it("haelt fehlende duration_sec ab (kein Suffix)", () => {
    const wt: WalkthroughRow = {
      ...WT_FULL,
      duration_sec: null,
      steps: [WT_FULL.steps[0]],
      mappings: [],
    };
    const result = renderWalkthroughsSection({
      section: SECTION,
      walkthroughs: [wt],
      crossLinksFromSection: [],
      sectionFileMap: SECTION_FILE_MAP,
      sectionAnchorMap: SECTION_ANCHOR_MAP,
    });
    // H2-Header ohne (mm:ss)
    expect(result.markdown).toMatch(/## max\.mustermann — 2026-05-08\n/);
  });

  it("rendert Custom-Intro-Template wenn gesetzt", () => {
    const sectionWithIntro: HandbookSection = {
      ...SECTION,
      render: { subsections_by: "subtopic", intro_template: "Spezial-Intro fuer diesen Tenant." },
    };
    const result = renderWalkthroughsSection({
      section: sectionWithIntro,
      walkthroughs: [],
      crossLinksFromSection: [],
      sectionFileMap: SECTION_FILE_MAP,
      sectionAnchorMap: SECTION_ANCHOR_MAP,
    });
    expect(result.markdown).toContain("Spezial-Intro fuer diesen Tenant.");
    // Default-Intro NICHT enthalten
    expect(result.markdown).not.toContain("In diesem Abschnitt finden Sie freigegebene Walkthroughs");
  });
});
