// SLC-120 MT-2 (FEAT-048) — Oeffentliche Datenschutzerklaerung-Page.
// Server-Component: liest `src/content/legal/datenschutz.de.md` zur Render-Zeit
// und rendert ueber react-markdown mit dem HandbookReader-Plugin-Subset
// (remark-gfm + rehype-slug + rehype-autolink-headings, DEC-117).
// Layout pre-auth, kein Locale-Prefix per DEC-119 — direkt unter src/app/.

import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

export const metadata: Metadata = {
  title: "Datenschutzerklaerung | StrategAIze Onboarding",
  description:
    "Datenschutzerklaerung der Strategaize Onboarding-Plattform — Verantwortlicher, Rechtsgrundlagen, Empfaenger, Speicherdauer und Betroffenenrechte nach DSGVO.",
};

const PROSE_CLASSES = [
  "prose prose-slate max-w-3xl mx-auto py-12 px-4",
  "prose-headings:scroll-mt-24",
  // Mobile-friendly h1: shrink auf 375px, word-break statt Overflow
  "prose-h1:text-2xl sm:prose-h1:text-3xl prose-h1:[text-wrap:balance] prose-h1:[word-break:break-word]",
].join(" ");

const AUTOLINK_OPTIONS = {
  behavior: "append" as const,
  test: ["h2" as const, "h3" as const],
  properties: {
    className: ["heading-anchor"],
    "aria-label": "Direkt-Link zu diesem Abschnitt",
  },
};

export default function DatenschutzPage() {
  const filePath = path.join(
    process.cwd(),
    "src",
    "content",
    "legal",
    "datenschutz.de.md",
  );
  const content = fs.readFileSync(filePath, "utf8");

  return (
    <main className={PROSE_CLASSES}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, AUTOLINK_OPTIONS]]}
      >
        {content}
      </ReactMarkdown>
    </main>
  );
}
