// SLC-050 — Help-Trigger-Button (?-Icon) im Page-Header.
//
// Lokaler open-State, oeffnet HelpSheet. Server-Component-Parent uebergibt das
// bereits geladene Markdown als Prop, damit der Sheet-Inhalt SSR-bereit ist
// (kein Network-Roundtrip, AC-8).

"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpSheet } from "./HelpSheet";
import type { HelpPageKey } from "@/lib/help/load";

interface HelpTriggerProps {
  pageKey: HelpPageKey;
  markdown: string;
}

export function HelpTrigger({ pageKey, markdown }: HelpTriggerProps) {
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
      <HelpSheet open={open} onOpenChange={setOpen} markdown={markdown} />
    </>
  );
}
