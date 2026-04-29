"use client";

// SLC-045 MT-1 — Treffer-Liste fuer die Volltext-Suche.
// Pro Section eine Gruppe mit Section-Titel + N Treffer-Eintraegen mit Snippet.
// Klick scrollt zur entsprechenden DOM-ID (siehe rehype-Plugin Match-IDs)
// und blinkt den Treffer kurz an.

import { ChevronRight } from "lucide-react";
import type { SectionSearchResult } from "@/lib/handbook/search";

interface SearchResultsListProps {
  query: string;
  results: SectionSearchResult[];
  sectionTitleMap: Map<string, string>;
  onJumpToMatch: (domId: string) => void;
}

export function SearchResultsList({
  query,
  results,
  sectionTitleMap,
  onJumpToMatch,
}: SearchResultsListProps) {
  if (!query || query.length < 3) return null;

  const totalMatches = results.reduce((sum, r) => sum + r.matchCount, 0);
  if (totalMatches === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        Keine Treffer fuer "{query}".
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"
      data-testid="reader-search-results"
    >
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Treffer-Liste
      </div>
      <ul className="divide-y divide-slate-100">
        {results
          .filter((r) => r.matchCount > 0)
          .map((result) => {
            const sectionTitle =
              sectionTitleMap.get(result.sectionKey) ?? result.sectionKey;
            return (
              <li key={result.sectionKey} className="px-4 py-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {sectionTitle}{" "}
                  <span className="font-normal text-slate-400">
                    · {result.matchCount}{" "}
                    {result.matchCount === 1 ? "Treffer" : "Treffer"}
                  </span>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {result.snippets.map((snippet) => (
                    <li key={snippet.domId}>
                      <button
                        type="button"
                        onClick={() => onJumpToMatch(snippet.domId)}
                        className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-brand-primary/5"
                        data-testid="reader-search-result-item"
                      >
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-300 group-hover:text-brand-primary" />
                        <span
                          className="leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: highlightInSnippet(snippet.snippet, query),
                          }}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightInSnippet(snippet: string, query: string): string {
  const escaped = escapeHtml(snippet);
  if (!query || query.length < 3) return escaped;
  const re = new RegExp(`(${escapeRegExp(escapeHtml(query))})`, "gi");
  return escaped.replace(
    re,
    '<mark class="rounded bg-yellow-200 px-0.5 py-px font-medium text-slate-900">$1</mark>',
  );
}
