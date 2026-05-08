import type { ReactNode } from "react";
import { BookOpen, ClipboardList, GitMerge, Users, ListChecks } from "lucide-react";
import { computeRecommendedNextStep } from "@/lib/cockpit/next-step";
import type { CockpitMetrics } from "@/lib/cockpit/types";
import { MetricCard } from "./MetricCard";
import { NextStepBanner } from "./NextStepBanner";

interface Props {
  metrics: CockpitMetrics;
  /** SLC-042: optionale 6. Karte fuer Berater-Review-Status. */
  reviewCard?: ReactNode;
  /** SLC-049: optionale 7. Karte fuer "Mitarbeiter ohne Aktivitaet". */
  inactiveCard?: ReactNode;
  /** V5 Option 2 Hotfix: optionale 8. Karte fuer Walkthrough-Methodik-Review. */
  walkthroughCard?: ReactNode;
}

/**
 * SLC-040 MT-5 — Self-Service-Status-Cockpit fuer tenant_admin auf /dashboard.
 *
 * Layout:
 *   1. NextStepBanner (regel-basierte Empfehlung)
 *   2. Stale-/Bridge-running-Hinweis falls relevant
 *   3. 5 Metrik-Karten in responsivem Grid (1/2/3 Spalten)
 *
 * Alle Karten sind klickbar und fuehren zur jeweiligen Detail-Route.
 */
export function StatusCockpit({
  metrics,
  reviewCard,
  inactiveCard,
  walkthroughCard,
}: Props) {
  const nextStep = computeRecommendedNextStep(metrics);
  const captureHref = metrics.captureSessionId
    ? `/capture/${metrics.captureSessionId}`
    : "/capture/new";

  const bridgeStatusLabel = metrics.lastBridgeRun
    ? metrics.lastBridgeRun.status === "stale"
      ? `${metrics.lastBridgeRun.proposal_count} Vorschlaege (veraltet)`
      : metrics.lastBridgeRun.status === "running"
        ? "Lauf in Arbeit…"
        : metrics.lastBridgeRun.status === "failed"
          ? "Letzter Lauf fehlgeschlagen"
          : `${metrics.lastBridgeRun.proposal_count} Vorschlaege`
    : "Noch kein Lauf";

  const handbookStatusLabel = metrics.lastHandbookSnapshot
    ? metrics.lastHandbookSnapshot.status === "ready"
      ? "Aktuelle Version vorhanden"
      : metrics.lastHandbookSnapshot.status === "generating"
        ? "Wird erzeugt…"
        : "Letzte Generierung fehlgeschlagen"
    : "Noch nicht generiert";

  const isStale = metrics.lastBridgeRun?.status === "stale";

  return (
    <section aria-labelledby="cockpit-heading" className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 id="cockpit-heading" className="text-xl font-semibold text-slate-900">
            Mein Status
          </h2>
          <p className="text-sm text-slate-500">
            Wo du stehst — und was als naechstes ansteht.
          </p>
        </div>
      </div>

      <NextStepBanner nextStep={nextStep} />

      {isStale && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Bridge-Lauf ist als veraltet markiert — du hast Bloecke nach dem Lauf
          geaendert. Bitte erneut ausfuehren, damit die Vorschlaege aktuell bleiben.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          icon={ClipboardList}
          label="Eigene Erhebung"
          value={
            metrics.blocksTotal > 0
              ? `${metrics.blocksSubmitted} / ${metrics.blocksTotal}`
              : "–"
          }
          hint={
            metrics.blocksTotal > 0
              ? metrics.blocksSubmitted >= metrics.blocksTotal
                ? "Alle Bloecke eingereicht"
                : "Bloecke offen"
              : "Noch keine Erhebung gestartet"
          }
          href={captureHref}
          tone={
            metrics.blocksTotal > 0 && metrics.blocksSubmitted >= metrics.blocksTotal
              ? "success"
              : "default"
          }
        />

        <MetricCard
          icon={GitMerge}
          label="Bridge"
          value={
            metrics.lastBridgeRun
              ? String(metrics.lastBridgeRun.proposal_count)
              : "0"
          }
          hint={bridgeStatusLabel}
          href="/admin/bridge"
          tone={isStale ? "warning" : "default"}
        />

        <MetricCard
          icon={Users}
          label="Mitarbeiter"
          value={String(metrics.employeesInvited)}
          hint={
            metrics.employeesInvited === 0
              ? "Noch niemand eingeladen"
              : `${metrics.employeesInvited} aktiv`
          }
          href="/admin/team"
        />

        <MetricCard
          icon={ListChecks}
          label="Mitarbeiter-Aufgaben"
          value={`${metrics.employeeTasksDone} / ${metrics.employeeTasksOpen + metrics.employeeTasksDone}`}
          hint={
            metrics.employeeTasksOpen > 0
              ? `${metrics.employeeTasksOpen} offen — manuell erinnern`
              : metrics.employeeTasksDone > 0
                ? "Alle Aufgaben fertig"
                : "Noch keine Aufgaben"
          }
          href="/admin/team"
          tone={metrics.employeeTasksOpen > 0 ? "warning" : "default"}
        />

        <MetricCard
          icon={BookOpen}
          label="Unternehmerhandbuch"
          value={
            metrics.lastHandbookSnapshot?.status === "ready"
              ? "Bereit"
              : metrics.lastHandbookSnapshot?.status === "generating"
                ? "…"
                : "–"
          }
          hint={handbookStatusLabel}
          href="/admin/handbook"
          tone={
            metrics.lastHandbookSnapshot?.status === "ready"
              ? "success"
              : metrics.lastHandbookSnapshot?.status === "failed"
                ? "warning"
                : "default"
          }
        />

        {reviewCard}

        {walkthroughCard}

        {inactiveCard}
      </div>
    </section>
  );
}
