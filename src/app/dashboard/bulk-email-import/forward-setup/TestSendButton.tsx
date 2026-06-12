"use client";

// V9.1 SLC-V9.1-D MT-4 — Test-Mail senden + Empfangs-Polling.
//
// Ruft sendTestEmail(endpointId) auf: versendet eine Test-Mail an die Catchall-
// Adresse und pollt anschliessend (poll-inbound, MT-6), ob sie ueber den
// IONOS-IMAP-Sync wieder eingetroffen ist. `received=true` bestaetigt die
// Ende-zu-Ende-Weiterleitung. Hinweis: ohne aktiven IMAP-Sync (OQ-R1-1) bleibt
// `received=false` — das ist kein Fehler der Weiterleitungsregel, sondern ein
// noch fehlender Server-seitiger Sync (Founder-Action).

import { useState, useTransition } from "react";
import { Loader2, Send, CheckCircle2, AlertCircle, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendTestEmail } from "./actions";

type TestState =
  | { kind: "idle" }
  | { kind: "received" }
  | { kind: "not_received" }
  | { kind: "error"; message: string };

interface TestSendButtonProps {
  endpointId: string;
  /** Wird nach einem bestaetigten Empfang aufgerufen (z.B. zum Freischalten des DSGVO-Schritts). */
  onReceived?: () => void;
}

export function TestSendButton({ endpointId, onReceived }: TestSendButtonProps) {
  const [state, setState] = useState<TestState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  function runTest() {
    setState({ kind: "idle" });
    startTransition(async () => {
      let result;
      try {
        result = await sendTestEmail(endpointId);
      } catch (err) {
        setState({ kind: "error", message: (err as Error).message });
        return;
      }
      if (!result.ok) {
        setState({ kind: "error", message: result.error });
        return;
      }
      if (result.received) {
        setState({ kind: "received" });
        onReceived?.();
      } else {
        setState({ kind: "not_received" });
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={runTest} disabled={isPending} variant="outline">
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Test laeuft &hellip;
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Test-Mail senden
          </>
        )}
      </Button>

      {state.kind === "received" && (
        <p className="flex items-center gap-1.5 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          Test-Mail empfangen — die Weiterleitung funktioniert.
        </p>
      )}
      {state.kind === "not_received" && (
        <p className="flex items-start gap-1.5 text-sm text-amber-700">
          <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" />
          Test-Mail versendet, aber noch nicht im Cockpit eingetroffen. Pruefe die
          Weiterleitungsregel — oder warte, falls der Posteingangs-Sync gerade erst
          eingerichtet wurde.
        </p>
      )}
      {state.kind === "error" && (
        <p className="flex items-start gap-1.5 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {state.message}
        </p>
      )}
    </div>
  );
}
