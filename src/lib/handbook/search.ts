// SLC-045 MT-1 — Helper fuer Volltext-Suche im Reader.
//
// Stellt zwei Funktionen bereit:
//   - countMatchesInMarkdown: Treffer-Zahl pro Section (case-insensitive,
//     skipt Markdown-Code-Bloecke ``` ... ``` und Inline-Code `...`).
//   - extractSnippetsFromMarkdown: Snippets fuer die Treffer-Liste pro Section
//     (max snippetLength Zeichen Kontext links/rechts pro Treffer).
//
// Die ID-Konvention `match-{sectionKey}-{index}` muss konsistent zum
// rehype-Plugin (highlight-rehype-plugin.ts) sein, damit Klick auf einen
// Listen-Eintrag den passenden <mark> findet. Index ist die laufende Nummer
// der gefundenen Treffer pro Section, beginnend bei 0.

export interface SectionSearchSnippet {
  matchIndex: number;
  domId: string;
  snippet: string;
  matchOffset: number;
}

export interface SectionSearchResult {
  sectionKey: string;
  matchCount: number;
  snippets: SectionSearchSnippet[];
}

const FENCE_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`\n]+`/g;

/**
 * Gibt das Markdown ohne Code-Bloecke zurueck (gleiche Bytes durch Spaces ersetzt,
 * damit Offsets stabil bleiben). Treffer in Code-Bloecken werden nicht gezaehlt
 * und nicht hervorgehoben — konsistent zum rehype-Plugin.
 */
function maskCodeBlocks(markdown: string): string {
  return markdown
    .replace(FENCE_PATTERN, (m) => " ".repeat(m.length))
    .replace(INLINE_CODE_PATTERN, (m) => " ".repeat(m.length));
}

export function countMatchesInMarkdown(markdown: string, query: string): number {
  if (!query || query.length < 3) return 0;
  const haystack = maskCodeBlocks(markdown).toLowerCase();
  const needle = query.toLowerCase();
  let count = 0;
  let cursor = 0;
  while (cursor < haystack.length) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) break;
    count += 1;
    cursor = at + needle.length;
  }
  return count;
}

export function extractSnippetsFromMarkdown(params: {
  sectionKey: string;
  markdown: string;
  query: string;
  snippetContextChars?: number;
  domIdPrefix?: string;
}): SectionSearchResult {
  const {
    sectionKey,
    markdown,
    query,
    snippetContextChars = 50,
    domIdPrefix = "match",
  } = params;

  if (!query || query.length < 3) {
    return { sectionKey, matchCount: 0, snippets: [] };
  }

  const masked = maskCodeBlocks(markdown);
  const lowerHaystack = masked.toLowerCase();
  const needle = query.toLowerCase();
  const snippets: SectionSearchSnippet[] = [];

  let cursor = 0;
  let idx = 0;
  while (cursor < lowerHaystack.length) {
    const at = lowerHaystack.indexOf(needle, cursor);
    if (at === -1) break;
    const start = Math.max(0, at - snippetContextChars);
    const end = Math.min(markdown.length, at + needle.length + snippetContextChars);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < markdown.length ? "..." : "";
    const snippet = `${prefix}${markdown.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
    snippets.push({
      matchIndex: idx,
      domId: `${domIdPrefix}-${sectionKey}-${idx}`,
      snippet,
      matchOffset: at,
    });
    idx += 1;
    cursor = at + needle.length;
  }

  return { sectionKey, matchCount: snippets.length, snippets };
}
