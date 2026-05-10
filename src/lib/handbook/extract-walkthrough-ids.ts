// SLC-092 MT-3 — Extrahiert Walkthrough-Session-IDs aus dem Snapshot-Markdown
// fuer den `walkthrough_video_embed` Audit-Eintrag (DEC-098).
//
// Worker emittiert pro approved Walkthrough genau einen <video>-Tag mit
// `src="/api/walkthrough/{session_id}/embed"` (sections.ts:234). Unique IDs
// damit dieselbe Session nicht mehrfach im Audit auftaucht (defensiv,
// aktuell rendert der Worker pro Session genau ein <video>).

const EMBED_URL_RE =
  /\/api\/walkthrough\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/embed/gi;

export interface SectionLike {
  markdown: string;
}

export function extractWalkthroughIds(
  sections: ReadonlyArray<SectionLike>,
  indexMarkdown: string | null = null,
): string[] {
  const ids = new Set<string>();
  const sources: string[] = [];
  if (indexMarkdown) sources.push(indexMarkdown);
  for (const s of sections) sources.push(s.markdown);

  for (const md of sources) {
    EMBED_URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EMBED_URL_RE.exec(md)) !== null) {
      ids.add(m[1].toLowerCase());
    }
  }
  return [...ids];
}
