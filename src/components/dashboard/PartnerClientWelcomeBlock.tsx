import Link from "next/link";
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
 * V6 SLC-103 MT-7 — Welcome-Block fuer Mandanten unter Partner-Steuerberatern.
 *
 * Stateless Server-Component. SLC-103 zeigt einen generischen Hinweis
 * ("Empfohlen von Ihrem Steuerberater"). Partner-Display-Name + Branding
 * (Logo, Akzentfarbe) folgen in SLC-104 (cross-tenant Read via SECURITY DEFINER
 * RPC).
 *
 * Diagnose-Karte ist Placeholder fuer SLC-105 — Klick zeigt Coming-Soon-Modal
 * (in V6 als simpler `disabled` Button mit Hinweis-Text dargestellt).
 */

export function PartnerClientWelcomeBlock({
  mandantCompanyName,
}: {
  mandantCompanyName: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Willkommen{mandantCompanyName ? `, ${mandantCompanyName}` : ""}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Empfohlen von Ihrem Steuerberater. Strategaize unterstuetzt Sie dabei,
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

      <p className="text-xs text-slate-400">Powered by Strategaize</p>
    </div>
  );
}
