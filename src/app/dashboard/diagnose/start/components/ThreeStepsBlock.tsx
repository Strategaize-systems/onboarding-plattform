// V7.3 SLC-140 MT-2 — 3-Schritte-Block fuer Diagnose-Start-Page.
//
// Server-Component. Erklaert dem Mandanten "Was passiert in 3 Schritten":
// (1) Diagnose ausfuellen, (2) automatischer Bericht, (3) Berater-Gespraech
// optional. Visuell unterscheidbare Cards mit Number-Badge, Mobile vertical
// stack, Desktop 3-Spalten-Grid.

import { EditableText } from "@/components/text-override/EditableText";

interface Step {
  number: string;
  titleKey: string;
  titleDefault: string;
  descriptionKey: string;
  descriptionDefault: string;
}

const STEPS: readonly Step[] = [
  {
    number: "1",
    titleKey: "diagnose.start.steps.step1.title",
    titleDefault: "Diagnose ausfuellen",
    descriptionKey: "diagnose.start.steps.step1.description",
    descriptionDefault:
      "24 Fragen entlang 6 Bausteinen. Antwort-Optionen vorgegeben — Sie waehlen die passendste.",
  },
  {
    number: "2",
    titleKey: "diagnose.start.steps.step2.title",
    titleDefault: "Automatischer Bericht",
    descriptionKey: "diagnose.start.steps.step2.description",
    descriptionDefault:
      "Strategaize verdichtet Ihre Antworten und liefert einen kommentierten Bericht mit Score pro Baustein.",
  },
  {
    number: "3",
    titleKey: "diagnose.start.steps.step3.title",
    titleDefault: "Berater-Gespraech (optional)",
    descriptionKey: "diagnose.start.steps.step3.description",
    descriptionDefault:
      "Bei Bedarf besprechen Sie den Bericht mit Ihrem Steuerberater — der hat Zugriff auf die gleiche Auswertung.",
  },
];

export function ThreeStepsBlock() {
  return (
    <section
      aria-labelledby="three-steps-heading"
      className="space-y-4"
    >
      <h2
        id="three-steps-heading"
        className="text-lg font-semibold text-slate-900"
      >
        <EditableText
          keyPath="diagnose.start.steps.heading"
          defaultText="So laeuft es ab"
        />
      </h2>
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step) => (
          <li
            key={step.number}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary text-base font-semibold text-white"
            >
              {step.number}
            </span>
            <h3 className="mt-4 text-base font-semibold text-slate-900">
              <EditableText
                keyPath={step.titleKey}
                defaultText={step.titleDefault}
              />
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              <EditableText
                keyPath={step.descriptionKey}
                defaultText={step.descriptionDefault}
                multiline
              />
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
