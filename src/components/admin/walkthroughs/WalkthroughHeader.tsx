// SLC-079 MT-5 — Header mit Metadaten der Walkthrough-Session.
// Server Component.

interface Props {
  tenantName: string;
  recordedByEmail: string | null;
  status: string;
  createdAt: string | null;
  reviewedAt: string | null;
  reviewerEmail: string | null;
  durationSec: number | null;
  stepCount: number;
  mappedCount: number;
  unmappedCount: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-slate-200 text-slate-700",
};

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return dateFormatter.format(new Date(iso));
}

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")} min`;
}

export function WalkthroughHeader({
  tenantName,
  recordedByEmail,
  status,
  createdAt,
  reviewedAt,
  reviewerEmail,
  durationSec,
  stepCount,
  mappedCount,
  unmappedCount,
}: Props) {
  const statusStyle = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700";

  return (
    <header className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Methodik-Review
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tenant <span className="font-medium text-slate-700">{tenantName}</span>{" "}
          · Walkthrough vom{" "}
          <span className="font-medium text-slate-700">{formatDate(createdAt)}</span>
        </p>
      </div>

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Status">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle}`}
          >
            {STATUS_LABEL[status] ?? status}
          </span>
        </Stat>
        <Stat label="Aufgenommen von">
          <span className="text-sm text-slate-700">{recordedByEmail ?? "—"}</span>
        </Stat>
        <Stat label="Dauer">
          <span className="text-sm text-slate-700">{formatDuration(durationSec)}</span>
        </Stat>
        <Stat label="Schritte">
          <span className="text-sm text-slate-700">
            {stepCount}{" "}
            <span className="text-xs text-slate-400">
              ({mappedCount} mapped, {unmappedCount} unmapped)
            </span>
          </span>
        </Stat>
      </div>

      {reviewedAt && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <div className="font-medium text-slate-900">Letzter Review</div>
          <div className="mt-1 text-xs text-slate-600">
            {reviewerEmail ?? "Unbekannter Reviewer"} · {formatDate(reviewedAt)}
          </div>
        </div>
      )}
    </header>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
