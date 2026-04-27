import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { NextStep } from "@/lib/cockpit/types";

interface Props {
  nextStep: NextStep;
}

export function NextStepBanner({ nextStep }: Props) {
  return (
    <Link
      href={nextStep.href}
      className="group block rounded-2xl bg-gradient-to-r from-brand-primary to-brand-primary-dark p-[1px] shadow-[0_8px_24px_-8px_rgba(68,84,184,0.45)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-brand-primary-dark text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Naechster Schritt
            </div>
            <div className="text-lg font-semibold text-slate-900">{nextStep.label}</div>
            <div className="mt-1 text-sm text-slate-600">{nextStep.reason}</div>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white group-hover:bg-brand-primary-dark">
          Loslegen
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
