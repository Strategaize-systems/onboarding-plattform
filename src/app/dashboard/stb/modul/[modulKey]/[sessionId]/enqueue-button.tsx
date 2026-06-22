"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { enqueueModulOutput } from "../actions";

interface Props {
  sessionId: string;
  modulKey: string;
  stufe1Complete: boolean;
}

export function EnqueueModulOutputButton({
  sessionId,
  modulKey,
  stufe1Complete,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  function onClick() {
    setMessage(null);
    startTransition(async () => {
      const res = await enqueueModulOutput(sessionId, modulKey);
      if (res.ok) {
        setMessage({
          kind: "ok",
          text: res.deduplicated
            ? "Es läuft bereits ein Synthese-Job für dieses Modul."
            : "Modul-Output wird erzeugt. Der Job läuft im Hintergrund.",
        });
      } else {
        setMessage({ kind: "error", text: res.error });
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Modul-Output erzeugen
      </button>
      {!stufe1Complete && (
        <p className="text-xs text-amber-700">
          Hinweis: Stufe 1 (Kern) ist noch nicht vollständig eingereicht.
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
