"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ListOrdered,
  Shield,
  Target,
} from "lucide-react";
import type { SopContent, SopStep } from "@/workers/sop/types";

interface SopViewProps {
  content: SopContent;
}

export function SopView({ content }: SopViewProps) {
  return (
    <div className="space-y-4">
      {/* Title + Objective */}
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-slate-900">{content.title}</h3>
        <p className="text-sm text-slate-600">{content.objective}</p>
      </div>

      {/* Prerequisites */}
      {content.prerequisites.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Target className="h-3.5 w-3.5" />
            Voraussetzungen
          </h4>
          <ul className="space-y-1">
            {content.prerequisites.map((p, i) => (
              <li key={i} className="text-sm text-slate-700">
                &bull; {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <ListOrdered className="h-3.5 w-3.5" />
          Schritte ({content.steps.length})
        </h4>
        <div className="space-y-2">
          {content.steps.map((step) => (
            <StepCard key={step.number} step={step} />
          ))}
        </div>
      </div>

      {/* Risks */}
      {content.risks.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            Risiken
          </h4>
          <ul className="space-y-1">
            {content.risks.map((r, i) => (
              <li key={i} className="text-sm text-amber-800">
                &bull; {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fallbacks */}
      {content.fallbacks.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-green-600">
            <Shield className="h-3.5 w-3.5" />
            Fallback-Optionen
          </h4>
          <ul className="space-y-1">
            {content.fallbacks.map((f, i) => (
              <li key={i} className="text-sm text-green-800">
                &bull; {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StepCard({ step }: { step: SopStep }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
          {step.number}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-slate-900">{step.action}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {step.responsible && (
              <span>
                <span className="font-semibold text-slate-600">
                  Verantwortlich:
                </span>{" "}
                {step.responsible}
              </span>
            )}
            {step.timeframe && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {step.timeframe}
              </span>
            )}
          </div>
          {step.success_criterion && (
            <div className="flex items-start gap-1 text-xs">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
              <span className="text-slate-600">{step.success_criterion}</span>
            </div>
          )}
          {step.dependencies.length > 0 && (
            <p className="text-xs text-slate-400">
              Abhängig von: {step.dependencies.join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
