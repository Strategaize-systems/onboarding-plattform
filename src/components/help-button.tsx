// SLC-055 — Self-contained Help-Button (DEC-064 Konsolidierung).
//
// Floating Bottom-Right-Button, der das Learning-Center-Panel oeffnet — mit
// Default-Tab "Diese Seite" und automatisch ermitteltem pageKey aus dem
// aktuellen Pfad (per pageKeyFromPathname). Vorher (V4.2) ein duemmes
// onClick-Wrapper-Component; jetzt full owner von LC-State + pageKey.

"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { LearningCenterPanel } from "@/components/learning-center/learning-center-panel";
import { pageKeyFromPathname } from "@/components/learning-center/page-key-from-pathname";

interface HelpButtonProps {
  /**
   * Optional: Force-set pageKey, ueberschreibt die usePathname-Ableitung.
   * Vor allem fuer Tests oder Spezial-Pfade.
   */
  pageKey?: ReturnType<typeof pageKeyFromPathname>;
  /**
   * Optional: Mirror-Mode (vereinfachte Inhalte, keine Tabs).
   */
  isMirror?: boolean;
}

export function HelpButton({ pageKey, isMirror }: HelpButtonProps = {}) {
  const t = useTranslations("learning");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const resolvedPageKey = pageKey ?? pageKeyFromPathname(pathname ?? "");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-brand-primary-dark to-brand-primary text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.4)] transition-all duration-200 hover:shadow-[0_12px_24px_-4px_rgba(68,84,184,0.5)] hover:-translate-y-0.5 md:h-14 md:w-14"
        title={t("helpButton")}
        aria-label={t("helpButton")}
        data-help-trigger="floating"
      >
        <HelpCircle className="h-5 w-5 md:h-6 md:w-6" />
      </button>
      <LearningCenterPanel
        open={open}
        onOpenChange={setOpen}
        currentPageKey={resolvedPageKey}
        isMirror={isMirror}
      />
    </>
  );
}
