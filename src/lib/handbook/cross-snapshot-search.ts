// SLC-054 MT-2 — Client-side Cross-Snapshot-Suche.
//
// Iteriert ueber alle Sektionen aller Tenant-Snapshots und sucht nach einer
// case-insensitive Substring-Match in Section-Title + Section-Body. Pure
// Function ohne DOM-/Storage-Abhaengigkeit, daher unit-testbar.
//
// Per V4.3 Trade-off (siehe Slice SLC-054 Risks R1+R4): einfacher Iterations-
// Algorithmus, keine Tokenisierung, keine Fuzzy-Suche. Bei sehr vielen
// Snapshots oder grossen Sections ggf. spuerbare Latenz im Hauptthread —
// Mitigation: 300ms Input-Debounce in der Komponente und Top-N-Cap (50).
//
// Sortier-Reihenfolge: matchCount * recencyWeight (juengere Snapshots bekommen
// einen Boost). Bei Gleichstand: Snapshot-Datum descending, dann Section-Order.

const DEFAULT_MAX_RESULTS = 50;
const DEFAULT_SNIPPET_CONTEXT_CHARS = 60;

export interface CrossSearchSection {
  /** sectionKey ist im Snapshot eindeutig (z.B. "strategy", "team_struktur"). */
  sectionKey: string;
  /** Lesbarer Titel (z.B. "Strategie & Geschaefte"). */
  title: string;
  /** Roher Markdown-Body. */
  markdown: string;
  /** Reihenfolge in dem Snapshot (fuer Tie-Break). */
  order: number;
}

export interface CrossSearchSnapshot {
  id: string;
  /** Datum-String fuer Anzeige (Server-formatiert). */
  formattedCreatedAt: string;
  /** ISO-Datum fuer Recency-Score. */
  createdAtIso: string;
  sections: CrossSearchSection[];
}

export interface CrossSnapshotSearchResult {
  snapshotId: string;
  snapshotDate: string;
  snapshotIso: string;
  sectionKey: string;
  sectionTitle: string;
  matchCount: number;
  /** ~120 Zeichen Kontext um den ersten Treffer. */
  snippet: string;
  /** Sortier-Score (matchCount * recencyWeight). */
  score: number;
}

interface SearchOptions {
  maxResults?: number;
  snippetContextChars?: number;
  /** Optional: explizit gesetzte "Jetzt"-Zeit (fuer reproduzierbare Tests). */
  now?: Date;
}

export function searchAcrossSnapshots(
  query: string,
  snapshots: CrossSearchSnapshot[],
  options: SearchOptions = {},
): CrossSnapshotSearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const snippetChars = options.snippetContextChars ?? DEFAULT_SNIPPET_CONTEXT_CHARS;
  const now = options.now ?? new Date();

  const needle = trimmed.toLowerCase();
  const out: CrossSnapshotSearchResult[] = [];

  for (const snap of snapshots) {
    const recency = computeRecencyWeight(snap.createdAtIso, now);
    for (const section of snap.sections) {
      const titleHay = section.title.toLowerCase();
      const bodyHay = section.markdown.toLowerCase();
      const titleHits = countOccurrences(titleHay, needle);
      const bodyHits = countOccurrences(bodyHay, needle);
      const matchCount = titleHits + bodyHits;
      if (matchCount === 0) continue;

      // Title-Treffer wiegen 5x mehr als Body-Treffer (UI-relevanter).
      const weightedMatchCount = titleHits * 5 + bodyHits;
      const score = weightedMatchCount * recency;

      out.push({
        snapshotId: snap.id,
        snapshotDate: snap.formattedCreatedAt,
        snapshotIso: snap.createdAtIso,
        sectionKey: section.sectionKey,
        sectionTitle: section.title,
        matchCount,
        snippet: extractSnippet(section.markdown, needle, snippetChars),
        score,
      });
    }
  }

  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-Break: juengster Snapshot zuerst, dann hoeherer matchCount
    if (b.snapshotIso !== a.snapshotIso) {
      return b.snapshotIso.localeCompare(a.snapshotIso);
    }
    return b.matchCount - a.matchCount;
  });

  return out.slice(0, maxResults);
}

/**
 * Pure helper: zaehlt nicht-ueberlappende Substring-Vorkommen im Haystack.
 * Beide Strings sind bereits lowercased.
 */
export function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
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

/**
 * Pure helper: extrahiert ~contextChars Zeichen Kontext um den ersten Treffer.
 * Whitespace wird normalisiert ("..." Praefix/Suffix wenn am Anfang/Ende
 * abgeschnitten).
 */
export function extractSnippet(
  markdown: string,
  needleLower: string,
  contextChars: number,
): string {
  const lower = markdown.toLowerCase();
  const at = lower.indexOf(needleLower);
  if (at === -1) {
    // Treffer war im Title; gib den Anfang des Bodys als Snippet.
    const head = markdown.slice(0, contextChars * 2).replace(/\s+/g, " ").trim();
    return head.length === markdown.length ? head : `${head}...`;
  }
  const start = Math.max(0, at - contextChars);
  const end = Math.min(markdown.length, at + needleLower.length + contextChars);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < markdown.length ? "..." : "";
  const body = markdown.slice(start, end).replace(/\s+/g, " ").trim();
  return `${prefix}${body}${suffix}`;
}

/**
 * Pure helper: rechnet ein Recency-Gewicht zwischen 0.5 und 1.0 aus.
 * Snapshots aelter als 365 Tage erhalten 0.5, Snapshots juenger als 7 Tage 1.0.
 * Linearer Falloff dazwischen.
 */
export function computeRecencyWeight(createdAtIso: string, now: Date): number {
  const created = Date.parse(createdAtIso);
  if (!Number.isFinite(created)) return 0.5;
  const ageMs = now.getTime() - created;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return 1.0;
  if (ageDays >= 365) return 0.5;
  // Linearer Falloff von 1.0 (Tag 7) auf 0.5 (Tag 365)
  const t = (ageDays - 7) / (365 - 7);
  return 1.0 - 0.5 * t;
}
