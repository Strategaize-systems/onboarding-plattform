// SLC-055 — Header-Help-Trigger (`?`-Icon).
//
// Vor V4.3: oeffnete eigenes shadcn `Sheet` (HelpSheet) mit page-Markdown.
// Ab V4.3 (DEC-064 Variante 3): oeffnet das Learning-Center-Panel mit
// initialTab="this-page" + pageKey, damit nur ein einheitliches Help-UI
// sichtbar ist. Der bestehende `markdown`-Prop ist nicht mehr noetig
// (LC laedt selbst via /api/help/<pageKey>) — er wird akzeptiert und
// ignoriert, damit bestehende Aufrufer waehrend SLC-055 nicht mit
// Type-Fehlern brechen. Ein Folge-Cleanup kann den Prop entfernen.

"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LearningCenterPanel } from "@/components/learning-center/learning-center-panel";
import type { HelpPageKey } from "@/lib/help/load";

interface HelpTriggerProps {
  pageKey: HelpPageKey;
  /** Deprecated ab SLC-055 — nicht mehr benoetigt, LC laedt selbst. */
  markdown?: string;
}

export function HelpTrigger({ pageKey }: HelpTriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Hilfe oeffnen"
        data-help-trigger={pageKey}
      >
        <HelpCircle className="h-5 w-5" />
      </Button>
      <LearningCenterPanel
        open={open}
        onOpenChange={setOpen}
        currentPageKey={pageKey}
        initialTab="this-page"
      />
    </>
  );
}
