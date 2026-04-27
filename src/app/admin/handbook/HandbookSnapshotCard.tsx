import { AlertCircle, CheckCircle2, Loader2, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { HandbookSnapshotRow } from "./types";

interface Props {
  snapshot: HandbookSnapshotRow;
}

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "–";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function HandbookSnapshotCard({ snapshot }: Props) {
  const isReady = snapshot.status === "ready";
  const isFailed = snapshot.status === "failed";
  const isGenerating = snapshot.status === "generating";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <StatusBadge status={snapshot.status} />
            <span className="text-sm font-medium text-slate-800">
              {snapshot.formattedCreatedAt}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>{formatBytes(snapshot.storage_size_bytes)}</span>
            {snapshot.section_count !== null && (
              <span>{snapshot.section_count} Sektionen</span>
            )}
            {snapshot.knowledge_unit_count !== null && (
              <span>{snapshot.knowledge_unit_count} KU</span>
            )}
            {snapshot.diagnosis_count !== null && (
              <span>{snapshot.diagnosis_count} Diagnosen</span>
            )}
            {snapshot.sop_count !== null && (
              <span>{snapshot.sop_count} SOPs</span>
            )}
          </div>
          {isFailed && snapshot.error_message && (
            <p className="text-xs text-red-700">
              Fehler: {snapshot.error_message}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {isReady && (
            <a
              href={`/api/handbook/${snapshot.id}/download`}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-primary px-3 text-sm font-medium text-white hover:bg-brand-primary-dark"
              download
            >
              <Download className="h-4 w-4" />
              Download ZIP
            </a>
          )}
          {isGenerating && (
            <span className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 text-sm font-medium text-blue-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              Wird erzeugt…
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: HandbookSnapshotRow["status"] }) {
  if (status === "ready") {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Fertig
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Fehlgeschlagen
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      In Erzeugung
    </Badge>
  );
}
