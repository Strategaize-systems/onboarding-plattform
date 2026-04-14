"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface SoftLimitBannerProps {
  onEvaluate: () => void;
}

export function SoftLimitBanner({ onEvaluate }: SoftLimitBannerProps) {
  const t = useTranslations("freeform.softLimit");

  return (
    <div className="mx-4 mb-3 flex items-center gap-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-3.5 shadow-sm">
      <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-amber-800">{t("title")}</p>
        <p className="text-xs text-amber-600 mt-0.5">{t("description")}</p>
      </div>
      <Button
        onClick={onEvaluate}
        size="sm"
        className="flex-shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold shadow-md hover:shadow-lg hover:scale-[1.02] transition-all"
      >
        {t("evaluateNow")}
      </Button>
    </div>
  );
}
