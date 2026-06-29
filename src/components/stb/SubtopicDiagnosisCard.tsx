// StB-Vertikale Kanzlei-Blueprint — Diagnose-Reader-Card pro A–G-Block (SLC-172 MT-3).
//
// Layout-Reuse: BlockSectionCard (src/app/dashboard/diagnose/.../bericht/components/
// BlockSectionCard.tsx) — Top-Strip in Block-Akzent-Farbe (getBlockColor) + Akzent-
// Badge. Inhalt aber Blueprint-spezifisch: pro Unterthema Ampel / Reifegrad (0–10) /
// Empfehlung statt Score+Markdown-Kommentar. Read-only (kein EditableText/Markdown
// -> renderToString-tauglich, kein TextOverrideProvider noetig).
//
// Datenquelle: block_diagnosis.content (DiagnosisContent, DEC-244). Ampel-Farben
// konsistent zu DiagnosisWorkspace (admin) green/amber/red.

import { getBlockColor } from "@/lib/diagnose/block-colors";
import { coerceAmpel } from "@/lib/stb-vertikale/blueprint-routing";
import type { Ampel } from "@/lib/stb-vertikale/blueprint";
import type { DiagnosisSubtopic } from "@/workers/diagnosis/types";

const AMPEL_STYLE: Record<Ampel, { label: string; badge: string; dot: string }> = {
  green: {
    label: "Grün",
    badge: "bg-green-100 text-green-800 border-green-300",
    dot: "bg-green-500",
  },
  yellow: {
    label: "Gelb",
    badge: "bg-amber-100 text-amber-800 border-amber-300",
    dot: "bg-amber-500",
  },
  red: {
    label: "Rot",
    badge: "bg-red-100 text-red-800 border-red-300",
    dot: "bg-red-500",
  },
};

function fieldText(
  fields: Record<string, string | number | null>,
  key: string
): string {
  const v = fields[key];
  return typeof v === "string" ? v.trim() : "";
}

function reifegrad(
  fields: Record<string, string | number | null>
): number | null {
  const v = fields.reifegrad;
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  return Math.max(0, Math.min(10, v));
}

function SubtopicRow({ subtopic }: { subtopic: DiagnosisSubtopic }) {
  const ampel = coerceAmpel(subtopic.fields?.ampel);
  const style = ampel ? AMPEL_STYLE[ampel] : null;
  const grad = reifegrad(subtopic.fields ?? {});
  const ist = fieldText(subtopic.fields ?? {}, "ist_situation");
  const empfehlung = fieldText(subtopic.fields ?? {}, "empfehlung");
  const naechster = fieldText(subtopic.fields ?? {}, "naechster_schritt");

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">{subtopic.name}</h4>
        {style ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${style.badge}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${style.dot}`}
              aria-hidden="true"
            />
            {style.label}
          </span>
        ) : (
          <span className="text-xs text-slate-400">nicht bewertet</span>
        )}
      </div>

      {grad !== null && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Reifegrad</span>
            <span className="tabular-nums font-medium text-slate-700">
              {grad}/10
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-500 transition-all"
              style={{ width: `${grad * 10}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      )}

      {ist && (
        <p className="mt-3 text-sm text-slate-600">{ist}</p>
      )}

      {empfehlung && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Empfehlung
          </p>
          <p className="mt-0.5 text-sm text-slate-700">{empfehlung}</p>
        </div>
      )}

      {naechster && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Nächster Schritt
          </p>
          <p className="mt-0.5 text-sm text-slate-700">{naechster}</p>
        </div>
      )}
    </div>
  );
}

export interface SubtopicDiagnosisCardProps {
  blockKey: string;
  blockIndex: number;
  blockTitle: string;
  subtopics: DiagnosisSubtopic[];
}

/** Eine Diagnose-Card fuer EINEN A–G-Block mit seinen Unterthema-Diagnosen. */
export function SubtopicDiagnosisCard({
  blockKey,
  blockIndex,
  blockTitle,
  subtopics,
}: SubtopicDiagnosisCardProps) {
  const color = getBlockColor(blockIndex);
  return (
    <section
      className={`overflow-hidden rounded-lg border ${color.border} bg-white shadow-sm print:break-inside-avoid print:shadow-none`}
    >
      <div className={`h-2 w-full ${color.accent}`} aria-hidden="true" />
      <div className="p-5">
        <header className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color.accent} ${color.textOnAccent}`}
          >
            Block {blockKey}
          </span>
          <h3 className="text-lg font-semibold text-slate-900">{blockTitle}</h3>
        </header>

        <div className="mt-4 space-y-3">
          {subtopics.length > 0 ? (
            subtopics.map((st) => <SubtopicRow key={st.key} subtopic={st} />)
          ) : (
            <p className="text-sm text-muted-foreground">
              Keine Unterthema-Diagnosen für diesen Block.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
