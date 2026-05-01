// SLC-049 MT-2 — Cockpit-Card "Mitarbeiter ohne Aktivitaet".
//
// Zeigt die Anzahl der Mitarbeiter mit accepted Invitation, aber ohne
// block_checkpoint. Klick fuehrt zur gefilterten Mitarbeiter-Liste auf
// /admin/team?filter=inactive (existing /admin/team-Page wird in MT-4
// um den Filter erweitert).
//
// Tooltip-Text per DEC-058 ("Mitarbeiter mit accepted Invitation aber
// ohne Block-Submit"). Refresh per Page-Reload (DEC-060).

"use client";

import Link from "next/link";
import { UserMinus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { deriveInactiveCardDisplay } from "@/lib/dashboard/inactive-employees";

const TONE_CLASS = {
  default: "border-slate-200",
  warning: "border-amber-300 bg-amber-50/40",
  success: "border-green-300 bg-green-50/40",
} as const;

interface Props {
  inactiveCount: number;
  totalAccepted: number;
}

export function InactiveEmployeesCard({ inactiveCount, totalAccepted }: Props) {
  const { value, hint, tone } = deriveInactiveCardDisplay({
    inactiveCount,
    totalAccepted,
  });

  return (
    <Link href="/admin/team?filter=inactive" className="group">
      <Card
        className={`h-full border ${TONE_CLASS[tone]} transition-shadow hover:shadow-md`}
      >
        <CardContent className="flex h-full flex-col gap-2 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 group-hover:text-brand-primary-dark">
            <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Mitarbeiter ohne Aktivitaet</span>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Was bedeutet 'ohne Aktivitaet'?"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    className="ml-auto flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    ?
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-xs text-xs leading-snug"
                >
                  Mitarbeiter mit accepted Invitation aber ohne Block-Submit
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
          {hint && <div className="text-xs text-slate-500">{hint}</div>}
        </CardContent>
      </Card>
    </Link>
  );
}
