// V7.3 SLC-140 MT-4 — Bericht Block-Section-Card mit Block-Akzent-Farbe.
//
// Erbe von src/components/diagnose/BlockSection.tsx (V6.3 SLC-105 MT-8).
// Neuerungen ggu. dem Vorgaenger:
//   - Top-Strip in Block-Akzent-Farbe (via getBlockColor(blockIndex)).
//   - Akzent-Badge mit Block-Index ("Baustein N").
//   - Score-Mini-Bar nutzt Block-Akzent-Farbe (statt score-range red/amber/emerald
//     — das macht ScoreVisual; die Cards sind block-color-identifier).
//   - KI-Kommentar gerendert als Markdown (react-markdown + remark-gfm), nicht raw.
//
// Block-Color != Score-Color: ScoreVisual.tsx liefert score-range-basierte
// semantische Farben. Diese Card identifiziert Bloecke ueber Block-Index-Color
// in der Reihenfolge der Template-Bloecke.
//
// Per [[feedback-look-alignment-needs-page-level-scope]] Page 3 Checks 3+5.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EditableText } from "@/components/text-override/EditableText";
import { getBlockColor } from "@/lib/diagnose/block-colors";

interface BlockSectionCardProps {
  blockKey: string;
  blockIndex: number;
  title: string;
  intro: string;
  score: number;
  comment: string;
}

export function BlockSectionCard({
  blockKey,
  blockIndex,
  title,
  intro,
  score,
  comment,
}: BlockSectionCardProps) {
  const color = getBlockColor(blockIndex);
  return (
    <section
      className={`overflow-hidden rounded-lg border ${color.border} bg-white shadow-sm print:break-inside-avoid print:shadow-none`}
    >
      <div className={`h-2 w-full ${color.accent}`} aria-hidden="true" />
      <div className="p-5">
        <header className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color.accent} ${color.textOnAccent}`}
              >
                <EditableText
                  keyPath="diagnose.bericht.block_badge_prefix"
                  defaultText="Baustein"
                />{" "}
                {blockIndex + 1}
              </span>
              <h2 className="text-lg font-semibold text-slate-900">
                <EditableText
                  keyPath={`template.partner_diagnostic.block.${blockKey}.title`}
                  defaultText={title}
                />
              </h2>
            </div>
            <span className="tabular-nums text-base font-semibold text-slate-700">
              {score}/100
            </span>
          </div>
          <p className="text-sm text-slate-500">
            <EditableText
              keyPath={`template.partner_diagnostic.block.${blockKey}.intro`}
              defaultText={intro}
              multiline
            />
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full ${color.accent} transition-all`}
              style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
              aria-hidden="true"
            />
          </div>
        </header>
        <div className="prose prose-sm prose-slate mt-4 max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0 prose-p:text-slate-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment}</ReactMarkdown>
        </div>
      </div>
    </section>
  );
}
