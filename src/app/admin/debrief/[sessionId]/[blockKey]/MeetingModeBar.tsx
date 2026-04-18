"use client";

import { useState, useTransition } from "react";
import { createMeetingSnapshot } from "./meeting-snapshot-action";

interface MeetingModeBarProps {
  sessionId: string;
  blockKey: string;
  hasKnowledgeUnits: boolean;
  isAlreadyFinalized: boolean;
  onSnapshotCreated: (checkpointId: string) => void;
}

export function MeetingModeBar({
  sessionId,
  blockKey,
  hasKnowledgeUnits,
  isAlreadyFinalized,
  onSnapshotCreated,
}: MeetingModeBarProps) {
  const [inMeetingMode, setInMeetingMode] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFinalize() {
    setError(null);
    startTransition(async () => {
      const result = await createMeetingSnapshot(sessionId, blockKey);

      if (result.error) {
        setError(result.error);
        setShowConfirm(false);
        return;
      }

      if (result.deduplicated) {
        setError("Snapshot wurde bereits erstellt (Deduplizierung).");
        setShowConfirm(false);
        return;
      }

      setShowConfirm(false);
      setInMeetingMode(false);
      onSnapshotCreated(result.checkpointId!);
    });
  }

  if (isAlreadyFinalized) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-green-800">
            Block finalisiert
          </span>
          <span className="text-xs text-green-600">
            Meeting-Snapshot wurde erstellt
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">
            Meeting-Modus
          </span>
          <button
            onClick={() => setInMeetingMode(!inMeetingMode)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              inMeetingMode ? "bg-blue-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                inMeetingMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-xs text-slate-500">
            {inMeetingMode ? "Im Meeting" : "Vor-Meeting-Review"}
          </span>
        </div>

        {inMeetingMode && (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!hasKnowledgeUnits || isPending}
            className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            Meeting abschliessen
          </button>
        )}
      </div>

      {error && (
        <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Meeting abschliessen?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Es wird ein finaler Snapshot aller Knowledge Units dieses Blocks
              erstellt. Dies kann nicht rueckgaengig gemacht werden.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
                className="rounded bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Abbrechen
              </button>
              <button
                onClick={handleFinalize}
                disabled={isPending}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isPending ? "Wird erstellt…" : "Snapshot erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
