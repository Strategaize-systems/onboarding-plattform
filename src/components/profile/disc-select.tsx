"use client";

import { useTranslations } from "next-intl";

const DISC_TYPES = [
  { value: "dominant", labelKey: "discDominant", descKey: "discDominantDesc", color: "bg-red-500" },
  { value: "influential", labelKey: "discInfluential", descKey: "discInfluentialDesc", color: "bg-yellow-500" },
  { value: "steady", labelKey: "discSteady", descKey: "discSteadyDesc", color: "bg-green-500" },
  { value: "conscientious", labelKey: "discConscientious", descKey: "discConscientiousDesc", color: "bg-blue-500" },
] as const;

interface DiscSelectProps {
  value: string | null;
  onChange: (value: string) => void;
}

export function DiscSelect({ value, onChange }: DiscSelectProps) {
  const t = useTranslations("profile");

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {DISC_TYPES.map((disc) => (
        <button
          key={disc.value}
          type="button"
          onClick={() => onChange(disc.value)}
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
            value === disc.value
              ? "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary"
              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${disc.color}`} />
          <div>
            <div className="text-sm font-semibold text-slate-900">{t(disc.labelKey)}</div>
            <div className="text-xs text-slate-500 mt-0.5">{t(disc.descKey)}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
