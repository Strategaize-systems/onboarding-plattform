// SLC-050 — In-App-Hilfe Right-Side-Sheet.
//
// Rendert page-spezifische Help-Markdown via react-markdown + remark-gfm
// (Wiederverwendung aus FEAT-028 Reader, DEC-049). Kontrolliert via
// open/onOpenChange — der Markdown-Inhalt wird vom Server-Component-Parent
// geladen (loadHelpMarkdown) und als Prop reingereicht.

"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface HelpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markdown: string;
}

export function HelpSheet({ open, onOpenChange, markdown }: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[90vw] overflow-y-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>Hilfe</SheetTitle>
        </SheetHeader>
        <div className="prose prose-sm mt-4 max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
      </SheetContent>
    </Sheet>
  );
}
