"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { assessBlueprintKernAnswers } from "../actions";

// Port-Vorbild: src/app/dashboard/stb/modul/[modulKey]/[sessionId]/enqueue-button.tsx
// (SLC-173). Loest die Batch-Auswertung der Kern-Antworten aus und blendet nach
// Refresh die freigeschalteten Vertiefungsfragen ein (R-172-2: Reveal nach
// Submit, ohne die geteilte QuestionnaireWorkspace anzufassen).
interface Props {
  sessionId: string;
  disabled?: boolean;
}

export function BlueprintRevealButton({ sessionId, disabled }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  function onClick() {
    setMessage(null);
    startTransition(async () => {
      const res = await assessBlueprintKernAnswers(sessionId);
      if (res.ok) {
        setMessage({
          kind: "ok",
          text: `${res.assessed} Kern-Antwort${
            res.assessed === 1 ? "" : "en"
          } ausgewertet. Freigeschaltete Vertiefungsfragen erscheinen unten.`,
        });
        router.refresh();
      } else {
        setMessage({
          kind: "error",
          text: res.error ?? "Auswertung fehlgeschlagen",
        });
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending || disabled}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Kern auswerten · Vertiefung prüfen
      </button>
      {disabled && (
        <p className="text-xs text-amber-700">
          Hinweis: Beantworten Sie zuerst die Kern-Fragen, dann lässt sich die
          Vertiefung auswerten.
        </p>
      )}
      {message && (
        <p
          className={`text-sm ${
            message.kind === "ok" ? "text-green-700" : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
