"use client";

import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface HelpButtonProps {
  onClick: () => void;
}

export function HelpButton({ onClick }: HelpButtonProps) {
  const t = useTranslations("learning");

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-brand-primary-dark to-brand-primary text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.4)] transition-all duration-200 hover:shadow-[0_12px_24px_-4px_rgba(68,84,184,0.5)] hover:-translate-y-0.5 md:h-14 md:w-14"
      title={t("helpButton")}
      aria-label={t("helpButton")}
    >
      <HelpCircle className="h-5 w-5 md:h-6 md:w-6" />
    </button>
  );
}
