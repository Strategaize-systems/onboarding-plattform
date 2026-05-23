// V7.3 SLC-140 MT-5 — ErrorState fuer Diagnose-Funnel (generischer Fehler).
//
// Wiederverwendbarer Visual-Error-State: AlertCircle-Badge in rot + Title +
// Beschreibung + Retry-Link + Support-Hinweis.
//
// Wird in:
//   - bericht-pending/page.tsx fuer status='failed' (Light-Pipeline-Fehler).
//   - bericht/page.tsx als generischer Error-State falls Bericht nicht geladen
//     werden kann (zukuenftige Erweiterung).
//
// Strings via EditableText mit graceful Default-Fallback.

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/text-override/EditableText";

interface ErrorStateProps {
  titleKeyPath: string;
  titleDefault: string;
  descriptionKeyPath: string;
  descriptionDefault: string;
  retryHref: string;
  retryKeyPath: string;
  retryDefault: string;
  supportKeyPath: string;
  supportDefault: string;
}

export function ErrorState({
  titleKeyPath,
  titleDefault,
  descriptionKeyPath,
  descriptionDefault,
  retryHref,
  retryKeyPath,
  retryDefault,
  supportKeyPath,
  supportDefault,
}: ErrorStateProps) {
  return (
    <div
      className="rounded-lg border border-red-200 bg-white p-6 shadow-sm sm:p-8"
      role="alert"
    >
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50">
          <AlertCircle
            className="h-6 w-6 text-red-600"
            aria-hidden="true"
          />
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
            <Button asChild>
              <Link href={retryHref}>
                <EditableText
                  keyPath={retryKeyPath}
                  defaultText={retryDefault}
                />
              </Link>
            </Button>
            <p className="mt-3 text-xs text-slate-400">
              <EditableText
                keyPath={supportKeyPath}
                defaultText={supportDefault}
                multiline
              />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
