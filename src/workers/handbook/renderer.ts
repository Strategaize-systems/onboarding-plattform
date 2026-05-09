// SLC-039 MT-3 — Renderer-Orchestrator
//
// Orchestriert pro HandbookSchema die Section-Renderer + INDEX-Builder.
// Kein DB-Zugriff hier — pure Funktion auf bereits geladenen Datenmengen.
// Output: Record<filename, markdownString> + Counts.

import { buildIndexMarkdown } from "./index-builder";
import { buildSectionAnchorMap, buildSectionFileMap, renderSection } from "./sections";
import type {
  HandbookSection,
  RendererInput,
  RendererOutput,
} from "./types";

const INDEX_FILENAME = "INDEX.md";

export function renderHandbook(input: RendererInput): RendererOutput {
  const sortedSections: HandbookSection[] = [...input.schema.sections].sort(
    (a, b) => a.order - b.order,
  );

  const sectionFileMap = buildSectionFileMap(sortedSections);
  const sectionAnchorMap = buildSectionAnchorMap(sortedSections);
  const crossLinks = input.schema.cross_links ?? [];

  const files: Record<string, string> = {};
  let kuCount = 0;
  let diagCount = 0;
  let sopCount = 0;
  let walkthroughCount = 0;

  for (const section of sortedSections) {
    const linksFromSection = crossLinks.filter(
      (l) => l.from_section === section.key,
    );
    const rendered = renderSection({
      section,
      knowledgeUnits: input.knowledgeUnits,
      diagnoses: input.diagnoses,
      sops: input.sops,
      walkthroughs: input.walkthroughs ?? [], // V5.1
      crossLinksFromSection: linksFromSection,
      sectionFileMap,
      sectionAnchorMap,
    });
    files[rendered.filename] = rendered.markdown;
    kuCount += rendered.knowledgeUnitCount;
    diagCount += rendered.diagnosisCount;
    sopCount += rendered.sopCount;
    walkthroughCount += rendered.walkthroughCount;
  }

  files[INDEX_FILENAME] = buildIndexMarkdown({
    sections: sortedSections,
    sectionFileMap,
    sectionAnchorMap,
    tenantName: input.tenantName,
    generatedAt: input.generatedAt,
  });

  return {
    files,
    counts: {
      section_count: sortedSections.length,
      knowledge_unit_count: kuCount,
      diagnosis_count: diagCount,
      sop_count: sopCount,
      walkthrough_count: walkthroughCount,
    },
  };
}

export const HANDBOOK_INDEX_FILENAME = INDEX_FILENAME;
