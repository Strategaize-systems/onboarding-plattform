/**
 * V7 SLC-133 MT-3 — Branch "Token unbekannt / kein Match".
 * Strategaize-zentral, kein Partner-Branding (Verify-Link-Domain ist
 * Strategaize-eigen per DEC-133). Server-Component, kein Client-State.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function InvalidLinkPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="relative w-full max-w-md overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-slate-400 to-slate-300" />
        <CardHeader className="pt-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-full.png"
            alt="StrategAIze"
            className="mx-auto mb-2 h-12 w-auto"
          />
          <CardTitle className="text-2xl text-slate-900">
            Link ungültig oder bereits verwendet
          </CardTitle>
          <CardDescription>
            Dieser Bestätigungslink konnte nicht gefunden werden.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-8">
          <p className="text-sm text-slate-700">
            Möglicherweise ist der Link nicht vollständig kopiert worden oder
            wurde bereits in einem anderen Browser geöffnet. Wenn Sie bereits
            ein Passwort gesetzt haben, melden Sie sich direkt an. Andernfalls
            wenden Sie sich an Ihre Partner-Kanzlei für einen neuen Link.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button asChild className="w-full">
              <Link href="/login">Zur Anmeldung</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
