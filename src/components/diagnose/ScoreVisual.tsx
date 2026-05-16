// V6.3 SLC-105 MT-8 — Score-Visual fuer Diagnose-Bericht.
//
// 6 horizontale Tailwind-Bars (DEC-128). Begruendung:
//   - 0 neue npm-Dependencies (keine Chart.js/Recharts)
//   - Print-friendly (Radar-SVG zerlaeuft beim window.print())
//   - Accessibility: aria-valuenow lesbar fuer ScreenReader
//
// Farb-Schema (aus Style-Guide V2):
//   0-30  → red-500    (Strukturluecke)
//   31-55 → amber-500  (Teil-Reife)
//   56-100 → emerald-500 (Tragbar)

interface BlockScore {
  key: string;
  title: string;
  score: number;
}

interface ScoreVisualProps {
  blocks: BlockScore[];
}

function scoreColor(score: number): string {
  if (score <= 30) return "bg-red-500";
  if (score <= 55) return "bg-amber-500";
  return "bg-emerald-500";
}

function scoreLabel(score: number): string {
  if (score <= 30) return "Strukturluecke";
  if (score <= 55) return "Teil-Reife";
  return "Tragbar";
}

export function ScoreVisual({ blocks }: ScoreVisualProps) {
  const total = blocks.length;
  const avg = total > 0
    ? Math.round(blocks.reduce((a, b) => a + b.score, 0) / total)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-3xl font-bold text-slate-900">
          {avg}/100
        </span>
        <span className="text-sm text-slate-500">
          Durchschnitt ueber {total} Bausteine ({scoreLabel(avg)})
        </span>
      </div>

      <div className="space-y-3">
        {blocks.map((block) => (
          <div key={block.key} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-slate-700">{block.title}</span>
              <span className="tabular-nums text-slate-500">
                {block.score}/100
              </span>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={block.score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${block.title}: ${block.score} von 100`}
            >
              <div
                className={`h-full ${scoreColor(block.score)} transition-all`}
                style={{ width: `${block.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
