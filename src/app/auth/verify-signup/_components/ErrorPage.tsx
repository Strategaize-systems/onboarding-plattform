/**
 * V7 SLC-133 MT-3 — Branch "Auto-Provisioning-Fehler" oder
 * "Magic-Link-Generation-Fehler". Zeigt eine ehrliche Fehler-Beschreibung
 * + Handlungs-Empfehlung. Mandant kann je nach `reason` Re-Signup oder
 * Passwort-Reset triggern.
 */

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type ErrorReason =
  | "email_conflict_cross_partner"
  | "user_create_failed"
  | "tenant_insert_failed"
  | "mapping_insert_failed"
  | "magic_link_failed";

const REASON_COPY: Record<
  ErrorReason,
  { title: string; description: string; nextAction: string; ctaLabel: string; ctaHref: string }
> = {
  email_conflict_cross_partner: {
    title: "E-Mail bereits registriert",
    description:
      "Diese E-Mail ist bereits einem anderen Strategaize-Mandanten zugeordnet.",
    nextAction:
      "Bitte melden Sie sich mit Ihrem bestehenden Konto an oder kontaktieren Sie Ihre Partner-Kanzlei.",
    ctaLabel: "Zur Anmeldung",
    ctaHref: "/login",
  },
  user_create_failed: {
    title: "Anmeldung konnte nicht abgeschlossen werden",
    description: "Beim Anlegen des Kontos ist ein technisches Problem aufgetreten.",
    nextAction:
      "Bitte versuchen Sie es in wenigen Minuten erneut, indem Sie den Signup-Prozess wiederholen.",
    ctaLabel: "Zur Anmeldung",
    ctaHref: "/login",
  },
  tenant_insert_failed: {
    title: "Mandanten-Anlage fehlgeschlagen",
    description: "Die Mandanten-Daten konnten nicht angelegt werden.",
    nextAction:
      "Bitte wenden Sie sich an Ihre Partner-Kanzlei oder versuchen Sie den Signup-Prozess erneut.",
    ctaLabel: "Zur Anmeldung",
    ctaHref: "/login",
  },
  mapping_insert_failed: {
    title: "Zuordnung fehlgeschlagen",
    description: "Die Zuordnung zu Ihrer Partner-Kanzlei konnte nicht angelegt werden.",
    nextAction:
      "Bitte wenden Sie sich an Ihre Partner-Kanzlei oder versuchen Sie den Signup-Prozess erneut.",
    ctaLabel: "Zur Anmeldung",
    ctaHref: "/login",
  },
  magic_link_failed: {
    title: "Anmeldung konnte nicht eingeleitet werden",
    description:
      "Ihr Mandanten-Konto wurde erfolgreich angelegt, der automatische Anmelde-Link konnte aber nicht erzeugt werden.",
    nextAction:
      'Bitte nutzen Sie auf der Anmelde-Seite den Link "Passwort vergessen?", um Ihr Passwort zu setzen.',
    ctaLabel: "Zur Anmeldung",
    ctaHref: "/login",
  },
};

export function ErrorPage({ reason }: { reason: ErrorReason }) {
  const copy = REASON_COPY[reason];

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="relative w-full max-w-md overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-red-500 to-red-300" />
        <CardHeader className="pt-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-full.png"
            alt="StrategAIze"
            className="mx-auto mb-2 h-12 w-auto"
          />
          <CardTitle className="text-2xl text-slate-900">{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-8">
          <p className="text-sm text-slate-700">{copy.nextAction}</p>
          <div className="flex flex-col gap-2 pt-2">
            <Link
              href={copy.ctaHref}
              className="rounded-md bg-brand-success px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-success-dark"
            >
              {copy.ctaLabel}
            </Link>
          </div>
          <div className="flex justify-center gap-4 pt-4 text-xs text-slate-500">
            <Link href="/datenschutz" className="hover:underline">
              Datenschutz
            </Link>
            <Link href="/impressum" className="hover:underline">
              Impressum
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
