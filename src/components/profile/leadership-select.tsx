"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";

const STYLES = [
  { value: "patriarchal", labelKey: "leadershipPatriarchal", descKey: "leadershipPatriarchalDesc" },
  { value: "cooperative", labelKey: "leadershipCooperative", descKey: "leadershipCooperativeDesc" },
  { value: "delegative", labelKey: "leadershipDelegative", descKey: "leadershipDelegativeDesc" },
  { value: "coaching", labelKey: "leadershipCoaching", descKey: "leadershipCoachingDesc" },
  { value: "visionary", labelKey: "leadershipVisionary", descKey: "leadershipVisionaryDesc" },
] as const;

interface LeadershipSelectProps {
  value: string | null;
  onChange: (value: string) => void;
}

/**
 * Ranking-based leadership style selector.
 * User clicks styles in order of preference (1st = strongest match).
 * Value is stored as comma-separated ranking: "cooperative,delegative,visionary,coaching,patriarchal"
 */
export function LeadershipSelect({ value, onChange }: LeadershipSelectProps) {
  const t = useTranslations("profile");

  // Parse ranking from comma-separated string
  const ranking: string[] = value ? value.split(",").filter(Boolean) : [];

  function handleClick(styleValue: string) {
    if (ranking.includes(styleValue)) {
      // Already ranked — remove it and everything after it
      const idx = ranking.indexOf(styleValue);
      const newRanking = ranking.slice(0, idx);
      onChange(newRanking.join(","));
    } else {
      // Add to ranking
      const newRanking = [...ranking, styleValue];
      onChange(newRanking.join(","));
    }
  }

  function handleReset() {
    onChange("");
  }

  return (
    <div>
      {ranking.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-slate-500">
            {t("leadershipRankingHint")}
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-3 w-3" />
            {t("leadershipReset")}
          </button>
        </div>
      )}
      <div className="space-y-2">
        {STYLES.map((style) => {
          const rankIndex = ranking.indexOf(style.value);
          const isRanked = rankIndex !== -1;
          const rankNumber = rankIndex + 1;

          return (
            <button
              key={style.value}
              type="button"
              onClick={() => handleClick(style.value)}
              className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
                isRanked
                  ? "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                isRanked
                  ? "bg-brand-primary text-white"
                  : "border-2 border-slate-300 text-slate-400"
              }`}>
                {isRanked ? rankNumber : "–"}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">{t(style.labelKey)}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t(style.descKey)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
