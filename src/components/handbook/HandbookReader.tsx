"use client";

// SLC-044 MT-3 + MT-5 — Markdown-Render und Cross-Link "Im Debrief bearbeiten".
//
// Pro Section eine <article> mit react-markdown + remark-gfm + rehype-raw +
// rehype-slug + rehype-autolink-headings. Section-Header bekommt eine DOM-ID
// fuer Anchor-Scroll aus der Sidebar. Cross-Link "Im Debrief bearbeiten" wird
// nur fuer strategaize_admin gerendert (server-seitig per Prop entschieden —
// fuer tenant_admin ist der Link nicht im DOM).
//
// rehype-raw: Worker-Markdown enthaelt Inline-HTML wie <a id="block-A"></a>
// als Anchor-Targets (siehe sections.ts:263). Ohne rehype-raw rendert
// react-markdown das als Text. Reihenfolge: remarkGfm → rehypeRaw →
// rehypeSlug → rehypeAutolinkHeadings.
//
// Block-Key-Mapping kommt aus loadSnapshotContent (templates.handbook_schema).
// Sections ohne eindeutigen Block-Key zeigen keinen Cross-Link.

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { Pencil } from "lucide-react";

import type { SectionFile } from "@/lib/handbook/load-snapshot-content";

interface HandbookReaderProps {
  sections: SectionFile[];
  indexMarkdown: string | null;
  isStrategaizeAdmin: boolean;
  captureSessionId: string;
  sectionDomIdFn: (sectionKey: string) => string;
}

export function HandbookReader({
  sections,
  indexMarkdown,
  isStrategaizeAdmin,
  captureSessionId,
  sectionDomIdFn,
}: HandbookReaderProps) {
  return (
    <div className="space-y-10">
      {indexMarkdown && (
        <article
          id={sectionDomIdFn("__index")}
          className="scroll-mt-24 rounded-xl border border-slate-200 bg-white px-6 py-6 shadow-sm"
        >
          <div className="prose prose-slate max-w-none prose-headings:scroll-mt-24 prose-a:text-brand-primary-dark hover:prose-a:underline prose-table:text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeSlug, rehypeAutolinkHeadings]}
            >
              {indexMarkdown}
            </ReactMarkdown>
          </div>
        </article>
      )}

      {sections.map((section) => {
        const debriefHref =
          isStrategaizeAdmin && section.blockKey
            ? `/admin/debrief/${captureSessionId}/${section.blockKey}`
            : null;

        return (
          <article
            key={section.filename}
            id={sectionDomIdFn(section.sectionKey)}
            className="scroll-mt-24 rounded-xl border border-slate-200 bg-white px-6 py-6 shadow-sm"
            data-section-key={section.sectionKey}
            data-block-key={section.blockKey ?? ""}
          >
            {debriefHref && (
              <div className="mb-3 flex items-center justify-end">
                <Link
                  href={debriefHref}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  data-testid="reader-cross-link"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Im Debrief bearbeiten
                </Link>
              </div>
            )}

            <div className="prose prose-slate max-w-none prose-headings:scroll-mt-24 prose-a:text-brand-primary-dark hover:prose-a:underline prose-table:text-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSlug, rehypeAutolinkHeadings]}
              >
                {section.markdown}
              </ReactMarkdown>
            </div>
          </article>
        );
      })}
    </div>
  );
}
