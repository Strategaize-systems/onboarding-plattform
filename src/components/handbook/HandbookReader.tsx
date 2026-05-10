"use client";

// SLC-044 MT-3 + MT-5 — Markdown-Render und Cross-Link "Im Debrief bearbeiten".
// SLC-045 MT-1 — Volltext-Such-Highlight via custom rehype-Plugin (text-only,
// skip code/pre, Match-IDs `match-{sectionKey}-{index}` synchron zur Treffer-Liste).
// SLC-045 MT-3 — Heading-Anchor-Hover-Indicator via append-Verhalten von
// rehype-autolink-headings + CSS in app/globals.css. Print-CSS via print:-Modifier.
//
// Pro Section eine <article> mit react-markdown + remark-gfm + rehype-raw +
// rehype-slug + rehype-autolink-headings + ggf. highlight-Plugin. Section-Header
// bekommt eine DOM-ID fuer Anchor-Scroll aus der Sidebar. Cross-Link "Im Debrief
// bearbeiten" wird nur fuer strategaize_admin gerendert (server-seitig per Prop
// entschieden — fuer tenant_admin ist der Link nicht im DOM).
//
// rehype-raw: Worker-Markdown enthaelt Inline-HTML wie <a id="block-A"></a>
// als Anchor-Targets (siehe sections.ts:263). Ohne rehype-raw rendert
// react-markdown das als Text. Reihenfolge: remarkGfm → rehypeRaw →
// rehypeSlug → rehypeAutolinkHeadings → highlight (zuletzt, weil es Text-Nodes
// splittet und die anderen Plugins bereits durch sind).
//
// Block-Key-Mapping kommt aus loadSnapshotContent (templates.handbook_schema).
// Sections ohne eindeutigen Block-Key zeigen keinen Cross-Link.

import Link from "next/link";
import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { Pencil } from "lucide-react";

import type { SectionFile } from "@/lib/handbook/load-snapshot-content";
import { highlightRehypePlugin } from "@/lib/handbook/highlight-rehype-plugin";
import { CopyPermalinkButton } from "./copy-permalink-button";

interface HandbookReaderProps {
  sections: SectionFile[];
  indexMarkdown: string | null;
  isStrategaizeAdmin: boolean;
  captureSessionId: string;
  sectionDomIdFn: (sectionKey: string) => string;
  searchQuery: string;
}

// Premium-Look Tailwind-prose-Modifiers — Brand-Hierarchie + bessere Lesbarkeit.
// `handbook-prose` triggert die globalen Anchor-/Search-Styles in app/globals.css.
// SLC-051 MT-6: prose-h1 schrumpft auf Mobile (375px) auf text-2xl + text-balance,
// damit der Hero-h1-Titel im INDEX max. 2 Zeilen bricht statt 4.
const PROSE_CLASSES = [
  "prose prose-slate max-w-none handbook-prose",
  // Heading-Hierarchie
  "prose-headings:scroll-mt-24 prose-headings:tracking-tight prose-headings:text-slate-900",
  "prose-h1:text-2xl sm:prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-4 prose-h1:mt-0 prose-h1:[text-wrap:balance] prose-h1:[word-break:break-word]",
  "prose-h2:text-xl prose-h2:font-bold prose-h2:mt-12 prose-h2:mb-5 prose-h2:pb-2 prose-h2:border-b prose-h2:border-slate-200",
  "prose-h3:text-base prose-h3:font-semibold prose-h3:uppercase prose-h3:tracking-wider prose-h3:text-brand-primary-dark prose-h3:mt-8 prose-h3:mb-3",
  "prose-h4:text-base prose-h4:font-semibold prose-h4:text-slate-800 prose-h4:mt-6 prose-h4:mb-2",
  // Body-Typografie
  "prose-p:leading-relaxed prose-p:text-slate-700",
  "prose-strong:text-slate-900 prose-strong:font-semibold",
  "prose-em:text-slate-500 prose-em:font-normal",
  // Lists — jede Wissens-Einheit / SOP-Schritt mit visueller Trennlinie + grossem
  // Atemspielraum, damit Multi-Zeilen-Items lesbar getrennt sind.
  "prose-ul:my-6 prose-ul:space-y-0 prose-ol:my-6 prose-ol:space-y-0",
  "prose-li:py-5 prose-li:border-b prose-li:border-slate-100 prose-li:last:border-b-0 prose-li:leading-relaxed prose-li:marker:text-brand-primary prose-li:marker:font-bold",
  "prose-li:[&>p]:my-2",
  // Inline + Code + Tables
  "prose-a:text-brand-primary-dark prose-a:no-underline hover:prose-a:underline prose-a:font-medium",
  "prose-table:text-sm prose-th:bg-slate-50 prose-th:font-semibold prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-table:border prose-table:border-slate-200",
  "prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:font-medium prose-code:text-slate-800 prose-code:before:content-none prose-code:after:content-none",
  "prose-blockquote:border-brand-primary prose-blockquote:bg-brand-primary/[0.04] prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:not-italic",
].join(" ");

