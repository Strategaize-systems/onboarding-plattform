import { HandbookSnapshotCard } from "./HandbookSnapshotCard";
import { TriggerHandbookButton } from "./TriggerHandbookButton";
import type { HandbookSnapshotRow } from "./types";

interface Props {
  snapshots: HandbookSnapshotRow[];
  captureSessionId: string;
}

/**
 * SLC-040 — Liste der Handbuch-Snapshots zur aktuellen GF-Session.
 *
 * Sortiert: created_at desc (juengster oben). Fuer den Failed-Fall wird zusaetzlich
 * ein Re-Try-Button neben dem Card gerendert, damit der tenant_admin nicht zum
 * Top-Bereich zurueck muss.
 */
export function HandbookSnapshotList({ snapshots, captureSessionId }: Props) {
  if (snapshots.length === 0) return null;
  const latestIsFailed = snapshots[0]?.status === "failed";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Handbuch-Versionen ({snapshots.length})
        </h2>
      </div>

      {latestIsFailed && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex flex-wrap items-center justify-between gap-3">
          <span>
            Die letzte Generierung ist fehlgeschlagen. Du kannst einen neuen Versuch
            starten — bestehende Versionen bleiben erhalten.
          </span>
          <TriggerHandbookButton
            captureSessionId={captureSessionId}
            hasPreviousSnapshot={true}
          />
        </div>
      )}

      <div className="space-y-2">
        {snapshots.map((s) => (
          <HandbookSnapshotCard key={s.id} snapshot={s} />
        ))}
      </div>
    </div>
  );
}
