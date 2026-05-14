"use client";

// V6 SLC-106 MT-7 — Trigger-Card fuer "Ich will mehr von Strategaize" (FEAT-046).
// Sub-Karte mit Sparkles-Icon + Button. Klick oeffnet IchWillMehrModal.
// Sichtbar nur, wenn eine finalized capture_session existiert und noch
// kein lead_push_consent gespeichert ist (Filterung in dashboard/page.tsx).
// MT-8 ersetzt diese Karte durch eine 3-State-Status-Card.

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IchWillMehrModal } from "./IchWillMehrModal";

interface IchWillMehrCardProps {
  captureSessionId: string;
}

export function IchWillMehrCard({ captureSessionId }: IchWillMehrCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card data-testid="ich-will-mehr-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-brand-primary/10 p-3">
              <Sparkles className="h-5 w-5 text-brand-primary" />
            </div>
            <div>
              <CardTitle>Ich will mehr von Strategaize</CardTitle>
              <CardDescription>
                Sie haben Ihre Diagnose abgeschlossen. Wenn Sie moechten, meldet
                sich Strategaize bei Ihnen, um die naechsten Schritte direkt zu
                besprechen.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            onClick={() => setOpen(true)}
            data-testid="ich-will-mehr-trigger"
          >
            Kontakt zu Strategaize anfragen
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <IchWillMehrModal
        captureSessionId={captureSessionId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
