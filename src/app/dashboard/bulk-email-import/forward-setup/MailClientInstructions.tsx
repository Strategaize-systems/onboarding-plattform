"use client";

// V9.1 SLC-V9.1-D MT-1 — Schritt-fuer-Schritt-Weiterleitungsanleitung pro Mail-Client.
//
// Der GF richtet in SEINEM eigenen Postfach eine Weiterleitungs-Regel ein, die
// passende Emails an die Forward-Adresse (bulk-<slug>@<domain>) schickt. Pro
// gaengigem Client (Gmail, Outlook/Microsoft 365, IONOS Webmail) eine knappe
// Klick-Anleitung. Reines Lese-Material — keine Server-Interaktion.

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MailClientInstructionsProps {
  /** Ziel-Adresse, die in jeder Anleitung als Weiterleitungsziel genannt wird. */
  address: string;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-semibold text-brand-primary">
        {n}
      </span>
      <span className="pt-0.5 text-sm text-slate-700">{children}</span>
    </li>
  );
}

export function MailClientInstructions({ address }: MailClientInstructionsProps) {
  const target = <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">{address}</code>;

  return (
    <Tabs defaultValue="gmail" className="w-full">
      <TabsList>
        <TabsTrigger value="gmail">Gmail</TabsTrigger>
        <TabsTrigger value="outlook">Outlook / Microsoft 365</TabsTrigger>
        <TabsTrigger value="ionos">IONOS Webmail</TabsTrigger>
      </TabsList>

      <TabsContent value="gmail" className="pt-4">
        <ol className="space-y-3">
          <Step n={1}>
            Oeffne Gmail am Computer und klicke oben rechts auf das Zahnrad →{" "}
            <strong>Alle Einstellungen aufrufen</strong>.
          </Step>
          <Step n={2}>
            Wechsle zum Tab <strong>Weiterleitung und POP/IMAP</strong> und klicke
            auf <strong>Weiterleitungsadresse hinzufuegen</strong>.
          </Step>
          <Step n={3}>Trage als Weiterleitungsadresse {target} ein und bestaetige.</Step>
          <Step n={4}>
            Optional, fuer gezielte Weiterleitung: lege unter <strong>Filter und
            blockierte Adressen</strong> einen Filter an (z.B. nach Absender) und
            waehle <strong>Weiterleiten an</strong> die obige Adresse.
          </Step>
          <Step n={5}>
            Sende unten eine Test-Mail, um die Einrichtung zu pruefen.
          </Step>
        </ol>
      </TabsContent>

      <TabsContent value="outlook" className="pt-4">
        <ol className="space-y-3">
          <Step n={1}>
            Oeffne Outlook im Web und gehe zu <strong>Einstellungen</strong> →{" "}
            <strong>E-Mail</strong> → <strong>Regeln</strong>.
          </Step>
          <Step n={2}>
            Klicke auf <strong>Neue Regel hinzufuegen</strong> und vergib einen
            Namen (z.B. &bdquo;Strategaize Weiterleitung&ldquo;).
          </Step>
          <Step n={3}>
            Waehle eine Bedingung (z.B. <strong>Von</strong> einem bestimmten
            Absender) oder &bdquo;Auf alle Nachrichten anwenden&ldquo;.
          </Step>
          <Step n={4}>
            Als Aktion <strong>Weiterleiten an</strong> waehlen und {target} eintragen.
          </Step>
          <Step n={5}>Regel speichern und unten eine Test-Mail senden.</Step>
        </ol>
      </TabsContent>

      <TabsContent value="ionos" className="pt-4">
        <ol className="space-y-3">
          <Step n={1}>
            Melde dich im <strong>IONOS Webmail</strong> bzw. im IONOS-Kundenkonto an.
          </Step>
          <Step n={2}>
            Oeffne <strong>Einstellungen</strong> → <strong>Filterregeln</strong>{" "}
            (bzw. E-Mail → Auto-Weiterleitung).
          </Step>
          <Step n={3}>
            Lege eine neue Regel an und definiere bei Bedarf eine Bedingung
            (Absender, Betreff).
          </Step>
          <Step n={4}>
            Als Aktion <strong>Weiterleiten an</strong> die Adresse {target} setzen.
          </Step>
          <Step n={5}>Speichern und unten eine Test-Mail senden.</Step>
        </ol>
      </TabsContent>
    </Tabs>
  );
}