const SECTION_BADGE_COLORS = [
  "from-indigo-500 to-blue-600",
  "from-blue-500 to-cyan-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-red-600",
  "from-purple-500 to-fuchsia-600",
  "from-sky-500 to-indigo-600",
  "from-teal-500 to-emerald-600",
];

const INDEX_SECTION_KEY = "__index";

// SLC-045 iter-2 — TOC-Markdown-Links umlenken auf In-App-Anchor-Navigation.
// Worker schreibt im INDEX.md Datei-Links wie `[Section-Titel](01_section_key.md)`,
// damit das ZIP lokal navigierbar ist. Im Reader fuehrt das aber zu 404, weil die
// `.md`-URL relativ zur Reader-Page aufgeloest wird. Wir matchen das Filename-Pattern
// (gleiches wie in load-snapshot-content.ts) und ersetzen den Klick durch
// scrollIntoView auf der entsprechenden DOM-ID `handbook-section-{key}`.
const SECTION_LINK_RE = /^(?:.*\/)?(\d{2})_([a-z0-9_-]+)\.md(?:#.*)?$/i;
const INDEX_LINK_RE = /^(?:.*\/)?INDEX\.md(?:#.*)?$/i;

function CustomLink(
  props: ComponentPropsWithoutRef<"a"> & {
    sectionDomIdFn: (sectionKey: string) => string;
  },
) {
  const { href, children, sectionDomIdFn, ...rest } = props;

  if (typeof href === "string") {
    const sectionMatch = SECTION_LINK_RE.exec(href);
    if (sectionMatch) {
      const sectionKey = sectionMatch[2];
      const targetId = sectionDomIdFn(sectionKey);
      return (
        <a
          {...rest}
          href={`#${targetId}`}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault();
            const el = document.getElementById(targetId);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              if (typeof window !== "undefined") {
                window.history.replaceState(null, "", `#${targetId}`);
              }
            }
          }}
        >
          {children}
        </a>
      );
    }
    if (INDEX_LINK_RE.test(href)) {
      const targetId = sectionDomIdFn("__index");
      return (
        <a
          {...rest}
          href={`#${targetId}`}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault();
            const el = document.getElementById(targetId);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              if (typeof window !== "undefined") {
                window.history.replaceState(null, "", `#${targetId}`);
              }
            }
          }}
        >
          {children}
        </a>
      );
    }
  }

  return <a {...rest} href={href}>{children}</a>;
}

// rehype-autolink-headings: append-Verhalten haengt einen klickbaren <a>-Link
// (Klasse `heading-anchor`) an jedes Heading. Sichtbar nur bei Hover via
// globals.css. Klick kopiert den Anchor-Hash in die URL.
// SLC-051 MT-6: explicit `test` auf h1..h3 sodass das Verhalten dokumentiert ist
// (default waere h1..h6, aber wir wollen die Auswahl bewusst eng halten).
const AUTOLINK_OPTIONS = {
  behavior: "append" as const,
  test: ["h1" as const, "h2" as const, "h3" as const],
  properties: {
    className: ["heading-anchor"],
    "aria-label": "Direkt-Link zu diesem Heading",
  },
  content: {
    type: "element" as const,
    tagName: "span",
    properties: { className: ["heading-anchor-icon"], "aria-hidden": "true" },
    children: [{ type: "text" as const, value: "#" }],
  },
};

