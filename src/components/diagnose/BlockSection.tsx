// V6.3 SLC-105 MT-8 — Block-Sektion fuer Diagnose-Bericht.
//
// Pro Block: Titel + Intro + Score-Bar + KI-Verdichtungs-Kommentar
// (`knowledge_unit.metadata.comment`, 2-3 Saetze prosaisch aus Bedrock-Run).

interface BlockSectionProps {
  blockKey: string;
  title: string;
  intro: string;
  score: number;
  comment: string;
}

function scoreColor(score: number): string {
  if (score <= 30) return "bg-red-500";
  if (score <= 55) return "bg-amber-500";
  return "bg-emerald-500";
}

export function BlockSection({
  title,
  intro,
  score,
  comment,
}: BlockSectionProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 print:break-inside-avoid">
      <header className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <span className="tabular-nums text-base font-semibold text-slate-700">
            {score}/100
          </span>
        </div>
        <p className="text-sm text-slate-500">{intro}</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full ${scoreColor(score)} transition-all`}
            style={{ width: `${score}%` }}
            aria-hidden="true"
          />
        </div>
      </header>
      <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-700">
        {comment}
      </div>
    </section>
  );
}
