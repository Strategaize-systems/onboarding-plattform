// V6 SLC-106 MT-8 — Status-Card "Anfrage an Strategaize gesendet" (FEAT-046).
//
// Stateless Server-Component. Wird im Mandanten-Dashboard
// (PartnerClientWelcomeBlock) gerendert, sobald der Mandant bereits einen
// Lead-Push-Consent abgegeben hat. Ersetzt visuell die `IchWillMehrCard`
// (Trigger-Pfad), damit die "Ich will mehr"-Aktion nicht erneut angeboten wird.
//
// Drei Sichtbarkeits-States basierend auf `lead_push_audit.status` der
// juengsten Audit-Zeile zum Consent dieser capture_session:
//   - 'success' (HTTP 200/201 erfolgreich) → "Anfrage gesendet am {date}"
//     mit gruenem CheckCircle-Icon.
//   - 'pending' | 'failed' (synchroner Push fehlgeschlagen, Retry laeuft im
//     Hintergrund via ai_jobs.lead_push_retry) → "Anfrage wird zugestellt..."
//     mit neutralem Loader-Icon. Keine Polling-Logik — Refresh kommt durch
//     normalen Page-Reload nach Worker-Pickup (5min/30min Backoff DEC-112).
//
// Wird NICHT gerendert, wenn `status === null` — in dem Fall liefert
// PartnerClientWelcomeBlock die Trigger-Card oder rendert gar nichts.

import { CheckCircle2, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type IchWillMehrAuditStatus = "success" | "pending" | "failed";

interface IchWillMehrStatusCardProps {
  status: IchWillMehrAuditStatus;
  updatedAt: string;
}

function formatGermanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function IchWillMehrStatusCard({
  status,
  updatedAt,
}: IchWillMehrStatusCardProps) {
  const isSuccess = status === "success";

  return (
    <Card data-testid="ich-will-mehr-status-card" data-status={status}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div
            className={
              isSuccess
                ? "rounded-full bg-emerald-50 p-3"
                : "rounded-full bg-slate-100 p-3"
            }
          >
            {isSuccess ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            )}
          </div>
          <div>
            <CardTitle>
              {isSuccess
                ? "Anfrage an Strategaize gesendet"
                : "Anfrage wird zugestellt"}
            </CardTitle>
            <CardDescription>
              {isSuccess
                ? `Gesendet am ${formatGermanDate(updatedAt)}. Strategaize meldet sich in den naechsten Werktagen bei Ihnen.`
                : "Wir uebermitteln Ihre Anfrage gerade an Strategaize. Sie muessen nichts weiter tun — die Zustellung erfolgt automatisch im Hintergrund."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-slate-400">
          {isSuccess
            ? "Eine erneute Anfrage ist nicht erforderlich."
            : "Bitte einen Moment Geduld. Die Seite zeigt den aktualisierten Status nach dem naechsten Laden."}
        </p>
      </CardContent>
    </Card>
  );
}
