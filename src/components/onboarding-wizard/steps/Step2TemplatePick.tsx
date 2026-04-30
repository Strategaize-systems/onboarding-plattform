"use client";

// SLC-047 MT-2 — Step 2: Template-Auswahl per RadioGroup.
//
// Templates werden vom Layout-Server-Component vorgeladen und als Prop uebergeben.
// Wenn keine Templates aktiv sind (Edge-Case in einem frischen Tenant), zeigt
// der Step einen Hinweis und "Weiter" bleibt deaktiviert (Footer-Logik).

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { WizardTemplate } from "../Wizard";

type Step2Props = {
  templates: WizardTemplate[];
  selectedTemplateId: string;
  onSelect: (id: string) => void;
};

export function Step2TemplatePick({ templates, selectedTemplateId, onSelect }: Step2Props) {
  if (templates.length === 0) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Aktuell sind für Ihren Tenant noch keine Erhebungs-Vorlagen aktiviert. Bitte wenden Sie sich an Ihren Berater.
      </div>
    );
  }

  return (
    <RadioGroup
      value={selectedTemplateId}
      onValueChange={onSelect}
      className="grid gap-3"
    >
      {templates.map((template) => (
        <Label
          key={template.id}
          htmlFor={`tpl-${template.id}`}
          className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white p-4 hover:border-brand-primary/40 has-[[data-state=checked]]:border-brand-primary has-[[data-state=checked]]:bg-brand-primary/5"
        >
          <RadioGroupItem
            id={`tpl-${template.id}`}
            value={template.id}
            className="mt-1"
          />
          <div className="space-y-1">
            <div className="text-sm font-semibold text-slate-900">
              {template.name}
            </div>
            {template.description && (
              <div className="text-xs text-slate-500">
                {template.description}
              </div>
            )}
          </div>
        </Label>
      ))}
    </RadioGroup>
  );
}
