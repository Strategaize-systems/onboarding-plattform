"use client";

// V6 SLC-106 MT-7 — Trigger-Card fuer "Ich will mehr von Strategaize" (FEAT-046).
// Sub-Karte mit Sparkles-Icon + Button. Klick oeffnet IchWillMehrModal.
// Sichtbar nur, wenn eine finalized capture_session existiert und noch
// kein lead_push_consent gespeichert ist (Filterung in dashboard/page.tsx).
// MT-8 ersetzt diese Karte durch eine 3-State-Status-Card.

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IchWillMehrModal } from "./IchWillMehrModal";
import { EditableText } from "@/components/text-override/EditableText";

// V7.5: Visual-Layout an EmptyState (Diagnose-Card) angeglichen — Icon-Badge h-12
// links, Title/Description/Button im rechten flex-1-Block. Damit start-x des
// Buttons identisch zum "Diagnose starten"-Button der Schwester-Karte.

interface IchWillMehrCardProps {
  captureSessionId: string;
}

export function IchWillMehrCard({ captureSessionId }: IchWillMehrCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        data-testid="ich-will-mehr-card"
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary/10">
            <Sparkles className="h-6 w-6 text-brand-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 space-y-2">
            <h3 className="text-lg font-semibold text-slate-900">
              <EditableText
                keyPath="diagnose.ich_will_mehr.card.title"
                defaultText="Ich will mehr von Strategaize"
              />
            </h3>
            <p className="text-sm text-slate-600">
              <EditableText
                keyPath="diagnose.ich_will_mehr.card.description"
                defaultText="Sie haben Ihre Diagnose abgeschlossen. Wenn Sie moechten, meldet sich Strategaize bei Ihnen, um die naechsten Schritte direkt zu besprechen."
                multiline
              />
            </p>
            <div className="pt-2">
              <Button
                type="button"
                size="lg"
                onClick={() => setOpen(true)}
                data-testid="ich-will-mehr-trigger"
              >
                <EditableText
                  keyPath="diagnose.ich_will_mehr.card.button"
                  defaultText="Kontakt zu Strategaize anfragen"
                />
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <IchWillMehrModal
        captureSessionId={captureSessionId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
