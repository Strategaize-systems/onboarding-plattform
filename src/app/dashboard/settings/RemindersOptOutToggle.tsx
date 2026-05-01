"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { toggleRemindersOptOut } from "./actions";

interface Props {
  initialOptOut: boolean;
}

export function RemindersOptOutToggle({ initialOptOut }: Props) {
  // optimistic local state — wird auf Fehler zurueckgerollt
  const [optOut, setOptOut] = useState(initialOptOut);
  const [pending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    const previous = optOut;
    setOptOut(next);
    startTransition(async () => {
      const result = await toggleRemindersOptOut(next);
      if (!result.ok) {
        setOptOut(previous);
        toast.error(
          result.error === "unauthenticated"
            ? "Nicht angemeldet. Bitte erneut einloggen."
            : "Speichern fehlgeschlagen. Bitte spaeter erneut versuchen."
        );
        return;
      }
      toast.success("Reminder-Praeferenz gespeichert.");
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-slate-900">
          Reminder-E-Mails pausieren
        </div>
        <p className="text-sm text-slate-500">
          Wenn aktiv, bekommst du keine automatischen Erinnerungen an offene
          Capture-Aufgaben.
        </p>
      </div>
      <Switch
        checked={optOut}
        onCheckedChange={handleChange}
        disabled={pending}
        aria-label="Reminder-E-Mails pausieren"
      />
    </div>
  );
}
