// V7.3 SLC-140 MT-3 — Antwort-Option als visuelle Card (statt Plain-Radio).
//
// Ersetzt das inline-label+radio-Pattern aus QuestionFlow.tsx. Stellt klare
// Selected/Hover/Focus-States bereit und erfuellt Touch-Target >=44px Mobile
// (Page-Level-Visual-Reference-Checklist Page 2 Check 9). Keine eigene
// State-Logik — Selektion + onChange werden vom Parent gesteuert.

interface AnswerOptionCardProps {
  name: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}

export function AnswerOptionCard({
  name,
  label,
  selected,
  onSelect,
}: AnswerOptionCardProps) {
  return (
    <label
      className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm transition-colors focus-within:ring-2 focus-within:ring-brand-primary focus-within:ring-offset-1 ${
        selected
          ? "border-brand-primary bg-brand-primary/5 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={label}
        checked={selected}
        onChange={onSelect}
        className="mt-0.5 h-4 w-4 accent-brand-primary"
      />
      <span
        className={`flex-1 leading-snug ${
          selected ? "font-medium text-slate-900" : "text-slate-700"
        }`}
      >
        {label}
      </span>
    </label>
  );
}
