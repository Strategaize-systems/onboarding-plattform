"use client";

import { useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Loader2 } from "lucide-react";
import { UserGuideTOC } from "@/components/learning-center/user-guide-toc";
import { UserGuideSearch } from "@/components/learning-center/user-guide-search";

/** Highlight search query in text children */
function highlightText(children: ReactNode, query: string): ReactNode {
  if (!query.trim()) return children;
  if (typeof children !== "string") return children;

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = children.split(regex);
  if (parts.length === 1) return children;

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200/70 text-slate-900 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function getGuidePath(locale: string): string {
  if (locale === "de") return "/docs/USER-GUIDE.md";
  return `/docs/USER-GUIDE-${locale}.md`;
}

/** Split markdown into sections by ## or ### headings */
function splitIntoSections(markdown: string): { heading: string; content: string; level: number }[] {
  const lines = markdown.split("\n");
  const sections: { heading: string; content: string; level: number }[] = [];
  let currentHeading = "";
  let currentLevel = 0;
  let currentContent: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    const h3Match = line.match(/^### (.+)$/);

    if (h2Match || h3Match) {
      if (currentHeading || currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join("\n"),
          level: currentLevel,
        });
      }
      currentHeading = h2Match ? h2Match[1] : h3Match![1];
      currentLevel = h2Match ? 2 : 3;
      currentContent = [line];
    } else {
      currentContent.push(line);
    }
  }

  if (currentHeading || currentContent.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join("\n"),
      level: currentLevel,
    });
  }

  return sections;
}

/** Extract H2 and H3 headings for TOC */
function extractHeadings(markdown: string): { text: string; level: number; id: string }[] {
  const headings: { text: string; level: number; id: string }[] = [];
  const lines = markdown.split("\n");

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    const h3Match = line.match(/^### (.+)$/);

    if (h2Match) {
      headings.push({
        text: h2Match[1],
        level: 2,
        id: h2Match[1].toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-").replace(/^-|-$/g, ""),
      });
    } else if (h3Match) {
      headings.push({
        text: h3Match[1],
        level: 3,
        id: h3Match[1].toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-").replace(/^-|-$/g, ""),
      });
    }
  }

  return headings;
}

export function UserGuide() {
  const t = useTranslations("learning");
  const locale = useLocale();
  const [markdown, setMarkdown] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadGuide() {
      setLoading(true);
      setError(false);

      try {
        let res = await fetch(getGuidePath(locale));
        // Fallback to DE if locale version not found
        if (!res.ok && locale !== "de") {
          res = await fetch(getGuidePath("de"));
        }
        if (!res.ok) throw new Error("Not found");
        const text = await res.text();
        if (!cancelled) setMarkdown(text);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadGuide();
    return () => { cancelled = true; };
  }, [locale]);

  const headings = useMemo(() => extractHeadings(markdown), [markdown]);
  const sections = useMemo(() => splitIntoSections(markdown), [markdown]);

  const filteredMarkdown = useMemo(() => {
    if (!searchQuery.trim()) return markdown;
    const query = searchQuery.toLowerCase();
    const matched = sections.filter(
      (s) => s.heading.toLowerCase().includes(query) || s.content.toLowerCase().includes(query)
    );
    return matched.map((s) => s.content).join("\n\n");
  }, [markdown, sections, searchQuery]);

  const hl = useCallback(
    (children: ReactNode) => highlightText(children, searchQuery),
    [searchQuery]
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-brand-primary animate-spin mb-3" />
        <p className="text-sm text-slate-500">{t("placeholder")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BookOpen className="h-12 w-12 text-slate-300 mb-4" />
        <p className="text-sm text-slate-500">{t("guideNotReady")}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <UserGuideSearch
        query={searchQuery}
        onQueryChange={setSearchQuery}
        hasResults={filteredMarkdown.length > 0}
      />

      {/* TOC (only when not searching) */}
      {!searchQuery.trim() && headings.length > 0 && (
        <UserGuideTOC headings={headings} />
      )}

      {/* Rendered markdown */}
      <div className="prose-guide mt-4">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl font-bold text-slate-900 mb-4">{hl(children)}</h1>
            ),
            h2: ({ children }) => {
              const text = typeof children === "string" ? children : String(children);
              const id = text.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-").replace(/^-|-$/g, "");
              return (
                <h2 id={id} className="text-lg font-bold text-slate-900 mt-8 mb-3 scroll-mt-4">
                  {hl(children)}
                </h2>
              );
            },
            h3: ({ children }) => {
              const text = typeof children === "string" ? children : String(children);
              const id = text.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-").replace(/^-|-$/g, "");
              return (
                <h3 id={id} className="text-base font-semibold text-slate-800 mt-6 mb-2 scroll-mt-4">
                  {hl(children)}
                </h3>
              );
            },
            p: ({ children }) => (
              <p className="text-sm text-slate-600 leading-relaxed mb-3">{hl(children)}</p>
            ),
            ul: ({ children }) => (
              <ul className="text-sm text-slate-600 list-disc pl-5 mb-3 space-y-1">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="text-sm text-slate-600 list-decimal pl-5 mb-3 space-y-1">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed">{hl(children)}</li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-slate-900">{children}</strong>
            ),
            code: ({ children }) => (
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">
                {children}
              </code>
            ),
          }}
        >
          {filteredMarkdown}
        </ReactMarkdown>

        {searchQuery.trim() && filteredMarkdown.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-slate-500">
              {t("noResults", { query: searchQuery })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