// SLC-051 MT-4 — h2/h3-Override mit zusaetzlichem CopyPermalinkButton neben
// dem Auto-Anchor. Der Button erscheint im DOM nach dem Heading-Text und nach
// dem rehype-Anchor (rehype haengt seinen <a> als letztes children-Element an).
// Visibility-Logik (opacity 0 → 100 bei Heading-Hover) liegt in globals.css.
function H2WithPermalink({
  id,
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"h2">) {
  return (
    <h2 {...rest} id={id} className={className}>
      {children}
      {typeof id === "string" && id.length > 0 ? (
        <CopyPermalinkButton headingId={id} />
      ) : null}
    </h2>
  );
}

function H3WithPermalink({
  id,
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"h3">) {
  return (
    <h3 {...rest} id={id} className={className}>
      {children}
      {typeof id === "string" && id.length > 0 ? (
        <CopyPermalinkButton headingId={id} />
      ) : null}
    </h3>
  );
}

// SLC-092 MT-1 — Walkthrough-Video-Embed (DEC-095, DEC-096).
// Worker emittiert `<video src="/api/walkthrough/{id}/embed" controls
// preload="metadata" style="...">` im Markdown (sections.ts:234). rehype-raw
// laesst den Tag durch, wir reichern hier nur Tailwind-Klassen an, damit das
// Styling im Reader unter Brand-Hierarchie laeuft (Tailwind uebersteuert die
// inline style-Defaults aus dem Worker — z.B. unsere `bg-black` ueberlagert
// `background:#000`, identisch). `controls` und `preload` werden defensiv
// hier wieder gesetzt, weil die Worker-Default-Attribute boolesche/string
// HTML-Attribute sind, die ueber {...props} transparent durchlaufen.
function VideoEmbed(props: ComponentPropsWithoutRef<"video">) {
  return (
    <video
      {...props}
      controls
      preload="metadata"
      className="my-6 block w-full max-w-full rounded-lg bg-black shadow-md"
    />
  );
}

export function HandbookReader({
  sections,
  indexMarkdown,
  isStrategaizeAdmin,
  captureSessionId,
  sectionDomIdFn,
  searchQuery,
}: HandbookReaderProps) {
  const trimmedQuery = searchQuery.trim();

  return (
    <div className="space-y-12">
      {indexMarkdown && (
        <article
          id={sectionDomIdFn(INDEX_SECTION_KEY)}
          className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm"
        >
          <div className={PROSE_CLASSES}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[
                rehypeRaw,
                rehypeSlug,
                [rehypeAutolinkHeadings, AUTOLINK_OPTIONS],
                highlightRehypePlugin({
                  query: trimmedQuery,
                  sectionId: INDEX_SECTION_KEY,
                  counter: { value: 0 },
                }),
              ]}
              components={{
                a: (props) => (
                  <CustomLink {...props} sectionDomIdFn={sectionDomIdFn} />
                ),
                h2: H2WithPermalink,
                h3: H3WithPermalink,
                video: VideoEmbed,
              }}
            >
              {indexMarkdown}
            </ReactMarkdown>
          </div>
        </article>
      )}

      {sections.map((section, idx) => {
        const debriefHref =
          isStrategaizeAdmin && section.blockKey
            ? `/admin/debrief/${captureSessionId}/${section.blockKey}`
            : null;
        const gradient =
          SECTION_BADGE_COLORS[idx % SECTION_BADGE_COLORS.length];

        return (
          <article
            key={section.filename}
            id={sectionDomIdFn(section.sectionKey)}
            className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            data-section-key={section.sectionKey}
            data-block-key={section.blockKey ?? ""}
          >
            <div
              className={`bg-gradient-to-r ${gradient} px-8 py-5 text-white print:bg-none print:bg-white print:text-slate-900 print:border-b print:border-slate-300`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/70 print:text-slate-500">
                    Sektion {String(section.order).padStart(2, "0")}
                  </div>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-white print:text-slate-900">
                    {section.title}
                  </h2>
                </div>
                {debriefHref && (
                  <Link
                    href={debriefHref}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-white/25 print:hidden"
                    data-testid="reader-cross-link"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Im Debrief bearbeiten
                  </Link>
                )}
              </div>
            </div>

            <div className="px-8 py-10">
              <div className={PROSE_CLASSES}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[
                    rehypeRaw,
                    rehypeSlug,
                    [rehypeAutolinkHeadings, AUTOLINK_OPTIONS],
                    highlightRehypePlugin({
                      query: trimmedQuery,
                      sectionId: section.sectionKey,
                      counter: { value: 0 },
                    }),
                  ]}
                  components={{
                    a: (props) => (
                      <CustomLink {...props} sectionDomIdFn={sectionDomIdFn} />
                    ),
                    h2: H2WithPermalink,
                    h3: H3WithPermalink,
                    video: VideoEmbed,
                  }}
                >
                  {stripLeadingH1(section.markdown)}
                </ReactMarkdown>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// Worker schreibt am Anfang jeder Section "# {Section-Title}" — wir rendern den
// Titel jetzt visuell als Hero-Header im farbigen Gradient. Den Markdown-h1
// daher entfernen, damit der Titel nicht doppelt erscheint.
function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^#\s+[^\n]*\n+/, "");
}
