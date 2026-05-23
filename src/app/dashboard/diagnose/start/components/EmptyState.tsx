// V7.3 SLC-140 MT-5 — EmptyState fuer Diagnose-Funnel (Slot "noch keine Diagnose").
//
// Wiederverwendbarer Visual-Empty-State: Icon-Badge + Title + Beschreibung +
// CTA-Button. Wird auf der Dashboard-Diagnose-Card verwendet ("Diagnose
// starten"-Slot) und kann in zukuenftigen Slots (z.B. start-page selbst,
// admin-empty-list) wiederverwendet werden.
//
// EditableText-faehig auch ohne TextOverrideProvider — der Hook faellt sauber
// auf defaultText zurueck (siehe use-text-override.ts EMPTY_TEXT_OVERRIDE_CONTEXT).
// Auf der Dashboard-Card haben wir aktuell keinen Provider; die Strings rendern
// dort als Default-Text ohne Edit-Pencil.

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/text-override/EditableText";

interface EmptyStateProps {
  icon: LucideIcon;
  titleKeyPath: string;
  titleDefault: string;
  descriptionKeyPath: string;
  descriptionDefault: string;
  ctaHref: string;
  ctaKeyPath: string;
  ctaDefault: string;
  /** Optional Hinweistext unter dem CTA (z.B. Dauer + Unterbrech-Hinweis). */
  hintKeyPath?: string;
  hintDefault?: string;
}

export function EmptyState({
  icon: Icon,
  titleKeyPath,
  titleDefault,
  descriptionKeyPath,
  descriptionDefault,
  ctaHref,
  ctaKeyPath,
  ctaDefault,
  hintKeyPath,
  hintDefault,
}: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary/10">
          <Icon className="h-6 w-6 text-brand-primary" aria-hidden="true" />
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="text-lg font-semibold text-slate-900">
            <EditableText keyPath={titleKeyPath} defaultText={titleDefault} />
          </h3>
          <p className="text-sm text-slate-600">
            <EditableText
              keyPath={descriptionKeyPath}
              defaultText={descriptionDefault}
              multiline
            />
          </p>
          <div className="pt-2">
            <Button asChild size="lg">
              <Link href={ctaHref}>
                <EditableText
                  keyPath={ctaKeyPath}
                  defaultText={ctaDefault}
                />
              </Link>
            </Button>
            {hintKeyPath && hintDefault ? (
              <p className="mt-3 text-xs text-slate-400">
                <EditableText
                  keyPath={hintKeyPath}
                  defaultText={hintDefault}
                  multiline
                />
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
