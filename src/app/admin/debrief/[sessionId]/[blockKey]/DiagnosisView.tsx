"use client";

import type { DiagnosisContent } from "@/workers/diagnosis/types";

interface DiagnosisViewProps {
  content: DiagnosisContent;
}

const AMPEL_STYLES: Record<string, string> = {
  green:
    "bg-green-100 text-green-800 border-green-200",
  yellow:
    "bg-amber-100 text-amber-800 border-amber-200",
  red: "bg-red-100 text-red-800 border-red-200",
};

const AMPEL_LABELS: Record<string, string> = {
  green: "Grün",
  yellow: "Gelb",
  red: "Rot",
};

const RELEVANZ_STYLES: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

const RELEVANZ_LABELS: Record<string, string> = {
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
};

const AUFWAND_LABELS: Record<string, string> = {
  S: "Klein (S)",
  M: "Mittel (M)",
  L: "Groß (L)",
};

export function DiagnosisView({ content }: DiagnosisViewProps) {
  return (
    <div className="space-y-4">
      {content.subtopics.map((subtopic) => (
        <SubtopicCard key={subtopic.key} subtopic={subtopic} />
      ))}
    </div>
  );
}

function SubtopicCard({
  subtopic,
}: {
  subtopic: DiagnosisContent["subtopics"][number];
}) {
  const f = subtopic.fields;
  const ampel = String(f.ampel ?? "");
  const relevanz = String(f.relevanz_90d ?? "");
  const aufwand = String(f.aufwand ?? "");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      {/* Header: Name + Ampel + Scores */}
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-bold text-slate-900">{subtopic.name}</h4>
        <div className="flex shrink-0 items-center gap-2">
          {ampel && (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${
                AMPEL_STYLES[ampel] ?? "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {AMPEL_LABELS[ampel] ?? ampel}
            </span>
          )}
          {relevanz && (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                RELEVANZ_STYLES[relevanz] ?? "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              90d: {RELEVANZ_LABELS[relevanz] ?? relevanz}
            </span>
          )}
        </div>
      </div>

      {/* Numeric scores */}
      <div className="flex flex-wrap gap-3">
        <ScoreBadge label="Reifegrad" value={f.reifegrad} max={10} />
        <ScoreBadge label="Risiko" value={f.risiko} max={10} />
        <ScoreBadge label="Hebel" value={f.hebel} max={10} />
        {aufwand && (
          <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
            <span className="font-semibold">Aufwand:</span>{" "}
            {AUFWAND_LABELS[aufwand] ?? aufwand}
          </span>
        )}
      </div>

      {/* Ist-Situation */}
      {f.ist_situation && (
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ist-Situation
          </span>
          <p className="mt-0.5 text-sm text-slate-700">
            {String(f.ist_situation)}
          </p>
        </div>
      )}

      {/* Empfehlung */}
      {f.empfehlung && (
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Empfehlung
          </span>
          <p className="mt-0.5 text-sm text-slate-700">
            {String(f.empfehlung)}
          </p>
        </div>
      )}

      {/* Naechster Schritt */}
      {f.naechster_schritt && (
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Nächster Schritt
          </span>
          <p className="mt-0.5 text-sm text-slate-700">
            {String(f.naechster_schritt)}
          </p>
        </div>
      )}

      {/* Belege */}
      {f.belege && (
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Belege
          </span>
          <p className="mt-0.5 text-xs text-slate-500 italic">
            {String(f.belege)}
          </p>
        </div>
      )}

      {/* Zielbild */}
      {f.zielbild && (
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Zielbild
          </span>
          <p className="mt-0.5 text-sm text-slate-600">
            {String(f.zielbild)}
          </p>
        </div>
      )}

      {/* Abhaengigkeiten */}
      {f.abhaengigkeiten && (
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Abhängigkeiten
          </span>
          <p className="mt-0.5 text-xs text-slate-500">
            {String(f.abhaengigkeiten)}
          </p>
        </div>
      )}

      {/* Owner (leer by design) */}
      {f.owner && (
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Owner
          </span>
          <p className="mt-0.5 text-sm text-slate-700">{String(f.owner)}</p>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({
  label,
  value,
  max,
}: {
  label: string;
  value: string | number | null | undefined;
  max: number;
}) {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return null;

  // Color based on value (for Reifegrad: higher=better, for Risiko: lower=better)
  const ratio = num / max;
  let colorClass = "text-slate-700 bg-slate-50 border-slate-200";
  if (label === "Risiko") {
    if (ratio >= 0.7) colorClass = "text-red-700 bg-red-50 border-red-200";
    else if (ratio >= 0.4)
      colorClass = "text-amber-700 bg-amber-50 border-amber-200";
    else colorClass = "text-green-700 bg-green-50 border-green-200";
  } else {
    if (ratio >= 0.7) colorClass = "text-green-700 bg-green-50 border-green-200";
    else if (ratio >= 0.4)
      colorClass = "text-amber-700 bg-amber-50 border-amber-200";
    else colorClass = "text-red-700 bg-red-50 border-red-200";
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${colorClass}`}
    >
      {label}: {num}/{max}
    </span>
  );
}
