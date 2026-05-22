// V7.3 SLC-140 MT-2 — Hero-Section fuer Diagnose-Start-Page.
//
// Server-Component. Visueller Anker oben auf der Page: brand-primary
// Gradient-Banner + grosser Title + Subtitle + Meta-Info (24 Fragen / 8-12
// Min). Texte als EditableText, damit strategaize_admin sie ohne Code-Deploy
// editieren kann (SLC-137 EditableText-Pattern).

import { EditableText } from "@/components/text-override/EditableText";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-primary-dark via-brand-primary to-brand-primary px-6 py-10 text-white shadow-lg sm:px-10 sm:py-14">
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-20 -left-12 h-56 w-56 rounded-full bg-white/5 blur-3xl"
      />
      <div className="relative space-y-4">
        <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium tracking-wide text-white/90">
          <EditableText
            keyPath="diagnose.start.hero.eyebrow"
            defaultText="Strategaize Diagnose-Werkzeug"
          />
        </span>
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
          <EditableText
            keyPath="diagnose.start.heading"
            defaultText="Strategaize-Diagnose"
          />
        </h1>
        <p className="max-w-2xl text-base text-white/90 sm:text-lg">
          <EditableText
            keyPath="diagnose.start.subheading"
            defaultText="Strukturierte Selbsteinschaetzung Ihrer Unternehmens-Reife. Wir fragen 24 Punkte entlang sechs Bausteine, jeweils mit fertigen Antwort-Optionen — Sie waehlen, was am ehesten zutrifft."
            multiline
          />
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-1 text-sm text-white/85">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true">●</span>
            <EditableText
              keyPath="diagnose.start.hero.meta_questions"
              defaultText="24 Fragen"
            />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true">●</span>
            <EditableText
              keyPath="diagnose.start.hero.meta_duration"
              defaultText="8–12 Minuten"
            />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true">●</span>
            <EditableText
              keyPath="diagnose.start.hero.meta_autosave"
              defaultText="Stand wird gespeichert"
            />
          </span>
        </div>
      </div>
    </section>
  );
}
