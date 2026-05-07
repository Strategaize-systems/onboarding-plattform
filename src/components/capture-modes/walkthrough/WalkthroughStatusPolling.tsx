"use client";

import { useEffect, useState } from "react";

/**
 * SLC-071 MT-7 — Status-Polling-Client.
 *
 * Polls /api/walkthroughs/[id]/status every 5s while the session is in a
 * non-terminal status. Stops polling once 'pending_review', 'approved',
 * 'rejected' or 'failed' is reached — those states are decided by the
 * SLC-072 worker / SLC-073 review and won't change without user action.
 */

const POLL_INTERVAL_MS = 5_000;

const TERMINAL_STATES = new Set([
  "pending_review",
  "approved",
  "rejected",
  "failed",
]);

interface WalkthroughStatusRow {
  id: string;
  status: string;
  transcript_completed_at: string | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  rejection_reason: string | null;
  duration_sec: number | null;
}

interface Props {
  walkthroughId: string;
  initial: WalkthroughStatusRow;
}

const STATUS_LABELS: Record<string, string> = {
  recording: "Aufnahme laeuft",
  uploading: "Wird hochgeladen",
  uploaded: "Hochgeladen",
  transcribing: "Transkription laeuft",
  pending_review: "Warten auf Berater-Review",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
  failed: "Fehlgeschlagen",
};

const HINTS: Record<string, string> = {
  uploaded:
    "Die Aufnahme ist eingegangen. Die Transkription startet in Kuerze.",
  transcribing:
    "Wir wandeln dein Walkthrough gerade in Text um. Das dauert in der Regel weniger als die Aufnahme selbst.",
  pending_review:
    "Dein Walkthrough wartet auf das Review eines Beraters. Du wirst benachrichtigt, sobald es freigegeben ist.",
  approved: "Inhalte sind im Onboarding-Zwischenstand verfuegbar.",
  rejected:
    "Der Berater hat die Aufnahme nicht freigegeben. Bitte sieh dir die Anmerkung an und wiederhole die Aufnahme bei Bedarf.",
  failed:
    "Bei der Verarbeitung ist ein Fehler aufgetreten. Bitte starte den Walkthrough erneut oder melde dich bei deinem Berater.",
};

export function WalkthroughStatusPolling({ walkthroughId, initial }: Props) {
  const [row, setRow] = useState<WalkthroughStatusRow>(initial);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    if (TERMINAL_STATES.has(row.status)) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/walkthroughs/${walkthroughId}/status`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          setPollError(`Statusabfrage fehlgeschlagen: HTTP ${res.status}`);
          return;
        }
        const next = (await res.json()) as WalkthroughStatusRow;
        if (cancelled) return;
        setRow(next);
        setPollError(null);
      } catch (e) {
        if (!cancelled) {
          setPollError(`Statusabfrage fehlgeschlagen: ${(e as Error).message}`);
        }
      }
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [walkthroughId, row.status]);

  const label = STATUS_LABELS[row.status] ?? row.status;
  const hint = HINTS[row.status] ?? null;
  const isTerminal = TERMINAL_STATES.has(row.status);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white px-5 py-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Status
        </div>
        <div className="mt-1 text-lg font-semibold text-slate-900">{label}</div>
        {hint ? (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{hint}</p>
        ) : null}
        {!isTerminal ? (
          <p className="mt-2 text-xs text-slate-500">
            Aktualisiert alle 5 Sekunden automatisch.
          </p>
        ) : null}
      </div>

      {row.status === "rejected" && row.reviewer_note ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong className="font-semibold">Berater-Anmerkung:</strong>{" "}
          {row.reviewer_note}
        </div>
      ) : null}

      {row.status === "failed" && row.rejection_reason ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong className="font-semibold">Grund:</strong> {row.rejection_reason}
        </div>
      ) : null}

      {pollError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
          {pollError}
        </div>
      ) : null}
    </div>
  );
}
