// SLC-042 MT-1 — Mitarbeiter-KU-Stack: Liste der Mitarbeiter-Beitraege fuer
// den Review-Block. Pro KU: Mitarbeiter-Email + Confidence + Title + Body +
// Link zur Capture-Session.

import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface EmployeeKU {
  id: string;
  title: string;
  body: string;
  confidence: "low" | "medium" | "high";
  capture_session_id: string;
  employee_email: string | null;
}

interface Props {
  units: EmployeeKU[];
}

const CONFIDENCE_TONE: Record<EmployeeKU["confidence"], string> = {
  low: "bg-slate-100 text-slate-700 border-slate-300",
  medium: "bg-blue-50 text-blue-900 border-blue-200",
  high: "bg-emerald-50 text-emerald-900 border-emerald-200",
};

const CONFIDENCE_LABEL: Record<EmployeeKU["confidence"], string> = {
  low: "Confidence: niedrig",
  medium: "Confidence: mittel",
  high: "Confidence: hoch",
};

export function EmployeeKUStack({ units }: Props) {
  if (units.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
        Noch keine Mitarbeiter-Beitraege fuer diesen Block.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {units.map((ku) => (
        <li key={ku.id}>
          <Card className="border-slate-200">
            <CardContent className="space-y-2 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-600">
                  <span className="font-medium text-slate-900">
                    {ku.employee_email ?? "Unbekannter Mitarbeiter"}
                  </span>
                  <Link
                    href={`/admin/debrief/${ku.capture_session_id}`}
                    className="text-brand-primary-dark underline-offset-2 hover:underline"
                  >
                    Erhebung oeffnen
                  </Link>
                </div>
                <Badge
                  variant="outline"
                  className={CONFIDENCE_TONE[ku.confidence]}
                >
                  {CONFIDENCE_LABEL[ku.confidence]}
                </Badge>
              </div>
              {ku.title && (
                <h3 className="text-sm font-semibold text-slate-900">
                  {ku.title}
                </h3>
              )}
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {ku.body}
              </p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
