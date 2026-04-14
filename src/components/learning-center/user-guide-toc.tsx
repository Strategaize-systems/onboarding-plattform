"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, List } from "lucide-react";

interface Heading {
  text: string;
  level: number;
  id: string;
}

interface UserGuideTOCProps {
  headings: Heading[];
}

export function UserGuideTOC({ headings }: UserGuideTOCProps) {
  const t = useTranslations("learning");
  const [expanded, setExpanded] = useState(false);

  const h2Headings = headings.filter((h) => h.level === 2);
  if (h2Headings.length === 0) return null;

  function scrollToHeading(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="rounded-lg border border-slate-200/60 bg-slate-50/50 mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
      >
        <List className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">{t("tocTitle")}</span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>

      {expanded && (
        <nav className="px-3 pb-3">
          <ul className="space-y-0.5">
            {headings.map((heading) => (
              <li key={heading.id}>
                <button
                  onClick={() => scrollToHeading(heading.id)}
                  className={`w-full text-left text-xs transition-colors hover:text-brand-primary ${
                    heading.level === 2
                      ? "font-medium text-slate-700 py-1"
                      : "text-slate-500 py-0.5 pl-3"
                  }`}
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
