"use client";

import { useTransition } from "react";
import { Loader2, BookOpen, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerHandbookSnapshot } from "./actions";

interface Props {
  captureSessionId: string;
  hasPreviousSnapshot: boolean;
  disabled?: boolean;
}

export function TriggerHandbookButton({
  captureSessionId,
  hasPreviousSnapshot,
  disabled,
}: Props) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await triggerHandbookSnapshot(captureSessionId);
      if (!result.ok) {
        toast.error(
          result.error === "capture_session_not_found"
            ? "Erhebung nicht gefunden."
            : result.error === "capture_session_id_invalid"
              ? "Ungueltige Erhebungs-ID."
              : "Handbuch-Generierung konnte nicht gestartet werden."
        );
        return;
      }
      toast.success("Handbuch wird im Hintergrund erzeugt. Status aktualisiert sich automatisch.");
    });
  }

  return (
    <Button onClick={handleClick} disabled={pending || disabled}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Wird gestartet…
        </>
      ) : hasPreviousSnapshot ? (
        <>
          <RotateCw className="h-4 w-4 mr-2" />
          Neu generieren
        </>
      ) : (
        <>
          <BookOpen className="h-4 w-4 mr-2" />
          Unternehmerhandbuch generieren
        </>
      )}
    </Button>
  );
}
