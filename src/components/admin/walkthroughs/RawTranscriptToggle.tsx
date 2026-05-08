"use client";

// SLC-079 MT-2 — Roh-Transkript-Toggle (DEC-088 Audit-Pattern).
// Toggle-Aktivierung sendet 1 error_log-Eintrag via logRawTranscriptView Server Action.
// Toggle-Status persistiert nicht ueber Page-Reload (bewusst — neuer Reload = neuer Audit).

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logRawTranscriptView } from "@/app/actions/walkthrough-methodology";

interface Props {
  walkthroughSessionId: string;
  originalTranscript: string;
}

const ERROR_LABEL: Record<string, string> = {
  unauthenticated: "Nicht angemeldet.",
  forbidden: "Keine Berechtigung.",
  forbidden_tenant: "Kein Zugriff auf diesen Tenant.",
  session_not_found: "Walkthrough-Session nicht gefunden.",
  session_id_invalid: "Ungueltige Session-ID.",
};

export function RawTranscriptToggle({
  walkthroughSessionId,
  originalTranscript,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [logged, setLogged] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    if (visible) {
      // Toggle off — kein Log
      setVisible(false);
      return;
    }

    // Toggle on — log audit BEFORE rendering (DEC-088: 1 Eintrag pro Aktivierung)
    if (logged) {
      // Bereits in dieser Page-Session geloggt — direkt anzeigen
      setVisible(true);
      return;
    }

    startTransition(async () => {
      const result = await logRawTranscriptView({ walkthroughSessionId });
      if (!result.ok) {
        toast.error(ERROR_LABEL[result.error] ?? "Audit-Log fehlgeschlagen.");
        return;
      }
      setLogged(true);
      setVisible(true);
    });
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-amber-900">
            Roh-Transkript (Audit-Toggle)
          </h3>
          <p className="mt-1 text-xs text-amber-800">
            Zeigt das Original-Transkript inklusive PII-Spuren. Jede Aktivierung
            wird als Audit-Eintrag protokolliert (DEC-088).
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          data-testid="raw-transcript-toggle"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : visible ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          {visible ? "Roh-Transkript ausblenden" : "Roh-Transkript einblenden"}
        </button>
      </div>
      {visible && (
        <pre
          className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-amber-200 bg-white p-3 text-xs leading-relaxed text-slate-800"
          data-testid="raw-transcript-content"
        >
          {originalTranscript}
        </pre>
      )}
    </div>
  );
}
