import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

/**
 * V6 SLC-103 MT-7 / SLC-104 MT-9 — Welcome-Block fuer Mandanten unter
 * Partner-Steuerberatern.
 *
 * Stateless Server-Component. SLC-104 MT-9 erweitert um
 *   - `partnerDisplayName`: Anzeigename des Partner-Steuerberaters
 *     (`partner_branding_config.display_name` mit Fallback auf
 *     `partner_organization.display_name`, beides via Server-Resolver in
 *     dashboard/page.tsx).
 *   - `partnerLogoUrl`: Server-Proxy-URL `/api/partner-branding/<id>/logo`
 *     oder null, wenn Partner kein Logo hochgeladen hat.
 *
 * Beides ist optional — fehlt der Wert, fallen die Textbloecke auf den
 * generischen Hinweis aus SLC-103 zurueck ("Ihrem Steuerberater"). Damit
 * bleibt der Block resilient gegen Branding-Resolver-Fehler (R-104-1).
 *
 * Diagnose-Karte ist Placeholder fuer SLC-105 — Klick zeigt Coming-Soon-Modal
 * (in V6 als simpler `disabled` Button mit Hinweis-Text dargestellt).
 */

interface PartnerClientWelcomeBlockProps {
  mandantCompanyName: string;
  partnerDisplayName?: string | null;
  partnerLogoUrl?: string | null;
}

export function PartnerClientWelcomeBlock({
  mandantCompanyName,
  partnerDisplayName,
  partnerLogoUrl,
}: PartnerClientWelcomeBlockProps) {
  const partnerLabel = partnerDisplayName?.trim() || "Ihrem Steuerberater";

  return (
    <div className="space-y-6">
      {(partnerLogoUrl || partnerDisplayName) && (
        <div className="flex items-center gap-3">
          {partnerLogoUrl ? (
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
              <Image
                src={partnerLogoUrl}
                alt={
                  partnerDisplayName
                    ? `${partnerDisplayName} Logo`
                    : "Partner-Logo"
                }
                width={48}
                height={48}
                unoptimized
                className="h-full w-full object-contain"
              />
            </div>
          ) : null}
          {partnerDisplayName ? (
            <span className="text-sm text-slate-500">
              Ihr Steuerberater:{" "}
              <span className="font-medium text-slate-700">
                {partnerDisplayName}
              </span>
            </span>
          ) : null}
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Willkommen{mandantCompanyName ? `, ${mandantCompanyName}` : ""}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Empfohlen von {partnerLabel}. Strategaize unterstuetzt Sie dabei,
          die wichtigsten Themen Ihres Unternehmens zu strukturieren.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-brand-primary/10 p-3">
              <Sparkles className="h-5 w-5 text-brand-primary" />
            </div>
            <div>
              <CardTitle>Strategaize-Diagnose starten</CardTitle>
              <CardDescription>
                Beantworten Sie strukturierte Fragen zu Ihrem Unternehmen.
                Strategaize wertet die Antworten aus und Ihr Steuerberater
                bespricht den Bericht mit Ihnen.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            disabled
            title="Verfuegbar mit dem naechsten Update (SLC-105)"
          >
            Diagnose starten (folgt in Kuerze)
          </Button>
          <p className="mt-3 text-xs text-slate-400">
            Wir bereiten die Diagnose-Pipeline gerade fuer den Live-Betrieb vor.
            Sie erhalten eine Benachrichtigung, sobald die Diagnose freigeschaltet ist.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
