"use client";

// SLC-047 MT-2 — Step 1: Begruessung mit Tenant-Name + Tool-Zweck.
//
// Reines Read-Only-UI. Keine Form, keine eigene Server-Action — nur
// Inhalt + Branding. Der "Weiter"-Button liegt im Wizard-Footer.

import { Sparkles } from "lucide-react";

type Step1Props = {
  tenantName: string;
};

export function Step1Welcome({ tenantName }: Step1Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-brand-primary">
        <Sparkles className="h-5 w-5" />
        <span className="text-sm font-medium uppercase tracking-wide">
          {tenantName}
        </span>
      </div>
      <p className="text-base text-slate-700">
        Schön, dass Sie da sind. Hier erheben wir strukturiert Wissen aus Ihrem Unternehmen — KI hilft beim Verdichten, Berater unterstützen im Review.
      </p>
      <p className="text-sm text-slate-500">
        In den nächsten drei Schritten richten wir Ihr Onboarding ein: Sie wählen eine Erhebung, laden bei Bedarf Mitarbeiter ein und entscheiden, womit Sie als Erstes loslegen.
      </p>
    </div>
  );
}
